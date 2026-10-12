// Run with: node tests/planner.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildModel, plan, defaultSettings, legs, BREAK_ID, stopCurve, setHere, HERE_ID } from '../planner.js';

const tour = JSON.parse(readFileSync(new URL('../tours/wrest-park.json', import.meta.url)));
const model = buildModel(tour);
const base = defaultSettings(tour);
const S = (over = {}) => ({ ...base, ...over, weights: { ...base.weights, ...(over.weights || {}) } });
const NOW = 11 * 3600; // 11:00 in seconds
const mk = (mins, extra = {}) => ({ from: 'vc', deadlineS: NOW + mins * 60, E0: 1, drainMult: 1, visited: {}, skipped: {}, pinned: {}, ...extra });

let passed = 0;
function test(name, fn) {
  const t = Date.now();
  try { fn(); passed++; console.log(`ok   ${name} (${Date.now() - t} ms)`); }
  catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
}
const fmt = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
function show(p) {
  return p.steps.map(s => s.type === 'break' ? `[café ${fmt(s.arrive)}]` : `${s.id}(${s.bullets.length}/${s.total})${s.leg.scenic ? '~' : ''}`).join(' → ') + ` → exit ${fmt(p.finish)}`;
}

test('tour file integrity', () => {
  const ids = new Set(tour.stops.map(s => s.id));
  for (const s of tour.stops) {
    assert.ok(Array.isArray(s.pos) && s.pos.length === 2, `${s.id} pos`);
    assert.ok(tour.eras.some(e => e.id === s.era), `${s.id} era ${s.era}`);
    const bids = new Set();
    for (const b of s.bullets) {
      assert.ok(!bids.has(b.id), `${s.id} duplicate bullet ${b.id}`); bids.add(b.id);
      assert.ok(b.imp >= 1 && b.imp <= 5, `${s.id}.${b.id} imp`);
      for (const t of Object.keys(b.tags)) assert.ok(tour.topics[t], `${s.id}.${b.id} unknown topic ${t}`);
      if (b.needs != null) assert.ok(s.bullets.findIndex(x => x.id === b.needs) < s.bullets.indexOf(b), `${s.id}.${b.id} needs a later bullet`);
      for (const src of b.src || []) assert.ok(tour.sources[String(src)], `${s.id}.${b.id} unknown source ${src}`);
    }
  }
  for (const e of tour.events) if (e.stop) assert.ok(ids.has(e.stop), `event stop ${e.stop}`);
});

test('every stop reachable from the visitor centre', () => {
  const leg = legs(model, base);
  for (const s of tour.stops) {
    const L = leg('vc', s.id);
    assert.ok(L.fast.path && L.fast.path.length >= 1, `no path to ${s.id}`);
    assert.ok(L.fast.time < 25 * 60, `${s.id} is ${Math.round(L.fast.time / 60)} min away`);
  }
  const p = leg('vc', 'pavilion');
  console.log(`     vc→pavilion fast ${Math.round(p.fast.time / 60)} min; scenic ${p.scenic ? Math.round(p.scenic.time / 60) + ' min' : 'n/a'}`);
});

test('3-hour visit: feasible, must-sees in, finishes in time', () => {
  const p = plan(model, mk(180), S(), NOW);
  console.log('     ' + show(p));
  assert.ok(p.feasible);
  assert.ok(p.route.includes('pavilion') && p.route.includes('terrace'));
  assert.ok(p.finish <= NOW + 180 * 60);
});

test('75-minute visit: fewer stops, still feasible', () => {
  const long = plan(model, mk(180), S(), NOW);
  const p = plan(model, mk(75), S(), NOW);
  console.log('     ' + show(p));
  assert.ok(p.feasible);
  assert.ok(p.route.length < long.route.length);
  assert.ok(p.finish <= NOW + 75 * 60);
});

test('bullet order kept and prerequisites respected', () => {
  const p = plan(model, mk(120), S(), NOW);
  for (const st of p.steps.filter(s => s.type === 'stop')) {
    const stop = tour.stops.find(s => s.id === st.id);
    const idx = st.bullets.map(id => stop.bullets.findIndex(b => b.id === id));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b), `${st.id} out of order`);
    assert.equal(st.bullets[0], stop.bullets[0].id, `${st.id} lead missing`);
    for (const id of st.bullets) {
      const b = stop.bullets.find(x => x.id === id);
      if (b.needs != null) assert.ok(st.bullets.includes(b.needs), `${st.id}.${id} shown without ${b.needs}`);
    }
  }
});

test('interests change what is read', () => {
  const tech = plan(model, mk(120), S(), NOW);
  const deco = plan(model, mk(120), S({ weights: { interiors: 1, engineering: 0.1, physics: 0.1, space: 0.1, computing: 0.1 } }), NOW);
  console.log('     tech: ' + show(tech));
  console.log('     deco: ' + show(deco));
  assert.notDeepEqual(tech.route, deco.route);
});

test('low energy over a long visit triggers a café break', () => {
  const p = plan(model, mk(200, { E0: 0.45 }), S(), NOW);
  console.log('     ' + show(p));
  assert.ok(p.route.includes(BREAK_ID));
});

test('fresh family on a short visit gets no break', () => {
  const p = plan(model, mk(60), S(), NOW);
  assert.ok(!p.route.includes(BREAK_ID));
});

test('a bored family finishes earlier', () => {
  const keen = plan(model, mk(180), S({ siteInterest: 0.8 }), NOW);
  const bored = plan(model, mk(180, { E0: 0.5, drainMult: 1.6 }), S({ siteInterest: 0.25 }), NOW);
  console.log(`     keen finish ${fmt(keen.finish)}, bored finish ${fmt(bored.finish)}`);
  assert.ok(bored.finish < keen.finish);
});

test('boredom trims facts, not stops, and brings the café forward', () => {
  const keen = plan(model, mk(150), S(), NOW);
  const bored = plan(model, mk(150, { E0: 0.9, drainMult: 1.3, depthMult: 1.5 }), S(), NOW);
  const depth = p => { const st = p.steps.filter(s => s.type === 'stop'); return st.reduce((n, s) => n + s.bullets.length, 0) / st.length; };
  const stops = p => p.route.filter(x => x !== BREAK_ID).length;
  console.log(`     keen: ${stops(keen)} stops, ${depth(keen).toFixed(1)} facts/stop; bored: ${stops(bored)} stops, ${depth(bored).toFixed(1)} facts/stop`);
  console.log('     bored: ' + show(bored));
  assert.ok(depth(bored) < depth(keen));
  assert.ok(stops(bored) >= stops(keen) - 1, 'bored should not cut stops');
  // twice bored, mid-visit, with a long time left: a café break should appear
  const tired = plan(model, mk(180, { E0: 0.7, drainMult: 1.7, depthMult: 2.25 }), S(), NOW);
  console.log('     twice bored: ' + show(tired));
  assert.ok(tired.route.includes(BREAK_ID));
});

test('default detail: a few facts per stop, chosen by interest', () => {
  const p = plan(model, mk(150), S(), NOW);
  const st = p.steps.filter(s => s.type === 'stop');
  const avg = st.reduce((n, s) => n + s.bullets.length, 0) / st.length;
  console.log(`     ${st.length} stops, ${avg.toFixed(1)} facts per stop on average (light)`);
  const full = plan(model, mk(150), S({ detail: 'full' }), NOW);
  const fst = full.steps.filter(s => s.type === 'stop');
  console.log(`     full detail: ${fst.length} stops, ${(fst.reduce((n, s) => n + s.bullets.length, 0) / fst.length).toFixed(1)} facts per stop`);
  assert.ok(avg <= 3.5 && avg >= 1.5);
  assert.ok(Math.abs(st.length - fst.length) <= 4, 'detail should change depth more than breadth');
});

test('intro is only planned when forced, and always first', () => {
  const p = plan(model, mk(120), S(), NOW);
  assert.ok(!p.route.includes('intro'));
  const q = plan(model, mk(120, { forceFirst: 'intro' }), S(), NOW);
  assert.equal(q.route[0], 'intro');
  console.log(`     intro shows ${q.steps[0].bullets.length}/${q.steps[0].total} points`);
});

test('re-route from an arbitrary point', () => {
  setHere(model, [52.0022, -0.4100]); // in the woods east of the Long Water
  const p = plan(model, mk(90, { from: HERE_ID }), S(), NOW);
  console.log('     from the woods: ' + show(p));
  assert.ok(p.feasible && p.steps.length > 0);
  assert.ok(p.steps[0].leg.path[0] === HERE_ID);
  setHere(model, null);
});

test('low-interest topics are read last', () => {
  const p = plan(model, mk(240), S(), NOW);
  const st = p.steps.find(s => s.id === 'countess');
  console.log(`     countess's room (interiors) in a long plan: ${st ? st.bullets.length + '/' + st.total : 'not visited'}`);
  const q = plan(model, mk(240), S({ weights: { interiors: 0.9 } }), NOW);
  const sq = q.steps.find(s => s.id === 'countess');
  assert.ok((sq?.bullets.length ?? 0) >= (st?.bullets.length ?? 0));
});

test('scenic legs depend on the views weighting', () => {
  const lovers = plan(model, mk(150), S({ weights: { views: 1 }, scenicRate: 0.6 }), NOW);
  const none = plan(model, mk(150), S({ weights: { views: 0 } }), NOW);
  const n1 = lovers.steps.filter(s => s.leg.scenic).length + (lovers.back.leg?.scenic ? 1 : 0);
  const n0 = none.steps.filter(s => s.leg.scenic).length + (none.back.leg?.scenic ? 1 : 0);
  console.log(`     scenic legs: views=1 → ${n1}, views=0 → ${n0}`);
  assert.equal(n0, 0);
  assert.ok(n1 > 0);
});

test('sight value: wow follows the looks weighting, popular adds to it', () => {
  const s = { ...tour.stops.find(x => x.id === 'chinese') };
  const plain = stopCurve(s, { ...base.weights }, base).sight;
  const keen = stopCurve(s, { ...base.weights, looks: 1 }, base).sight;
  const cool = stopCurve(s, { ...base.weights, looks: 0 }, base).sight;
  assert.ok(keen > plain && plain > cool && cool > 0);
  const fav = stopCurve({ ...s, popular: 5 }, { ...base.weights }, base).sight;
  const favOff = stopCurve({ ...s, popular: 5 }, { ...base.weights, popular: 0 }, base).sight;
  assert.ok(fav > plain && favOff > plain && favOff < fav);
});

test('visitor favourites are planned more when the popular weighting is up', () => {
  const t2 = structuredClone(tour);
  const favs = ['chinese', 'atlas', 'dairy'];
  for (const id of favs) t2.stops.find(s => s.id === id).popular = 5;
  const m2 = buildModel(t2);
  // Summed over short and medium visits: in a long plan most stops fit anyway, so the weighting only shows when time is tight.
  const count = (w) => [45, 75, 120].reduce((n, mins) => n + plan(m2, mk(mins), S({ weights: { popular: w } }), NOW).route.filter(id => favs.includes(id)).length, 0);
  const on = count(1), off = count(0);
  console.log(`     favourites in 45-, 75- and 120-minute plans: popular=1 → ${on}, popular=0 → ${off}`);
  assert.ok(on > off);
});

test('pushchair mode: stepped paths and stepped stops are avoided', () => {
  const t2 = structuredClone(tour);
  // an outdoor sight whose every path link has steps
  const leaf = t2.stops.find(s => s.id === 'bathhouse');
  for (const link of t2.paths.filter(p => p[0] === leaf.id || p[1] === leaf.id)) {
    while (link.length < 5) link.push(link.length === 2 ? 0.3 : link.length === 3 ? '' : null);
    link[5] = { steps: true };
  }
  const other = t2.stops.find(s => s.kind === 'sight' && s.id !== leaf.id && !s.building && s.mustSee);
  other.steps = true;
  const m2 = buildModel(t2);
  const pinned = { [leaf.id]: true };
  const normal = plan(m2, mk(240, { pinned }), S(), NOW);
  assert.ok(normal.route.includes(leaf.id), `${leaf.id} planned normally`);
  const pram = plan(m2, mk(240, { pinned }), S({ avoidSteps: true }), NOW);
  assert.ok(!pram.route.includes(leaf.id), `${leaf.id} avoided in pushchair mode`);
  assert.ok(!pram.route.includes(other.id), `${other.id} (needs steps) avoided`);
  const why = Object.fromEntries(pram.dropped.map(d => [d.id, d.reason]));
  assert.equal(why[leaf.id], 'No step-free way there');
  assert.equal(why[other.id], 'Needs steps (avoiding steps)');
  for (const st of pram.steps) for (let i = 1; i < (st.leg.path || []).length; i++) {
    const a = st.leg.path[i - 1], b = st.leg.path[i];
    assert.ok(!m2.edges.some(e => e.steps && ((e.a === a && e.b === b) || (e.a === b && e.b === a))), 'no stepped link used');
  }
  console.log(`     pushchair mode: ${leaf.id} (stepped path) and ${other.id} (stepped stop) left out`);
});

test('forced next stop stays first; visited stops excluded', () => {
  const p = plan(model, mk(120, { from: 'terrace', visited: { terrace: {} }, forceFirst: 'bathhouse' }), S(), NOW);
  assert.equal(p.route[0], 'bathhouse');
  assert.ok(!p.route.includes('terrace'));
});

test('chronological mode starts earlier in time', () => {
  const p = plan(model, mk(180), S({ chrono: true }), NOW);
  console.log('     ' + show(p));
  const dates = p.steps.filter(s => s.type === 'stop').map(s => tour.stops.find(x => x.id === s.id).date);
  const inversions = dates.reduce((n, d, i) => n + dates.slice(0, i).filter(x => x > d + 10).length, 0);
  const q = plan(model, mk(180), S(), NOW);
  const d2 = q.steps.filter(s => s.type === 'stop').map(s => tour.stops.find(x => x.id === s.id).date);
  const inv2 = d2.reduce((n, d, i) => n + d2.slice(0, i).filter(x => x > d + 10).length, 0);
  console.log(`     date inversions: chrono ${inversions}, normal ${inv2}`);
  assert.ok(inversions <= inv2);
});

test('curves: lead first, groups non-increasing', () => {
  for (const s of tour.stops) {
    const c = stopCurve(s, base.weights, base);
    for (let i = 1; i < c.groups.length; i++) assert.ok(c.groups[i].r <= c.groups[i - 1].r + 1e-12);
  }
});

test('performance: worst-case plan under 1.5 s', () => {
  const t = Date.now();
  plan(model, mk(240, { E0: 0.6 }), S(), NOW);
  const ms = Date.now() - t;
  assert.ok(ms < 1500, `${ms} ms`);
});

console.log(`\n${passed} passed`);
