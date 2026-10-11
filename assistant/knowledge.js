// Loads a site's knowledge: its own notes and dates, plus the shared reference packs it lists.
// tour.knowledge = { site: "knowledge/<id>", reference: ["rulers", ...] }
// Each folder may hold notes.md (sections, see docs/KNOWLEDGE_FORMAT.md) and dates.json (things, people, rulers).
import { parseSections } from './retrieve.js';

export function knowledgeFiles(tour) {
  const k = tour.knowledge || {};
  const dirs = [k.site, ...(k.reference || []).map(p => `knowledge/reference/${p}`)].filter(Boolean);
  return dirs.flatMap(d => [`${d}/notes.md`, `${d}/dates.json`]);
}

// readText(path) -> Promise<string|null> (null if the file doesn't exist)
export async function loadKnowledge(tour, readText) {
  const files = knowledgeFiles(tour);
  const texts = await Promise.all(files.map(f => readText(f).catch(() => null)));
  const sections = [], datesList = [];
  files.forEach((f, i) => {
    const t = texts[i];
    if (!t) return;
    if (f.endsWith('.md')) sections.push(...parseSections(t).map(s => ({ ...s, file: f })));
    else datesList.push(JSON.parse(t));
  });
  return { sections, dates: mergeDates(datesList) };
}

export function mergeDates(list) {
  const out = { things: [], people: [], rulers: {} };
  for (const d of list) {
    out.things.push(...(d.things || []));
    out.people.push(...(d.people || []));
    for (const [country, rows] of Object.entries(d.rulers || {})) out.rulers[country] = [...(out.rulers[country] || []), ...rows];
  }
  return out;
}
