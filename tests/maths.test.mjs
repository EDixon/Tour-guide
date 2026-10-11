import assert from 'node:assert/strict';
import { compare, rulersDuring, personAt, calculatedFacts, mentions, label, ownersDuring, ownersList, ownerAt, Y, gap } from '../assistant/maths.js';
import { dates } from './load.mjs';
const T = (id) => dates.things.find(t => t.id === id), P = (id) => dates.people.find(p => p.id === id);
let n = 0; const ok = (name, f) => { f(); n++; console.log('ok  ', name); };
ok('labels use full years', () => { assert.equal(label(T('house')), '1834–1839'); assert.equal(label(T('orangery')), 'about 1835'); });
ok('orangery is during the house, not after', () => {
  const r = compare(T('orangery'), T('house')); assert.equal(r.rel, 'during');
  assert.match(r.text, /WHILE the present house \(1834–1839\) was being built/); assert.match(r.text, /about 1 year after/); assert.match(r.text, /about 4 years before/);
});
ok('house compared the other way round still says during', () => assert.match(compare(T('house'), T('orangery')).text, /WHILE/));
ok('pavilion before statue', () => { const r = compare(T('pavilion'), T('william-statue')); assert.equal(r.rel, 'before'); assert.match(r.text, /about 26 years earlier/); });
ok('rulers', () => {
  assert.match(rulersDuring(T('pavilion'), dates.rulers), /Anne \(1702–1714\); France: Louis XIV/);
  assert.match(rulersDuring(T('house'), dates.rulers), /William IV \(1830–1837\), then Victoria/);
  assert.match(rulersDuring(T('glorious-revolution'), dates.rulers), /^When the Glorious Revolution happened/);
});
ok('ages and after-death', () => {
  assert.match(personAt(P("earl-de-grey"), T("house")), /was 52 when the present house was begun \(1834\) and 57/);
  assert.match(personAt(P('william-iii'), T('william-statue')), /about 35 years after William III died \(1702\)/);
});
ok('mentions', () => {
  assert.deepEqual(mentions(dates, 'Was the orangery built before or after the house?').things.sort(), ['house', 'orangery']);
  assert.deepEqual(mentions(dates, "Who was king when the Archer Pavilion was built?").things, ['pavilion']);
});
ok('facts block', () => { const f = calculatedFacts(dates, { things: ['orangery', 'house'], people: ['earl-de-grey'], nowYear: 2026 }); assert.ok(f.length >= 5); });
ok('long spans: rulers at start and end, and no claims the pack can\'t back', () => {
  const r = rulersDuring({ name: 'the family\'s time here', from: 1284, to: 1917, verb: 'happened' }, dates.rulers);
  assert.match(r, /no ruler data for 1284/); assert.match(r, /at the end \(1917\) George V \(1910–1936\)/);
  assert.equal(rulersDuring({ name: 'x', from: 1300, to: 1310, verb: 'built' }, dates.rulers), '');
});
ok('owners timeline', () => {
  const owners = [[1284, 1308, 'Reginald de Grey'], [1833, 1859, 'Thomas, 2nd Earl de Grey'], [2006, null, 'English Heritage']];
  assert.equal(ownerAt(owners, 1835)[0][2], 'Thomas, 2nd Earl de Grey');
  assert.match(ownersDuring(T('orangery'), owners, 'Wrest'), /Wrest was owned by Thomas, 2nd Earl de Grey \(owner 1833–1859\)/);
  assert.match(ownersList(owners, 'Wrest'), /^Owners of Wrest in order: Reginald de Grey \(1284–1308\); .*English Heritage \(2006–today\)/);
  const f = calculatedFacts({ ...dates, owners, site: 'Wrest' }, { things: ['orangery'], ownership: true, detail: 'light', nowYear: 2026 });
  assert.ok(f.some(l => /^Owners of Wrest in order/.test(l)));
});
ok('things the question names are compared however far apart', () => {
  const far = { id: 'x', name: 'the old thing', from: 1290, to: 1290, verb: 'built' };
  const f = calculatedFacts({ ...dates, things: [...dates.things, far] }, { things: ['x', 'house'], nowYear: 2026 });
  assert.ok(f.some(l => /old thing \(1290\) was built BEFORE the present house/.test(l)));
});
ok('years BC (for Egypt)', () => {
  assert.equal(Y(-1550), '1550 BC'); assert.equal(gap(-1, 1), 1); assert.equal(gap(-2560, 2026), 4585);
  const pyramid = { name: 'the Great Pyramid', from: -2560, to: -2540, approx: true, verb: 'built' };
  const temple = { name: 'Abu Simbel', from: -1264, to: -1244, approx: true, verb: 'built' };
  assert.equal(label(pyramid), 'about 2560 BC–2540 BC');
  assert.match(compare(temple, pyramid).text, /AFTER the Great Pyramid \(about 2560 BC–2540 BC\): about 1276 years later/);
});
console.log(`\n${n} passed`);
