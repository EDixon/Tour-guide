// Prints the prompt the assistant would send, for a conversation of one or more questions.
// Usage: node tools/ask.mjs [--at <stopId>] "First question" [--at <stopId>] "Next question" ...
// Each --at sets where the family is for the questions after it. Prints the last prompt (--all for every one).
import fs from 'node:fs';
import { createSession } from '../assistant/prompt.mjs';
import { parseSections } from '../assistant/retrieve.mjs';
const root = new URL('..', import.meta.url).pathname;
const sections = parseSections(fs.readFileSync(root + 'knowledge/wrest-park-sample.md', 'utf8'));
const dates = JSON.parse(fs.readFileSync(root + 'knowledge/wrest-park-dates.json', 'utf8'));
const tour = JSON.parse(fs.readFileSync(root + 'tours/wrest-park.json', 'utf8'));
const s = createSession({ sections, dates, tour });
const args = process.argv.slice(2), all = args.includes('--all');
let stopId = null; const out = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--all') continue;
  if (args[i] === '--at') { stopId = args[++i]; continue; }
  const r = s.prompt(args[i], { stopId });
  out.push(`===== ${args[i]}${stopId ? ` (at ${stopId})` : ''} · ${r.text.split(/\s+/).length} words · about: ${r.about} · notes: ${r.picked.join('; ')}\n${r.text}`);
}
console.log(all ? out.join('\n\n') : out[out.length - 1]);
