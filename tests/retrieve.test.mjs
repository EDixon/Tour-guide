import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rank, parseSections } from '../assistant/retrieve.mjs';
import { mentions } from '../assistant/maths.mjs';
import { buildPrompt } from '../assistant/prompt.mjs';
const secs = parseSections(fs.readFileSync(new URL('../knowledge/wrest-park-sample.md', import.meta.url), 'utf8'));
const dates = JSON.parse(fs.readFileSync(new URL('../knowledge/wrest-park-dates.json', import.meta.url)));
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok  ', name); };
ok('sections parsed with sources', () => { assert.ok(secs.length >= 14); assert.ok(secs.every(s => s.text && !/^Sources:/m.test(s.text))); });
ok('river question finds the canals', () => assert.match(rank(secs, 'Who made the river?')[0].title, /boundary canals/));
ok('orange trees in winter finds orangery material', () => assert.match(rank(secs, 'How did they keep orange trees alive through the winter here?').slice(0, 2).map(s => s.title).join(), /Orangery|oranges/));
ok('river question brings in Brown and the Duke', () => { const m = mentions(dates, 'Who made the river?'); assert.ok(m.related.includes('brown-river')); assert.ok(m.people.includes('capability-brown') && m.people.includes('duke-of-kent')); });
ok('naming the statue brings in its notes and the Glorious Revolution', () => {
  const p = buildPrompt({ question: 'Why would a duke put up a statue of a king who had been dead for decades?', sections: secs, dates, nowYear: 2026 });
  assert.ok(p.picked.includes('The statue of William III') && p.picked.includes('William III and the Glorious Revolution'));
  assert.ok(p.facts.some(f => /35 years after William III died/.test(f)));
});
console.log(`\n${n} passed`);
