// Merges research batches written by stop-researcher / reference-writer agents into the site's files.
// Usage: node tools/merge-research.mjs <site-id> [--dry]
//
// Reads sites/<id>/research/<batch>-notes.md, <batch>-dates.json and <batch>-stops.json, and merges into:
//   knowledge/<id>/notes.md   sections replaced by title, or appended
//   knowledge/<id>/dates.json things and people replaced by id, or appended
//   tours/<id>.json           per-stop fields (bullets, look, note, kids, short, wow, dwell, date, dateLabel, era)
// Reference-pack batches (files named ref-<pack>-notes.md / ref-<pack>-dates.json) go to knowledge/reference/<pack>/.
// Merged batch files are moved to sites/<id>/research/merged/.
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const [id, flag] = process.argv.slice(2);
const dry = flag === '--dry';
if (!id) { console.error('Usage: node tools/merge-research.mjs <site-id> [--dry]'); process.exit(2); }
const dir = root + `sites/${id}/research/`;
if (!fs.existsSync(dir)) { console.error(`No ${dir}`); process.exit(2); }
const files = fs.readdirSync(dir).filter(f => /-(notes\.md|dates\.json|stops\.json)$/.test(f)).sort();
const report = [];

function mergeNotes(target, mdFiles) {
  const head = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : `# ${id} notes\n\nFormat: docs/KNOWLEDGE_FORMAT.md.\n`;
  const preamble = head.split(/^## /m)[0];
  const existing = parseRaw(head);
  for (const f of mdFiles) for (const sec of parseRaw(fs.readFileSync(dir + f, 'utf8'))) {
    const i = existing.findIndex(s => s.title === sec.title);
    if (i >= 0) { existing[i] = sec; report.push(`notes: replaced "${sec.title}" (${f})`); }
    else { existing.push(sec); report.push(`notes: added "${sec.title}" (${f})`); }
  }
  write(target, preamble.trimEnd() + '\n\n' + existing.map(s => s.raw.trim()).join('\n\n') + '\n');
}
// Keep sections verbatim (including Kind/About/Sources lines).
function parseRaw(md) {
  return md.split(/^## /m).slice(1).map(chunk => ({ title: chunk.split('\n')[0].trim(), raw: '## ' + chunk }));
}
function mergeDates(target, jsonFiles) {
  const base = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : { note: `Site dates for ${id}.`, things: [], people: [] };
  for (const f of jsonFiles) {
    const add = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    for (const key of ['things', 'people']) for (const item of add[key] || []) {
      base[key] = base[key] || [];
      const i = base[key].findIndex(x => x.id === item.id);
      if (i >= 0) { if (JSON.stringify(base[key][i]) !== JSON.stringify(item)) report.push(`dates: updated ${key.slice(0, -1)} "${item.id}" (${f})`); base[key][i] = item; }
      else { base[key].push(item); report.push(`dates: added ${key.slice(0, -1)} "${item.id}" (${f})`); }
    }
    if (add.rulers) { base.rulers = base.rulers || {}; for (const [c, rows] of Object.entries(add.rulers)) base.rulers[c] = rows; report.push(`dates: rulers for ${Object.keys(add.rulers).join(', ')} (${f})`); }
  }
  write(target, formatDates(base));
}
// One object per line keeps diffs readable.
function formatDates(d) {
  const lines = ['{', `  "note": ${JSON.stringify(d.note || '')}`];
  for (const key of ['things', 'people']) if (d[key]) lines[lines.length - 1] += ',', lines.push(`  "${key}": [`, ...d[key].map((x, i) => '    ' + JSON.stringify(x) + (i < d[key].length - 1 ? ',' : '')), '  ]');
  if (d.rulers) { lines[lines.length - 1] += ','; lines.push('  "rulers": {', ...Object.entries(d.rulers).map(([c, r], i, a) => `    ${JSON.stringify(c)}: ${JSON.stringify(r)}${i < a.length - 1 ? ',' : ''}`), '  }'); }
  return lines.join('\n') + '\n}\n';
}
const STOP_FIELDS = ['bullets', 'look', 'note', 'kids', 'short', 'wow', 'dwell', 'date', 'dateLabel', 'era', 'name', 'facilities', 'attnBoost'];
function mergeStops(jsonFiles) {
  const tf = root + `tours/${id}.json`;
  const tour = JSON.parse(fs.readFileSync(tf, 'utf8'));
  for (const f of jsonFiles) {
    const add = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
    for (const [sid, fields] of Object.entries(add)) {
      const st = tour.stops.find(s => s.id === sid);
      if (!st) { report.push(`stops: UNKNOWN stop "${sid}" in ${f}, skipped`); continue; }
      for (const k of Object.keys(fields)) if (!STOP_FIELDS.includes(k)) report.push(`stops: ignored field "${k}" for ${sid} (${f})`);
      for (const k of STOP_FIELDS) if (fields[k] !== undefined) st[k] = fields[k];
      report.push(`stops: updated "${sid}" (${Object.keys(fields).filter(k => STOP_FIELDS.includes(k)).join(', ')})`);
    }
  }
  write(tf, JSON.stringify(tour, null, 1) + '\n');
}
function write(f, text) { if (!dry) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); } }

const site = files.filter(f => !f.startsWith('ref-'));
const refs = files.filter(f => f.startsWith('ref-'));
mergeNotes(root + `knowledge/${id}/notes.md`, site.filter(f => f.endsWith('-notes.md')));
mergeDates(root + `knowledge/${id}/dates.json`, site.filter(f => f.endsWith('-dates.json')));
if (site.some(f => f.endsWith('-stops.json'))) mergeStops(site.filter(f => f.endsWith('-stops.json')));
const packs = [...new Set(refs.map(f => f.match(/^ref-(.+)-(notes\.md|dates\.json)$/)?.[1]).filter(Boolean))];
for (const p of packs) {
  mergeNotes(root + `knowledge/reference/${p}/notes.md`, refs.filter(f => f === `ref-${p}-notes.md`));
  mergeDates(root + `knowledge/reference/${p}/dates.json`, refs.filter(f => f === `ref-${p}-dates.json`));
}
if (!dry) { fs.mkdirSync(dir + 'merged', { recursive: true }); for (const f of files) fs.renameSync(dir + f, dir + 'merged/' + f); }
console.log(report.join('\n') || 'Nothing to merge.');
console.log(dry ? '\n(dry run: nothing written)' : `\nMerged ${files.length} files. Now run: node tools/check-knowledge.mjs ${id} && npm test`);
