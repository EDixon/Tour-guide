import assert from 'node:assert/strict';
import { compare, rulersDuring, personAt, calculatedFacts, mentions, label } from '../assistant/maths.mjs';
import { dates } from './load.mjs';
const T = (id) => dates.things.find(t => t.id === id), P = (id) => dates.people.find(p => p.id === id);
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok  ', name); };
ok('labels use full years', () => { assert.equal(label(T('house')), '1834–1839'); assert.equal(label(T('orangery')), 'about 1835'); });
ok('orangery is during the house, not after', () => {
  const r = compare(T('orangery'), T('house')); assert.equal(r.rel, 'during');
  assert.match(r.text, /WHILE the house \(1834–1839\) was being built/); assert.match(r.text, /about 1 year after/); assert.match(r.text, /about 4 years before/);
});
ok('house compared the other way round still says during', () => assert.match(compare(T('house'), T('orangery')).text, /WHILE/));
ok('pavilion before statue', () => { const r = compare(T('pavilion'), T('william-statue')); assert.equal(r.rel, 'before'); assert.match(r.text, /about 26 years earlier/); });
ok('rulers', () => {
  assert.match(rulersDuring(T('pavilion'), dates.rulers), /Anne \(1702–1714\); France: Louis XIV/);
  assert.match(rulersDuring(T('house'), dates.rulers), /William IV \(1830–1837\), then Victoria/);
  assert.match(rulersDuring(T('glorious-revolution'), dates.rulers), /^When the Glorious Revolution happened/);
});
ok('ages and after-death', () => {
  assert.match(personAt(P('earl-de-grey'), T('house')), /was 52 when the house was begun \(1834\) and 57/);
  assert.match(personAt(P('william-iii'), T('william-statue')), /about 35 years after William III died \(1702\)/);
});
ok('mentions', () => {
  assert.deepEqual(mentions(dates, 'Was the orangery built before or after the house?').things.sort(), ['house', 'orangery']);
  assert.deepEqual(mentions(dates, "Who was king when the Archer Pavilion was built?").things, ['pavilion']);
});
ok('facts block', () => { const f = calculatedFacts(dates, { things: ['orangery', 'house'], people: ['earl-de-grey'], nowYear: 2026 }); assert.ok(f.length >= 5); });
console.log(`\n${n} passed`);
