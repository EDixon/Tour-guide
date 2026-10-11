// Check a tour file and print a sample plan.  Usage: node tools/validate-tour.mjs tours/<id>.json [minutes]
import { readFileSync } from 'node:fs';
import { buildModel, plan, defaultSettings, legs } from '../planner.js';

const file = process.argv[2];
const mins = +(process.argv[3] || 120);
if (!file) { console.error('usage: node tools/validate-tour.mjs <tour.json> [minutes]'); process.exit(2); }
const tour = JSON.parse(readFileSync(file, 'utf8'));
const problems = [];
const need = (c, msg) => { if (!c) problems.push(msg); };

need(tour.id && tour.name && tour.start && tour.exit, 'missing id/name/start/exit');
const ids = new Set(tour.stops.map(s => s.id));
need(ids.has(tour.start) && ids.has(tour.exit), 'start/exit must be stop ids');
for (const s of tour.stops) {
  need(Array.isArray(s.pos) && s.pos.length === 2, `${s.id}: pos [lat, lon] required`);
  need(tour.eras.some(e => e.id === s.era), `${s.id}: unknown era ${s.era}`);
  need(s.kind === 'facility' || s.bullets.length > 0, `${s.id}: no bullets`);
  const seen = new Set();
  s.bullets.forEach((b, i) => {
    need(!seen.has(b.id), `${s.id}.${b.id}: duplicate id`); seen.add(b.id);
    need(b.imp >= 1 && b.imp <= 5, `${s.id}.${b.id}: imp must be 1-5`);
    for (const t of Object.keys(b.tags || {})) need(tour.topics[t], `${s.id}.${b.id}: unknown topic ${t}`);
    if (b.needs != null) need(s.bullets.findIndex(x => x.id === b.needs) > -1 && s.bullets.findIndex(x => x.id === b.needs) < i, `${s.id}.${b.id}: needs must point to an earlier bullet`);
    for (const k of b.src || []) need(tour.sources[String(k)], `${s.id}.${b.id}: unknown source ${k}`);
  });
}
let model;
try { model = buildModel(tour); } catch (e) { problems.push(e.message); }
if (model) {
  const L = legs(model, defaultSettings(tour));
  for (const s of tour.stops) {
    const l = L(tour.start, s.id);
    need(l.fast.path && l.fast.path.length > 1 || s.id === tour.start, `${s.id}: not connected to the path network`);
  }
}
if (problems.length) { console.log('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }

const nB = tour.stops.reduce((n, s) => n + s.bullets.length, 0);
const nV = tour.stops.reduce((n, s) => n + s.bullets.filter(b => b.verify || (b.src || []).includes('gk')).length, 0);
console.log(`OK: ${tour.stops.length} stops, ${nB} bullets (${nV} flagged to check), ${tour.paths.length} path links`);
const now = 11 * 3600;
const p = plan(model, { from: tour.start, deadlineS: now + mins * 60, E0: 1, visited: {}, skipped: {}, pinned: {} }, defaultSettings(tour), now);
const hm = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
console.log(`\nSample ${mins}-minute plan from 11:00:`);
for (const s of p.steps) console.log(`  ${hm(s.arrive)}  ${s.type === 'break' ? 'café break' : tour.stops.find(x => x.id === s.id).name}${s.type === 'stop' ? `  (${s.bullets.length}/${s.total} points${s.leg.scenic ? ', scenic route' : ''})` : ''}`);
console.log(`  ${hm(p.finish)}  back at exit`);
