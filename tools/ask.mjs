// Prints the prompt the assistant would send, for a conversation of one or more questions.
// Usage: node tools/ask.mjs [--tour <id>] [--at <stopId>] "First question" [--at <stopId>] "Next question" ...
// Each --at sets where the family is for the questions after it. Prints the last prompt (--all for every one).
import fs from 'node:fs';
import { createSession } from '../assistant/prompt.js';
import { loadKnowledge } from '../assistant/knowledge.js';
const root = new URL('..', import.meta.url).pathname;
const args0 = process.argv.slice(2);
const tourId = args0.includes('--tour') ? args0[args0.indexOf('--tour') + 1] : 'wrest-park';
const tour = JSON.parse(fs.readFileSync(root + `tours/${tourId}.json`, 'utf8'));
const { sections, dates } = await loadKnowledge(tour, async (p) => (fs.existsSync(root + p) ? fs.readFileSync(root + p, 'utf8') : null));
const s = createSession({ sections, dates, tour });
const args = process.argv.slice(2), all = args.includes('--all');
let stopId = null; const out = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--all') continue;
  if (args[i] === '--tour') { i++; continue; }
  if (args[i] === '--at') { stopId = args[++i]; continue; }
  const r = s.prompt(args[i], { stopId });
  out.push(`===== ${args[i]}${stopId ? ` (at ${stopId})` : ''} · ${r.text.split(/\s+/).length} words · about: ${r.about} · notes: ${r.picked.join('; ')}\n${r.text}`);
}
console.log(all ? out.join('\n\n') : out[out.length - 1]);
