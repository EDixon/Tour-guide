import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rank, parseSections } from '../assistant/retrieve.mjs';
import { mentions } from '../assistant/maths.mjs';
import { buildPrompt, plainDates, createSession } from '../assistant/prompt.mjs';
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
ok('dates written out in full for the model', () => {
  assert.equal(plainDates('built 1834–39, c.1835, 1758-60, 1709–11, £1,809, 1690'), 'built 1834–1839, about 1835, 1758–1760, 1709–1711, £1,809, 1690');
  const p = buildPrompt({ question: 'Who made the river?', sections: secs, dates, nowYear: 2026 });
  assert.ok(!/\b1\d{3}–\d\d\b/.test(p.text), 'no shortened year ranges');
  assert.ok(!/\bc\.\d/.test(p.text), 'no c. dates');
});
ok('a follow-up that names nothing inherits the previous question', () => {
  const p = buildPrompt({ question: 'Why did he do that?', sections: secs, dates, previous: ['Why would a duke put up a statue of a king who had been dead for decades?'], nowYear: 2026 });
  assert.ok(p.picked.includes('The statue of William III'));
  assert.match(p.text, /EARLIER QUESTION: Why would a duke/);
  assert.ok(!/^A:/m.test(p.text), 'no earlier answers carried');
});
ok('a conversation carries its subject through chained follow-ups', () => {
  const s = createSession({ sections: secs, dates, nowYear: 2026 });
  const a = s.prompt('Who made the river?');
  assert.ok(!/EARLIER QUESTION/.test(a.text));
  const b = s.prompt('Who is Capability Brown?');
  assert.match(b.text, /EARLIER QUESTION: Who made the river\?/);
  s.prompt('Why would a duke put up a statue of a king who had been dead for decades?');
  s.prompt('Why did he do that?');
  const e = s.prompt('When did he die?');
  assert.match(e.text, /EARLIER QUESTION: Why would a duke/);
  assert.ok(!/worked out by the app|^- Who:/m.test(e.text));
});
console.log(`\n${n} passed`);
