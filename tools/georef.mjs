// Georeference a picture of a site map (a leaflet, a guidebook plan, a photo of the board on site)
// against real positions, so what is drawn on it can be placed on the real map.
//
// Visitor maps are rarely to scale: they are often oblique bird's-eye views (a perspective
// projection), rotated, and stretched where the artist wanted room. The fit is in two parts:
//   1. a projective transform (homography), which models a perspective view of flat ground;
//   2. a smoothed thin-plate spline on what is left, which absorbs the artist's local stretching.
// Leave-one-out errors (each control point predicted from all the others) show how far to trust it.
//
// Usage:
//   node tools/georef.mjs fit <control.json> [--smooth 1] [--no-tps] [--out transform.json]
//   node tools/georef.mjs apply <transform.json> <features.json> [--out geo.json]
//   node tools/georef.mjs chain <blobs.json> [--gap 60]     order route dashes into a line (pixels)
//
// control.json: {"image": "...", "points": [{"label": "Orangery", "px": [x, y], "pos": [lat, lon]}, ...]}
//   At least 6 points spread over the whole map; 10-20 is better. Use things whose real position is
//   certain (listing entries, OpenStreetMap buildings) and whose spot on the picture is exact.
//   A point can carry "use": false to keep it in the report without fitting to it.
// features.json: {"features": [{"label": "...", "px": [x, y]} | {"label": "...", "line": [[x, y], ...]}]}
//
// The picture itself stays in sites/<id>/inputs/ (not in the repo). Only positions derived from it
// go into the tour, and the source is cited in sources.md.
import fs from 'node:fs';

// ---------- small linear algebra ----------
function solve(A, b) { // Gaussian elimination with partial pivoting; A is n×n, b is n (or n×m)
  const n = A.length, m = Array.isArray(b[0]) ? b[0].length : 1;
  const M = A.map((row, i) => [...row, ...(m === 1 && !Array.isArray(b[0]) ? [b[i]] : b[i])]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) throw new Error('singular system: are some control points duplicated or in a line?');
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < n + m; k++) M[r][k] -= f * M[c][k]; }
  }
  const out = M.map((row, i) => row.slice(n).map(v => v / M[i][i]));
  return m === 1 && !Array.isArray(b[0]) ? out.map(r => r[0]) : out;
}
function leastSquares(rows, rhs) { // normal equations
  const n = rows[0].length;
  const AtA = Array.from({ length: n }, () => new Array(n).fill(0)), Atb = new Array(n).fill(0);
  rows.forEach((r, k) => { for (let i = 0; i < n; i++) { Atb[i] += r[i] * rhs[k]; for (let j = 0; j < n; j++) AtA[i][j] += r[i] * r[j]; } });
  return solve(AtA, Atb);
}

// ---------- local metric frame ----------
export function frame(points) {
  const lat0 = points.reduce((s, p) => s + p.pos[0], 0) / points.length;
  const lon0 = points.reduce((s, p) => s + p.pos[1], 0) / points.length;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  return { lat0, lon0, kx, ky };
}
const toM = (F, [lat, lon]) => [(lon - F.lon0) * F.kx, (lat - F.lat0) * F.ky];
const toLL = (F, [x, y]) => [F.lat0 + y / F.ky, F.lon0 + x / F.kx];

// ---------- homography ----------
function normaliser(pts) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1;
  const s = Math.SQRT2 / d;
  return { f: ([x, y]) => [(x - cx) * s, (y - cy) * s], inv: ([x, y]) => [x / s + cx, y / s + cy] };
}
export function fitHomography(src, dst) {
  if (src.length < 4) throw new Error('a perspective fit needs at least 4 points (6+ recommended)');
  const ns = normaliser(src), nd = normaliser(dst);
  const rows = [], rhs = [];
  src.forEach((p, i) => {
    const [x, y] = ns.f(p), [X, Y] = nd.f(dst[i]);
    rows.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); rhs.push(X);
    rows.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); rhs.push(Y);
  });
  const h = leastSquares(rows, rhs);
  return (p) => { const [x, y] = ns.f(p); const w = h[6] * x + h[7] * y + 1; return nd.inv([(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]); };
}

// ---------- thin-plate spline (smoothed) on the residuals ----------
const U = (r) => (r < 1e-9 ? 0 : r * r * Math.log(r));
export function fitTPS(src, vals, smooth = 1) {
  const n = src.length, ns = normaliser(src), P = src.map(ns.f);
  const A = Array.from({ length: n + 3 }, () => new Array(n + 3).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = U(Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1])) + (i === j ? smooth : 0);
    A[i][n] = A[n][i] = 1; A[i][n + 1] = A[n + 1][i] = P[i][0]; A[i][n + 2] = A[n + 2][i] = P[i][1];
  }
  const B = [...vals.map(v => [...v]), [0, 0], [0, 0], [0, 0]];
  const W = solve(A, B);
  return (p) => {
    const q = ns.f(p);
    let dx = W[n][0] + W[n + 1][0] * q[0] + W[n + 2][0] * q[1], dy = W[n][1] + W[n + 1][1] * q[0] + W[n + 2][1] * q[1];
    for (let i = 0; i < n; i++) { const u = U(Math.hypot(q[0] - P[i][0], q[1] - P[i][1])); dx += W[i][0] * u; dy += W[i][1] * u; }
    return [dx, dy];
  };
}

// ---------- the whole model ----------
export function fitModel(points, { tps = true, smooth = 1 } = {}) {
  const F = frame(points);
  const src = points.map(p => p.px), dst = points.map(p => toM(F, p.pos));
  const H = fitHomography(src, dst);
  let T = null;
  if (tps && points.length >= 6) T = fitTPS(src, src.map((p, i) => { const h = H(p); return [dst[i][0] - h[0], dst[i][1] - h[1]]; }), smooth);
  const toMetres = (px) => { const h = H(px); if (!T) return h; const d = T(px); return [h[0] + d[0], h[1] + d[1]]; };
  return { F, toMetres, toLatLon: (px) => toLL(F, toMetres(px)) };
}
export function leaveOneOut(points, opts) {
  return points.map((p, i) => {
    const rest = points.filter((_, j) => j !== i);
    const m = fitModel(rest, opts);
    const F = frame(points);
    const [x, y] = toM(F, m.toLatLon(p.px)), [X, Y] = toM(F, p.pos);
    return { label: p.label, error: Math.hypot(x - X, y - Y) };
  });
}

// Order route dashes (blob centres) into a line: start at an end, then nearest neighbour, splitting
// into separate runs where the next dash is further than `gap` pixels.
export function chain(pts, gap = 60) {
  const left = pts.map(p => [...p]);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const runs = [];
  while (left.length) {
    // start from the point with the fewest close neighbours (an end of the line)
    let si = 0, best = Infinity;
    left.forEach((p, i) => { const k = left.filter(q => q !== p && d(p, q) < gap).length; if (k < best) { best = k; si = i; } });
    const run = [left.splice(si, 1)[0]];
    for (;;) {
      let ni = -1, nd = Infinity;
      left.forEach((p, i) => { const dd = d(run[run.length - 1], p); if (dd < nd) { nd = dd; ni = i; } });
      if (ni < 0 || nd > gap) break;
      run.push(left.splice(ni, 1)[0]);
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}

// ---------- CLI ----------
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [cmd, a, b] = process.argv.slice(2);
  const opt = (k, dflt) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : dflt; };
  const has = (k) => process.argv.includes(k);
  const r6 = (v) => +v.toFixed(6);
  if (cmd === 'fit') {
    const ctl = JSON.parse(fs.readFileSync(a, 'utf8'));
    const all = ctl.points, use = all.filter(p => p.use !== false);
    const opts = { tps: !has('--no-tps'), smooth: +opt('--smooth', 1) };
    const loo = leaveOneOut(use, opts), looH = leaveOneOut(use, { tps: false });
    const m = fitModel(use, opts);
    const F = frame(use);
    console.log(`Control points: ${use.length} used${all.length > use.length ? `, ${all.length - use.length} only checked` : ''}.`);
    console.log('Leave-one-out error (metres): perspective only | with spline');
    loo.forEach((e, i) => console.log(`  ${e.label.padEnd(34)} ${looH[i].error.toFixed(0).padStart(5)} | ${e.error.toFixed(0).padStart(5)}`));
    const med = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    console.log(`  median ${med(looH.map(e => e.error)).toFixed(0)} m | ${med(loo.map(e => e.error)).toFixed(0)} m`);
    for (const p of all.filter(p => p.use === false)) {
      const [x, y] = toM(F, m.toLatLon(p.px)), [X, Y] = toM(F, p.pos);
      console.log(`  check: ${p.label}: ${Math.hypot(x - X, y - Y).toFixed(0)} m from its known position`);
    }
    const out = opt('--out', a.replace(/\.json$/, '') + '.transform.json');
    fs.writeFileSync(out, JSON.stringify({ control: a, options: opts, points: use }, null, 1) + '\n');
    console.log(`Saved ${out} (re-fitted from the points when applied).`);
  } else if (cmd === 'apply') {
    const t = JSON.parse(fs.readFileSync(a, 'utf8'));
    const m = fitModel(t.points, t.options);
    const fs_ = JSON.parse(fs.readFileSync(b, 'utf8')).features;
    const geo = fs_.map(f => f.px ? { label: f.label, pos: m.toLatLon(f.px).map(r6) } : { label: f.label, line: f.line.map(p => m.toLatLon(p).map(r6)) });
    const out = opt('--out');
    if (out) fs.writeFileSync(out, JSON.stringify({ from: b, features: geo }, null, 1) + '\n');
    for (const g of geo) console.log(`${g.label}: ${g.pos ? g.pos.join(', ') : `line of ${g.line.length} points`}`);
  } else if (cmd === 'chain') {
    const blobs = JSON.parse(fs.readFileSync(a, 'utf8')).blobs.map(b => b.centre);
    const runs = chain(blobs, +opt('--gap', 60));
    console.log(JSON.stringify({ features: runs.map((r, i) => ({ label: `run ${i + 1}`, line: r })) }));
  } else {
    console.error('Usage: node tools/georef.mjs fit <control.json> | apply <transform.json> <features.json> | chain <blobs.json>');
    process.exit(2);
  }
}
