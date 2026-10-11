// Run with: node tests/georef.test.mjs
import assert from 'node:assert/strict';
import { fitHomography, fitModel, leaveOneOut, chain } from '../tools/georef.mjs';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}

// A made-up bird's-eye view: real positions on a 600 m × 900 m site, seen in perspective and rotated.
const lat0 = 52.004, lon0 = -0.411, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
const view = ([x, y]) => { const w = 1 + 0.0006 * y; const r = [Math.cos(2.9) * x - Math.sin(2.9) * y, Math.sin(2.9) * x + Math.cos(2.9) * y]; return [800 + 1.2 * r[0] / w, 600 + 0.7 * r[1] / w]; };
const ground = [];
for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) ground.push([-300 + 150 * j + 13 * i, -450 + 220 * i + 7 * j]);
const pts = ground.map((g, i) => ({ label: `p${i}`, px: view(g), pos: [lat0 + g[1] / ky, lon0 + g[0] / kx] }));

test('perspective fit recovers an exact perspective view', () => {
  const H = fitHomography(pts.map(p => p.px), ground);
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = H(pts[i].px);
    assert.ok(Math.hypot(x - ground[i][0], y - ground[i][1]) < 0.5, `point ${i} off`);
  }
});

test('leave-one-out errors are small for clean points, larger for noisy ones', () => {
  const clean = leaveOneOut(pts, { tps: true, smooth: 1 });
  assert.ok(Math.max(...clean.map(e => e.error)) < 2, 'clean points should predict within 2 m');
  const noisy = pts.map((p, i) => ({ ...p, px: [p.px[0] + ((i * 37) % 11 - 5), p.px[1] + ((i * 53) % 9 - 4)] }));
  const e = leaveOneOut(noisy, { tps: true, smooth: 1 }).map(x => x.error).sort((a, b) => a - b);
  assert.ok(e[Math.floor(e.length / 2)] < 25, `median ${e[Math.floor(e.length / 2)]}`);
});

test('a model places a new point', () => {
  const m = fitModel(pts, { tps: true });
  const g = [40, 120];
  const [la, lo] = m.toLatLon(view(g));
  assert.ok(Math.hypot((lo - lon0) * kx - g[0], (la - lat0) * ky - g[1]) < 2);
});

test('route dashes chain into runs in order', () => {
  const dashes = [[0, 0], [20, 2], [40, 1], [60, 3], [300, 300], [320, 305], [80, 2]];
  const runs = chain(dashes, 45);
  assert.equal(runs.length, 2);
  const long = runs.find(r => r.length === 5);
  assert.ok(long, 'one run of five dashes');
  assert.deepEqual(long.map(p => p[0]).sort((a, b) => a - b), [0, 20, 40, 60, 80]);
  const xs = long.map(p => p[0]);
  assert.ok(xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1]) <= 20), 'in order along the line');
});

console.log(`\n${passed} passed`);
