// Rebuild a tour's outdoor path network from the OpenStreetMap footpaths in tours/<id>.map.json,
// so walking distances follow the real paths instead of straight lines between guessed waypoints.
//
// Usage: node tools/osm-network.mjs <site-id> [--write]
//   Without --write it only prints a report (links, waypoints, stops snapped far from a path).
//
// What it does:
//   - joins the OSM path and road lines into a graph (ends within 4 m of another line are joined to it,
//     and lines that cross are split where they cross)
//   - snaps every outdoor stop to the nearest path, with a short link from the stop to it
//   - keeps only the part connected to the tour's start, and drops dead-end spurs that lead to no stop
//   - turns each run between junctions into links, adding a waypoint wherever the path bends by more
//     than 6 m, so the straight-line length the planner uses stays close to the walked length
//   - copies OSM steps ({"steps": true}) on to the links
//   - keeps links inside buildings and links through a door (door = building id) as they are
// Names and scenic scores come from sites/<id>/network.json:
//   {"corridors": [{"name": "Long Water, west bank", "line": [[lat, lon], ...], "within": 15, "scenic": 0.95}],
//    "landmarks": [{"name": "the Orangery", "pos": [lat, lon]}],
//    "links": [["a", "b", 0.3, "name", null, {"steps": true}]],     // extra links OSM lacks
//    "lines": [{"line": [[lat, lon], ...], "steps": false, "note": "why"}],   // paths OSM lacks, joined like OSM paths
//    "exclude": [[lat, lon, radius_m]],                               // drop OSM paths near here (private, closed)
//    "steps": [[lat, lon]]}                                           // mark the link nearest each point as steps
// A link with no corridor is named "Path past <nearest landmark or stop>". Scenic without a corridor:
// 0.9 beside water, 0.55 in woodland, 0.5 across lawns and gardens, 0.2 on roads, 0.4 otherwise.
import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const id = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!id) { console.error('Usage: node tools/osm-network.mjs <site-id> [--write]'); process.exit(2); }
const tourFile = root + `tours/${id}.json`;
const tour = JSON.parse(fs.readFileSync(tourFile, 'utf8'));
const map = JSON.parse(fs.readFileSync(root + (tour.map?.osm || `tours/${id}.map.json`), 'utf8'));
const cfgFile = root + `sites/${id}/network.json`;
const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};

const SNAP = 4, MERGE = 1, BEND = 10;

// ---------- local projection (metres) ----------
const all = map.features.flatMap(f => f.line || f.rings?.[0] || []);
const lat0 = all.reduce((s, p) => s + p[0], 0) / all.length, lon0 = all.reduce((s, p) => s + p[1], 0) / all.length;
const KX = 111320 * Math.cos(lat0 * Math.PI / 180), KY = 110574;
const xy = ([la, lo]) => [(lo - lon0) * KX, (la - lat0) * KY];
const ll = ([x, y]) => [+(y / KY + lat0).toFixed(6), +(x / KX + lon0).toFixed(6)];
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearestOnSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { q, t, d: d2(p, q) };
}
function segX(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? { t, u, q: [a[0] + t * r[0], a[1] + t * r[1]] } : null;
}
const inRing = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const distToRing = (p, ring) => { let m = Infinity; for (let i = 1; i < ring.length; i++) m = Math.min(m, nearestOnSeg(p, ring[i - 1], ring[i]).d); return m; };
const distToLine = (p, line) => { let m = Infinity; for (let i = 1; i < line.length; i++) m = Math.min(m, nearestOnSeg(p, line[i - 1], line[i]).d); return m; };

// ---------- lines ----------
const excl = (cfg.exclude || []).map(([la, lo, r]) => [xy([la, lo]), r]);
let lines = map.features.filter(f => (f.kind === 'path' || f.kind === 'road') && f.line?.length > 1)
  .map(f => ({ pts: f.line.map(xy), steps: !!f.steps, road: f.kind === 'road', name: f.name || '' }))
  .filter(l => !excl.some(([c, r]) => l.pts.some(p => d2(p, c) < r)));
for (const l of cfg.lines || []) lines.push({ pts: l.line.map(xy), steps: !!l.steps, road: false, name: l.name || '' });
// Only paths inside the site outline (the OSM "site" area, plus 30 m), if there is one.
const sites = map.features.filter(f => f.kind === 'site').flatMap(f => f.rings.map(r => r.map(xy)));
if (sites.length) {
  const inSite = (p) => sites.some(r => inRing(p, r) || distToRing(p, r) < 30);
  lines = lines.flatMap(l => {
    const runs = []; let run = [];
    for (const p of l.pts) { if (inSite(p)) run.push(p); else { if (run.length > 1) runs.push(run); run = []; } }
    if (run.length > 1) runs.push(run);
    return runs.map(pts => ({ ...l, pts }));
  });
}

// Split points per line: [segment index, t, point]
const cuts = lines.map(() => []);
// 1. line ends near another line: join them there
lines.forEach((l, i) => {
  for (const end of [0, l.pts.length - 1]) {
    const p = l.pts[end];
    let best = null;
    lines.forEach((m, j) => {
      if (j === i) return;
      for (let k = 1; k < m.pts.length; k++) {
        const r = nearestOnSeg(p, m.pts[k - 1], m.pts[k]);
        if (r.d < SNAP && (!best || r.d < best.d)) best = { ...r, j, k };
      }
    });
    if (best) { cuts[best.j].push([best.k - 1, best.t, best.q]); l.pts[end] = best.q; }
  }
});
// 2. lines that cross: split both
for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
  const A = lines[i].pts, B = lines[j].pts;
  for (let a = 1; a < A.length; a++) for (let b = 1; b < B.length; b++) {
    const x = segX(A[a - 1], A[a], B[b - 1], B[b]);
    if (x) { cuts[i].push([a - 1, x.t, x.q]); cuts[j].push([b - 1, x.u, x.q]); }
  }
}

// ---------- graph ----------
const nodes = []; // {p, stop?}
function nodeAt(p) {
  for (let i = 0; i < nodes.length; i++) if (d2(nodes[i].p, p) < MERGE) return i;
  nodes.push({ p }); return nodes.length - 1;
}
const edges = []; // {a, b, pts, steps, road, name}
lines.forEach((l, i) => {
  // Insert cut points into the polyline, then break it at every cut and at its ends.
  const pts = [], isCut = [];
  for (let k = 0; k < l.pts.length; k++) {
    pts.push(l.pts[k]); isCut.push(k === 0 || k === l.pts.length - 1);
    for (const [s, , q] of cuts[i].filter(c => c[0] === k).sort((a, b) => a[1] - b[1])) { pts.push(q); isCut.push(true); }
  }
  let start = 0;
  for (let k = 1; k < pts.length; k++) if (isCut[k]) {
    const run = pts.slice(start, k + 1);
    if (run.length > 1 && d2(run[0], run.at(-1)) + run.length > 0) {
      const a = nodeAt(run[0]), b = nodeAt(run.at(-1));
      if (a !== b) edges.push({ a, b, pts: run, steps: l.steps, road: l.road, name: l.name });
    }
    start = k;
  }
});

// ---------- snap stops ----------
const building = (s) => !!s.building;
const outdoor = tour.stops.filter(s => !building(s));
const far = [];
for (const s of outdoor) {
  const p = xy(s.pos);
  let best = null;
  edges.forEach((e, ei) => { for (let k = 1; k < e.pts.length; k++) { const r = nearestOnSeg(p, e.pts[k - 1], e.pts[k]); if (!best || r.d < best.d) best = { ...r, ei, k }; } });
  if (!best) continue;
  if (best.d > 40) far.push(`${s.id} is ${best.d.toFixed(0)} m from the nearest path`);
  const e = edges[best.ei];
  // Split the edge at the snap point.
  let n;
  if (d2(best.q, e.pts[0]) < MERGE) n = e.a;
  else if (d2(best.q, e.pts.at(-1)) < MERGE) n = e.b;
  else {
    n = nodeAt(best.q);
    const A = [...e.pts.slice(0, best.k), best.q], B = [best.q, ...e.pts.slice(best.k)];
    edges.splice(best.ei, 1, { ...e, b: n, pts: A }, { ...e, a: n, pts: B });
  }
  const sn = nodes.length; nodes.push({ p, stop: s.id });
  edges.push({ a: sn, b: n, pts: [p, best.q], steps: false, road: false, name: '', connector: true, len: best.d });
}

// ---------- keep the part connected to the stops ----------
const adj = () => { const m = nodes.map(() => []); edges.forEach((e, i) => { m[e.a].push(i); m[e.b].push(i); }); return m; };
let A = adj();
const startNode = nodes.findIndex(n => n.stop === tour.start);
if (startNode < 0) { console.error(`start ${tour.start} is not an outdoor stop`); process.exit(1); }
const seen = new Set([startNode]), q = [startNode];
while (q.length) { const u = q.pop(); for (const ei of A[u]) { const e = edges[ei]; const v = e.a === u ? e.b : e.a; if (!seen.has(v)) { seen.add(v); q.push(v); } } }
let keep = edges.map(e => seen.has(e.a));
const unreached = outdoor.filter(s => !seen.has(nodes.findIndex(n => n.stop === s.id))).map(s => s.id);
// Prune dead ends that lead to no stop.
for (let changed = true; changed;) {
  changed = false;
  const deg = nodes.map(() => 0);
  edges.forEach((e, i) => { if (keep[i]) { deg[e.a]++; deg[e.b]++; } });
  edges.forEach((e, i) => {
    if (!keep[i]) return;
    for (const v of [e.a, e.b]) if (deg[v] === 1 && nodes[v].stop == null) { keep[i] = false; changed = true; return; }
  });
}
let E = edges.filter((_, i) => keep[i]);

// ---------- chains between junctions, simplified ----------
const deg = nodes.map(() => 0);
E.forEach(e => { deg[e.a]++; deg[e.b]++; });
const fixed = (v) => deg[v] !== 2 || nodes[v].stop != null;
const byNode = nodes.map(() => []);
E.forEach((e, i) => { byNode[e.a].push(i); byNode[e.b].push(i); });
const used = new Set(), chains = [];
const same = (e, f) => e.steps === f.steps && e.road === f.road && !!e.connector === !!f.connector;
for (let i = 0; i < E.length; i++) {
  if (used.has(i)) continue;
  // Walk back to a fixed node or a change of kind, then forward.
  let cur = i, from = E[i].a;
  for (let guard = 0; guard < 10000; guard++) {
    if (fixed(from)) break;
    const nxt = byNode[from].find(j => j !== cur);
    if (nxt == null || !same(E[nxt], E[i])) break;
    const e = E[nxt]; from = e.a === from ? e.b : e.a; cur = nxt;
    if (cur === i) break;
  }
  // Now walk forward from `from` along `cur`.
  const pts = [nodes[from].p], via = [from];
  let at = from, ei = cur;
  for (let guard = 0; guard < 10000; guard++) {
    used.add(ei);
    const e = E[ei];
    const fwd = e.a === at;
    const seg = fwd ? e.pts : [...e.pts].reverse();
    pts.push(...seg.slice(1));
    at = fwd ? e.b : e.a; via.push(at);
    if (fixed(at)) break;
    const nxt = byNode[at].find(j => j !== ei && !used.has(j));
    if (nxt == null || !same(E[nxt], e)) break;
    ei = nxt;
  }
  chains.push({ a: from, b: at, pts, steps: E[cur].steps, road: E[cur].road, connector: !!E[cur].connector, name: E[cur].name });
}
function dp(pts, tol) {
  if (pts.length < 3) return [0, pts.length - 1];
  const keepI = new Set([0, pts.length - 1]), st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let bi = -1, bd = tol;
    for (let k = a + 1; k < b; k++) { const r = nearestOnSeg(pts[k], pts[a], pts[b]); if (r.d > bd) { bd = r.d; bi = k; } }
    if (bi > -1) { keepI.add(bi); st.push([a, bi], [bi, b]); }
  }
  return [...keepI].sort((x, y) => x - y);
}

// ---------- naming and scoring ----------
const water = map.features.filter(f => f.kind === 'water').flatMap(f => f.rings.map(r => r.map(xy)));
const waterLines = map.features.filter(f => f.kind === 'waterline').map(f => f.line.map(xy));
const woods = map.features.filter(f => f.kind === 'wood').flatMap(f => f.rings.slice(0, 1).map(r => r.map(xy)));
const opens = map.features.filter(f => f.kind === 'lawn' || f.kind === 'garden').flatMap(f => f.rings.slice(0, 1).map(r => r.map(xy)));
const corridors = (cfg.corridors || []).map(c => ({ ...c, pts: c.line.map(xy), within: c.within ?? 15 }));
const landmarks = [...(cfg.landmarks || []).map(l => ({ name: l.name, p: xy(l.pos) })),
  ...tour.stops.filter(s => !building(s) && s.kind !== 'intro').map(s => ({ name: s.short && !s.short.includes('.') ? s.short : s.name, p: xy(s.pos) }))];
function describe(pts, road, osmName) {
  const samples = [];
  for (let k = 1; k < pts.length; k++) for (const t of [0.15, 0.5, 0.85]) samples.push([pts[k - 1][0] + t * (pts[k][0] - pts[k - 1][0]), pts[k - 1][1] + t * (pts[k][1] - pts[k - 1][1])]);
  const cor = corridors.find(c => samples.every(p => distToLine(p, c.pts) <= c.within));
  const mid = samples[Math.floor(samples.length / 2)];
  let scenic;
  if (cor?.scenic != null) scenic = cor.scenic;
  else if (road) scenic = 0.2;
  else {
    const nearWater = samples.filter(p => water.some(r => distToRing(p, r) < 25 || inRing(p, r)) || waterLines.some(l => distToLine(p, l) < 20)).length / samples.length;
    const inWood = samples.filter(p => woods.some(r => inRing(p, r))).length / samples.length;
    const inOpen = samples.filter(p => opens.some(r => inRing(p, r))).length / samples.length;
    scenic = nearWater > 0.6 ? 0.9 : inWood > 0.5 ? 0.55 : inOpen > 0.5 ? 0.5 : 0.4;
  }
  let name = cor?.name || osmName;
  if (!name) {
    const lm = landmarks.reduce((b, l) => (d2(l.p, mid) < (b ? d2(b.p, mid) : Infinity) ? l : b), null);
    name = lm ? `Path past ${lm.name.replace(/^the /i, 'the ')}` : '';
  }
  return { name, scenic };
}

// ---------- output ----------
const stopIds = new Set(tour.stops.map(s => s.id));
const wps = new Map(); // node index -> waypoint id
let wn = 0;
const wpFor = (v, name) => {
  if (nodes[v].stop) return nodes[v].stop;
  if (!wps.has(v)) wps.set(v, { id: `w${++wn}`, name, pos: ll(nodes[v].p) });
  return wps.get(v).id;
};
const paths = [];
const pointNode = new Map();
for (const c of chains) {
  const keepI = c.connector ? [0, c.pts.length - 1] : dp(c.pts, BEND);
  const { name, scenic } = c.connector ? { name: '', scenic: 0.3 } : describe(c.pts, c.road, c.name);
  let prev = wpFor(c.a, name);
  for (let k = 1; k < keepI.length; k++) {
    const last = k === keepI.length - 1;
    let id;
    if (last) id = wpFor(c.b, name);
    else {
      const p = c.pts[keepI[k]];
      const key = p.join();
      if (!pointNode.has(key)) { const v = nodes.length; nodes.push({ p }); pointNode.set(key, v); }
      id = wpFor(pointNode.get(key), name);
    }
    if (prev !== id) paths.push([prev, id, scenic, name, null, ...(c.steps ? [{ steps: true }] : [])]);
    prev = id;
  }
}
// Steps marked by hand: the nearest link to each point.
for (const pt of cfg.steps || []) {
  const p = xy(pt);
  let best = null;
  const P = (id) => xy((tour.stops.find(s => s.id === id) || [...wps.values()].find(w => w.id === id)).pos);
  paths.forEach((l, i) => { const r = nearestOnSeg(p, P(l[0]), P(l[1])); if (!best || r.d < best.d) best = { d: r.d, i }; });
  if (best) { const l = paths[best.i]; while (l.length < 5) l.push(null); l[5] = { steps: true }; }
}
// Name waypoints after the links they join, for "To <waypoint>" directions.
const kept = tour.paths.filter(([a, b, , , door]) => door || building(tour.stops.find(s => s.id === a) || {}) || building(tour.stops.find(s => s.id === b) || {}));
const extra = cfg.links || [];
const newPaths = [...paths, ...extra, ...kept];
const waypoints = [...wps.values()].map(w => ({ id: w.id, name: w.name.replace(/^Path past /, 'Path by '), pos: w.pos }));

// ---------- report ----------
const len = (l) => { const P = (id) => (tour.stops.find(s => s.id === id) || waypoints.find(w => w.id === id)).pos; return d2(xy(P(l[0])), xy(P(l[1]))); };
const total = paths.reduce((s, l) => s + len(l), 0);
console.log(`${waypoints.length} waypoints, ${paths.length} OSM links (${(total / 1000).toFixed(1)} km), ${extra.length} extra, ${kept.length} kept (indoor or door)`);
console.log(`steps on ${paths.filter(l => l[5]?.steps).length} links`);
if (far.length) console.log('Far from a path:\n  ' + far.join('\n  '));
if (unreached.length) console.log('Not connected to the start through OSM paths (add "links" in network.json): ' + unreached.join(', '));
const unnamed = new Set(paths.filter(l => l[3].startsWith('Path past')).map(l => l[3]));
console.log(`${unnamed.size} fallback names: ${[...unnamed].slice(0, 40).join('; ')}`);
if (WRITE) {
  tour.waypoints = waypoints;
  tour.paths = newPaths;
  fs.writeFileSync(tourFile, JSON.stringify(tour, null, 1) + '\n');
  console.log(`wrote ${tourFile}`);
}
