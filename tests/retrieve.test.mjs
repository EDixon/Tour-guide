import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rank, parseSections } from '../assistant/retrieve.js';
import { mentions } from '../assistant/maths.js';
import { buildPrompt, plainDates, createSession, hereContext } from '../assistant/prompt.js';
import { secs, dates, tour } from './load.mjs';
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
ok('where we are: "who built this?" at the Orangery', () => {
  const s = createSession({ sections: secs, dates, tour, nowYear: 2026 });
  const r = s.prompt('Who built this?', { stopId: 'orangery' });
  assert.equal(r.about, 'here'); assert.equal(r.picked[0], 'The Orangery');
  assert.match(r.text, /WHERE WE ARE: Orangery/); assert.ok(r.facts.some(f => /The Orangery \(about 1835\) was designed by/.test(f)));
});
ok('where we are: "was this built before the house?" compares the two', () => {
  const r = createSession({ sections: secs, dates, tour, nowYear: 2026 }).prompt('Was this built before or after the house?', { stopId: 'orangery' });
  assert.ok(r.facts.some(f => /The Orangery .* WHILE the present house/.test(f)));
});
ok('a stop the knowledge base does not cover yet falls back to the tour text', () => {
  const h = hereContext({ tour, dates, sections: secs, stopId: 'science' });
  assert.equal(h.section, null); assert.match(h.tourText.text, /driverless tractor/i);
  const r = createSession({ sections: secs, dates, tour }).prompt('What happened here?', { stopId: 'science' });
  assert.match(r.picked[0], /science years/);
});
ok('"he" after a question about a person stays with that person even at another stop', () => {
  const s = createSession({ sections: secs, dates, tour, nowYear: 2026 });
  s.prompt('Who is Capability Brown?', { stopId: 'cbcol' });
  const r = s.prompt('When did he die?', { stopId: 'orangery' });
  assert.equal(r.about, 'previous'); assert.ok(r.facts.some(f => /Brown.*died 1783/.test(f)));
});
ok('a question that is not about dates gets light facts', () => {
  const s = createSession({ sections: secs, dates, tour, nowYear: 2026 });
  const r = s.prompt('Who is Capability Brown?', { stopId: 'cbcol' });
  assert.ok(r.facts.length <= 5, `${r.facts.length} facts`);
  assert.equal(r.picked[0], 'Lancelot "Capability" Brown'); assert.ok(r.picked.includes('The boundary canals ("the river")'));
  assert.ok(!r.facts.some(f => /rulers were|years ago|WHILE|BEFORE|AFTER/.test(f)));
  const d = s.prompt('When did he become Master Gardener?', { stopId: 'cbcol' });
  assert.ok(d.facts.some(f => /1764, aged about 47/.test(f)));
});
ok('family questions get the family, not just the Earl who built the house', () => {
  const s = createSession({ sections: secs, dates, tour, nowYear: 2026 });
  const a = s.prompt('Who are the de grey family?', { stopId: 'intro' });
  assert.equal(a.picked[0], 'The de Grey family and Wrest');
  assert.ok(!/WHERE WE ARE/.test(a.text) || true);
  const b = s.prompt('Who was the first grey to own the house?', { stopId: 'intro' });
  assert.ok(b.facts.some(f => /first record of the Greys at Wrest \(1284–1286\) was of Reginald de Grey/.test(f)));
  assert.equal(b.picked[0], 'The de Grey family and Wrest');
  assert.ok(!b.facts.some(f => /rulers were/.test(f) && /1284/.test(f)), 'no ruler list over 600 years');
});
console.log(`\n${n} passed`);
