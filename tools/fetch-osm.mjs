// Fetch the OpenStreetMap layer for a site: real outlines for water, woods, lawns, buildings,
// paths and car parks, so the map is to scale, plus a list of named points (toilets, statues,
// viewpoints) for the survey.
//
// Usage: node tools/fetch-osm.mjs <site-id> [--bbox south,west,north,east] [--margin metres]
//   Area: --bbox if given, else the tour's stops and waypoints plus a margin (default 250 m),
//   else the site's position in tours/index.json plus 700 m.
// Writes:
//   tours/<id>.map.json        the map layer the app draws (served; set "map": {"osm": ...} in the tour)
//   sites/<id>/osm-pois.json   named and tagged points for the survey (not served)
//
// Needs internet access to the Overpass API. Claude's workspace blocks it, so this normally runs
// in GitHub Actions: the "OpenStreetMap layer" workflow (.github/workflows/osm.yml) runs it and
// commits the result. Data © OpenStreetMap contributors, under the Open Database Licence (ODbL).
import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const id = args[0];
const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
if (!id) { console.error('Usage: node tools/fetch-osm.mjs <site-id> [--bbox s,w,n,e] [--margin m]'); process.exit(2); }

// ---------- area ----------
function bboxFor() {
  if (opt('--bbox')) return opt('--bbox').split(',').map(Number);
  const margin = +(opt('--margin') || 250);
  const tf = root + `tours/${id}.json`;
  let pts = [];
  if (fs.existsSync(tf)) {
    const t = JSON.parse(fs.readFileSync(tf, 'utf8'));
    pts = [...(t.stops || []), ...(t.waypoints || [])].map(s => s.pos).filter(Boolean);
  }
  let m = margin;
  if (!pts.length) {
    const idx = JSON.parse(fs.readFileSync(root + 'tours/index.json', 'utf8'));
    const e = idx.tours.find(x => x.id === id);
    if (!e?.pos) throw new Error(`No stops and no position in tours/index.json for ${id}: give --bbox`);
    pts = [e.pos]; m = Math.max(margin, 700);
  }
  const lat = pts.map(p => p[0]), lon = pts.map(p => p[1]);
  const dLat = m / 110574, dLon = m / (111320 * Math.cos(lat[0] * Math.PI / 180));
  return [Math.min(...lat) - dLat, Math.min(...lon) - dLon, Math.max(...lat) + dLat, Math.max(...lon) + dLon].map(v => +v.toFixed(5));
}

// ---------- fetch ----------
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
function query([s, w, n, e]) {
  const b = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:120];
(
  way["highway"]${b};
  way["building"]${b};
  way["natural"~"^(water|wood|scrub|grassland|wetland|heath)$"]${b};
  way["water"]${b};
  way["waterway"]${b};
  way["landuse"~"^(forest|grass|meadow|reservoir|basin|orchard|farmland|allotments|recreation_ground|village_green|cemetery)$"]${b};
  way["leisure"~"^(garden|park|pitch|playground|nature_reserve)$"]${b};
  way["amenity"~"^(parking|toilets|cafe|restaurant)$"]${b};
  way["historic"]${b};
  way["tourism"]${b};
  way["man_made"]${b};
  way["barrier"~"^(wall|city_wall|ha-ha)$"]${b};
  way["entrance"]${b};
  relation["natural"~"^(water|wood|scrub)$"]${b};
  relation["water"]${b};
  relation["landuse"~"^(forest|grass|meadow|reservoir|basin)$"]${b};
  relation["leisure"~"^(garden|park)$"]${b};
  relation["building"]${b};
  relation["amenity"="parking"]${b};
  node["amenity"]${b};
  node["tourism"]${b};
  node["historic"]${b};
  node["man_made"]${b};
  node["leisure"]${b};
  node["entrance"]${b};
  node["barrier"~"^(gate|entrance|turnstile)$"]${b};
  node["natural"~"^(tree|peak|spring)$"]["name"]${b};
);
out geom;`;
}
async function fetchOverpass(q) {
  let last;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'TourGuide/1.0 (github.com/EDixon/Tour-guide)' } });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return await r.json();
    } catch (e) { last = e; console.error(`  ${e.message}, trying the next server`); }
  }
  throw last;
}

// ---------- classify ----------
const PATHS = /^(footway|path|pedestrian|bridleway|steps|cycleway|track|corridor)$/;
const ROADS = /^(service|unclassified|residential|tertiary|secondary|primary|trunk|living_street|road)$/;
function kindOf(t, closed) {
  if (t.building && closed) return 'building';
  if (t.highway) return PATHS.test(t.highway) ? 'path' : ROADS.test(t.highway) ? 'road' : null;
  if (t.amenity === 'parking' && closed) return 'parking';
  if (closed && (t.natural === 'water' || t.water || /^(reservoir|basin)$/.test(t.landuse || '') || /^(riverbank|dock)$/.test(t.waterway || ''))) return 'water';
  if (t.waterway) return 'waterline';
  if (!closed && t.barrier) return 'wall';
  if (!closed) return null;
  // The outline of the whole attraction is drawn as a faint backdrop, not as a garden over everything.
  if (t.tourism === 'attraction' || t.historic === 'garden' || t.boundary) return 'site';
  if (/^(wood|scrub)$/.test(t.natural || '') || /^(forest|orchard)$/.test(t.landuse || '')) return 'wood';
  if (t.leisure === 'garden') return 'garden';
  if (t.leisure === 'playground') return 'playground';
  if (/^(grass|meadow|village_green|recreation_ground|cemetery)$/.test(t.landuse || '') || /^(grassland|heath)$/.test(t.natural || '') || t.leisure === 'pitch') return 'lawn';
  if (t.leisure === 'park' || t.leisure === 'nature_reserve') return 'park';
  if (t.landuse === 'farmland') return 'field';
  if (t.natural === 'wetland') return 'lawn';
  return null;
}
const WATER_WIDTH = { river: 12, canal: 8, stream: 3, ditch: 2, drain: 2 };

// ---------- geometry ----------
const R5 = (v) => +v.toFixed(6);
function simplify(pts, tolM = 0.8) {
  if (pts.length < 3) return pts;
  const lat0 = pts[0][0] * Math.PI / 180;
  const xy = pts.map(([la, lo]) => [lo * 111320 * Math.cos(lat0), la * 110574]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, dmax = 0;
    const [x1, y1] = xy[a], [x2, y2] = xy[b];
    const L = Math.hypot(x2 - x1, y2 - y1);
    for (let i = a + 1; i < b; i++) {
      // Distance from the chord, or from the point itself when the chord closes a ring.
      const d = L < 0.01 ? Math.hypot(xy[i][0] - x1, xy[i][1] - y1) : Math.abs((x2 - x1) * (y1 - xy[i][1]) - (x1 - xy[i][0]) * (y2 - y1)) / L;
      if (d > dmax) { dmax = d; best = i; }
    }
    if (dmax > tolM && best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// Sutherland–Hodgman clip of a ring to the box, so big woods and fields don't bloat the file.
function clipRing(ring, [s, w, n, e]) {
  const edges = [[p => p[0] >= s, (a, b) => cut(a, b, 0, s)], [p => p[0] <= n, (a, b) => cut(a, b, 0, n)], [p => p[1] >= w, (a, b) => cut(a, b, 1, w)], [p => p[1] <= e, (a, b) => cut(a, b, 1, e)]];
  function cut(a, b, k, v) { const t = (v - a[k]) / (b[k] - a[k]); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; }
  let out = ring;
  for (const [inside, inter] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) { if (!inside(prev)) out.push(inter(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(inter(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}
// Lines: keep the runs inside the box (plus one point either side, so they reach the edge).
function clipLine(line, [s, w, n, e]) {
  const inside = p => p[0] >= s && p[0] <= n && p[1] >= w && p[1] <= e;
  const runs = []; let cur = null;
  line.forEach((p, i) => {
    if (inside(p)) { if (!cur) { cur = []; if (i > 0) cur.push(line[i - 1]); } cur.push(p); }
    else if (cur) { cur.push(p); runs.push(cur); cur = null; }
  });
  if (cur) runs.push(cur);
  return runs.filter(r => r.length > 1);
}
// Join relation member ways into closed rings by matching end points.
function assembleRings(ways) {
  const segs = ways.map(w => w.map(p => [...p]));
  const rings = [];
  const key = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);
  while (segs.length) {
    let ring = segs.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i], end = key(ring[ring.length - 1]);
        if (key(s[0]) === end) { ring = ring.concat(s.slice(1)); }
        else if (key(s[s.length - 1]) === end) { ring = ring.concat(s.slice(0, -1).reverse()); }
        else continue;
        segs.splice(i, 1); grew = true; break;
      }
    }
    if (ring.length > 3) rings.push(ring);
  }
  return rings;
}

// ---------- main ----------
const bbox = bboxFor();
console.log(`Area ${bbox.join(',')} (south, west, north, east)`);
const data = await fetchOverpass(query(bbox));
const features = [], pois = [];
const POI_TAGS = ['amenity', 'tourism', 'historic', 'man_made', 'leisure', 'entrance', 'barrier', 'natural', 'memorial', 'artwork_type', 'artist_name', 'start_date', 'heritage', 'listed_status', 'HE_ref', 'wikidata', 'wikipedia', 'description', 'inscription', 'access', 'fee', 'wheelchair', 'opening_hours', 'capacity', 'operator', 'building', 'highway', 'surface'];
const tagsFor = (t) => Object.fromEntries(Object.entries(t).filter(([k]) => POI_TAGS.includes(k) || k.startsWith('name')));
const centre = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]).map(R5);

for (const el of data.elements) {
  const t = el.tags || {};
  if (el.type === 'node') {
    if (Object.keys(t).length) pois.push({ osm: `node/${el.id}`, pos: [R5(el.lat), R5(el.lon)], tags: tagsFor(t) });
    continue;
  }
  let rings = [], line = null;
  if (el.type === 'way' && el.geometry) {
    const g = el.geometry.map(p => [p.lat, p.lon]);
    const closed = g.length > 3 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1];
    if (closed && !t.highway && !t.barrier && !(t.waterway && !/^(riverbank|dock)$/.test(t.waterway))) rings = [g]; else line = g;
  } else if (el.type === 'relation' && el.members) {
    const outer = el.members.filter(m => m.type === 'way' && m.geometry && m.role !== 'inner').map(m => m.geometry.map(p => [p.lat, p.lon]));
    const inner = el.members.filter(m => m.type === 'way' && m.geometry && m.role === 'inner').map(m => m.geometry.map(p => [p.lat, p.lon]));
    rings = [...assembleRings(outer), ...assembleRings(inner)];
  }
  const kind = kindOf(t, rings.length > 0);
  const named = t.name || t.historic || t.tourism || t.amenity || t.man_made || t.entrance;
  if (named && el.type === 'way' && !t.highway && !(t.landuse || t.natural === 'wood')) {
    const g = rings[0] || line;
    if (g) pois.push({ osm: `way/${el.id}`, pos: centre(g), tags: tagsFor(t) });
  }
  if (!kind) continue;
  const f = { kind };
  if (t.name) f.name = t.name;
  if (kind === 'path' && t.highway === 'steps') f.steps = true;
  if (kind === 'waterline') f.width = WATER_WIDTH[t.waterway] ?? 3;
  if (rings.length) {
    const rs = rings.map(r => simplify(clipRing(r, bbox))).filter(r => r.length > 2).map(r => r.map(p => [R5(p[0]), R5(p[1])]));
    if (!rs.length) continue;
    f.rings = rs;
    features.push(f);
  } else if (line) {
    for (const run of clipLine(line, bbox)) features.push({ ...f, line: simplify(run, 0.5).map(p => [R5(p[0]), R5(p[1])]) });
  }
}

// Drawing order: backdrops, then ground cover largest first (so small gardens sit on top of big
// lawns), then water, roads, paths, walls and buildings.
const LAYER = { site: 0, field: 1, park: 2, lawn: 3, garden: 3, playground: 3, wood: 3, parking: 3, water: 4, waterline: 5, road: 6, path: 7, wall: 8, building: 9 };
const area = (f) => f.rings ? Math.abs(f.rings[0].reduce((s, p, i, r) => { const q = r[(i + 1) % r.length]; return s + p[1] * q[0] - q[1] * p[0]; }, 0)) : 0;
features.sort((a, b) => LAYER[a.kind] - LAYER[b.kind] || (LAYER[a.kind] === 3 ? area(b) - area(a) : 0));
const layer = {
  attribution: '© OpenStreetMap contributors',
  licence: 'Open Database Licence (ODbL) 1.0, https://www.openstreetmap.org/copyright',
  fetched: new Date().toISOString().slice(0, 10),
  bbox,
  features,
};
const out = root + `tours/${id}.map.json`;
fs.writeFileSync(out, '{\n' + Object.entries(layer).filter(([k]) => k !== 'features').map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')
  + '\n  "features": [\n' + features.map(f => '    ' + JSON.stringify(f)).join(',\n') + '\n  ]\n}\n');
fs.mkdirSync(root + `sites/${id}`, { recursive: true });
fs.writeFileSync(root + `sites/${id}/osm-pois.json`, JSON.stringify({ attribution: layer.attribution, licence: layer.licence, fetched: layer.fetched, pois }, null, 1) + '\n');
const count = {}; for (const f of features) count[f.kind] = (count[f.kind] || 0) + 1;
console.log(`Wrote ${out}: ${features.length} features (${Object.entries(count).map(([k, n]) => `${k} ${n}`).join(', ')}), ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
console.log(`Wrote sites/${id}/osm-pois.json: ${pois.length} points`);
