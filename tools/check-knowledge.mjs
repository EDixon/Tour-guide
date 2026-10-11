// Mechanical checks on a site's knowledge files (and the reference packs it uses).
// Usage: node tools/check-knowledge.mjs <site-id>
// Exit code 1 if there are errors; warnings are printed but don't fail.
import fs from 'node:fs';
import { loadKnowledge, knowledgeFiles } from '../assistant/knowledge.mjs';

const root = new URL('..', import.meta.url).pathname;
const id = process.argv[2];
if (!id) { console.error('Usage: node tools/check-knowledge.mjs <site-id>'); process.exit(2); }
const tour = JSON.parse(fs.readFileSync(root + `tours/${id}.json`, 'utf8'));
const readText = async (p) => (fs.existsSync(root + p) ? fs.readFileSync(root + p, 'utf8') : null);
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

if (!tour.knowledge?.site) err(`tours/${id}.json has no "knowledge": {"site": "knowledge/${id}", "reference": [...]}`);
for (const f of knowledgeFiles(tour)) if (!fs.existsSync(root + f) && f.startsWith(tour.knowledge?.site || '§')) err(`missing ${f}`);

// JSON syntax first, with a clear message
for (const f of knowledgeFiles(tour).filter(f => f.endsWith('.json'))) {
  if (!fs.existsSync(root + f)) continue;
  try { JSON.parse(fs.readFileSync(root + f, 'utf8')); } catch (e) { err(`${f}: invalid JSON (${e.message})`); }
}
if (errors.length) finish();

const { sections, dates } = await loadKnowledge(tour, readText);
const stopIds = new Set(tour.stops.map(s => s.id));
const ids = new Map();
for (const t of dates.things) { if (ids.has(t.id)) err(`duplicate id "${t.id}"`); ids.set(t.id, 'thing'); }
for (const p of dates.people) { if (ids.has(p.id)) err(`duplicate id "${p.id}"`); ids.set(p.id, 'person'); }

// ---- things
const aliasOwner = new Map();
for (const t of dates.things) {
  const where = `thing "${t.id}"`;
  for (const k of ['name', 'names', 'from', 'verb']) if (t[k] == null) err(`${where}: missing ${k}`);
  if (t.to != null && t.to < t.from) err(`${where}: to (${t.to}) is before from (${t.from})`);
  if (t.from > new Date().getFullYear()) err(`${where}: from is in the future`);
  for (const n of t.names || []) {
    if (n !== n.toLowerCase()) warn(`${where}: alias "${n}" should be lower case`);
    if (aliasOwner.has(n) && aliasOwner.get(n) !== t.id) warn(`alias "${n}" is used by both "${aliasOwner.get(n)}" and "${t.id}": questions will pull in both`);
    aliasOwner.set(n, t.id);
  }
  for (const s of t.stops || []) if (!stopIds.has(s)) err(`${where}: stop "${s}" is not in the tour`);
  for (const p of t.people || []) if (ids.get(p) !== 'person') err(`${where}: person "${p}" not found`);
  for (const r of t.related || []) if (ids.get(r) !== 'thing') err(`${where}: related "${r}" not found`);
  if (!t.who) warn(`${where}: no "who" (who made or commissioned it)`);
  if (/\b1\d{3}\s?[–-]\s?\d{2}\b(?!\d)|\bc\.\s?\d/.test(JSON.stringify(t))) warn(`${where}: shortened date in text, write years in full`);
}
// ---- people
for (const p of dates.people) {
  const where = `person "${p.id}"`;
  for (const k of ['name', 'names', 'born']) if (p[k] == null) err(`${where}: missing ${k}`);
  if (p.died && p.born && p.died[0] < p.born[0]) err(`${where}: died before born`);
  for (const [y] of p.events || []) if (p.born && (y < p.born[0] || (p.died && y > p.died[0]))) err(`${where}: event ${y} outside their life`);
  if (!p.who) warn(`${where}: no "who"`);
  for (const n of p.names || []) if (n !== n.toLowerCase()) warn(`${where}: alias "${n}" should be lower case`);
}
// ---- rulers
for (const [c, rows] of Object.entries(dates.rulers)) rows.forEach(([n, a, b]) => { if (b < a) err(`ruler ${n} (${c}): end before start`); });

// ---- sections
const titles = new Set();
for (const s of sections) {
  const where = `section "${s.title}" (${s.file})`;
  if (titles.has(s.title)) err(`${where}: duplicate title`);
  titles.add(s.title);
  if (!['site', 'person', 'reference'].includes(s.kind)) err(`${where}: Kind must be site, person or reference`);
  if (!s.sources) err(`${where}: no Sources line`);
  if (s.kind === 'site' && !s.about.length) err(`${where}: site sections need an About line`);
  for (const a of s.about) if (!ids.has(a)) err(`${where}: About id "${a}" not in dates`);
  const w = s.text.split(/\s+/).length;
  if (w < 80) warn(`${where}: only ${w} words`);
  if (w > 700) warn(`${where}: ${w} words, consider splitting (sections over ~500 words crowd the prompt)`);
  if (/\b1\d{3}\s?[–-]\s?\d{2}\b(?!\d)|\bc\.\s?\d/.test(s.text)) warn(`${where}: shortened dates (app expands them, but write them in full)`);
  if (s.kind === 'site' && /general knowledge/i.test(s.sources) && !/;|,/.test(s.sources)) warn(`${where}: site section sourced only to general knowledge`);
}

// ---- coverage: which stops have knowledge
const covered = [], uncovered = [];
for (const st of tour.stops.filter(s => s.kind !== 'facility' && s.kind !== 'intro')) {
  const here = dates.things.filter(t => (t.stops || []).includes(st.id)).map(t => t.id);
  const sec = sections.some(s => s.about.some(a => here.includes(a)));
  (here.length && sec ? covered : uncovered).push(st.id);
}

finish();
function finish() {
  for (const w of warnings) console.log('warn ', w);
  for (const e of errors) console.log('ERROR', e);
  if (typeof covered !== 'undefined') console.log(`\nCoverage: ${covered.length}/${covered.length + uncovered.length} stops have dated things and a notes section.${uncovered.length ? ' Not yet: ' + uncovered.join(', ') : ''}`);
  console.log(`${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
