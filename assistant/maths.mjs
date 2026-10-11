// Date arithmetic for the assistant. The model never does sums: the app works out every date
// relationship that might matter and hands them over as CALCULATED FACTS, which the model must use.
// Pure functions over a dates file (knowledge/<site>-dates.json).

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const about = (approx) => (approx ? 'about ' : '');

// Full years and words only: small models misread shorthand like "c.1706–29" ("29 years later").
export function label(t) {
  const c = t.approx ? 'about ' : '';
  if (t.to == null || t.to === t.from) return `${c}${t.from}`;
  return `${c}${t.from}–${t.to}`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const span = (t) => ({ a: t.from, b: t.to ?? t.from });
// "was built" / "happened"; "being built" / "happening"
const was = (t) => (t.verb === 'happened' ? 'happened' : `${t.plural ? 'were' : 'was'} ${t.verb}`);
const being = (t) => (t.verb === 'happened' ? 'happening' : `being ${t.verb}`);

// Before / after / during between two dated things.
export function compare(A, B) {
  const x = span(A), y = span(B), ap = A.approx || B.approx;
  const nA = `${A.name} (${label(A)})`, nB = `${B.name} (${label(B)})`;
  if (x.b < y.a) return { rel: 'before', text: `${cap(nA)} ${was(A)} BEFORE ${nB}: ${about(ap)}${plural(y.a - x.b, 'year')} earlier.` };
  if (x.a > y.b) return { rel: 'after', text: `${cap(nA)} ${was(A)} AFTER ${nB}: ${about(ap)}${plural(x.a - y.b, 'year')} later.` };
  if (x.a >= y.a && x.b <= y.b && !(x.a === y.a && x.b === y.b)) {
    const start = x.a - y.a, end = y.b - x.b;
    if (x.a === x.b && A.verb !== 'happened') { // a single year inside a span
      const after = start === 0 ? `in the same year work on ${B.name} began` : `${about(ap)}${plural(start, 'year')} after work on ${B.name} began`;
      const before = end === 0 ? `in the year ${B.name} was finished` : `${about(ap)}${plural(end, 'year')} before ${B.name} was finished`;
      return { rel: 'during', text: `${cap(nA)} ${was(A)} WHILE ${nB} was ${being(B)}, so neither before nor after it: ${after}, ${before}.` };
    }
    const began = start === 0 ? `in the same year work on ${B.name} began` : `${about(ap)}${plural(start, 'year')} after work on ${B.name} began`;
    if (A.verb === 'happened') return { rel: 'during', text: `${cap(nA)} happened WHILE ${nB} was ${being(B)}, starting ${began}.` };
    return { rel: 'during', text: `${cap(nA)} ${was(A)} WHILE ${nB} was ${being(B)}, so neither before nor after it: ` +
      `begun ${began.replace(/^in the same year/, 'in the same year that')}` +
      `${end === 0 ? ', and finished in the same year.' : `, ${about(ap)}${plural(end, 'year')} before ${B.name} was finished.`}` };
  }
  if (y.a >= x.a && y.b <= x.b && !(x.a === y.a && x.b === y.b)) {
    const r = compare(B, A); return { rel: 'contains', text: r.text };
  }
  return { rel: 'overlap', text: `${cap(nA)} and ${nB} overlapped in time.` };
}

// Who reigned during a span, for each country in the dates file.
export function rulersDuring(t, rulers) {
  const { a, b } = span(t);
  const parts = [];
  for (const [country, list] of Object.entries(rulers)) {
    const hits = list.filter(([, s, e]) => s <= b && e >= a); // inclusive: a boundary year lists both rulers
    if (!hits.length) continue;
    parts.push(`${country}: ${hits.map(([n, s, e]) => `${n} (${s}–${e})`).join(', then ')}`);
  }
  return parts.length ? `When ${t.name} ${was(t)} (${label(t)}), the rulers were — ${parts.join('; ')}.` : '';
}

// A person's age at a dated thing, or how long after their death it came.
export function personAt(p, t) {
  const { a, b } = span(t);
  const [by, bm] = p.born, [dy] = p.died || [];
  const ageAt = (y) => y - by - (bm && bm > 6 ? 1 : 0); // age at mid-year
  if (dy && a > dy) return `${cap(t.name)} (${label(t)}) ${was(t)} ${about(t.approx)}${plural(a - dy, 'year')} after ${p.name} died (${dy}).`;
  if (b < by) return `${cap(t.name)} (${label(t)}) ${was(t)} ${plural(by - b, 'year')} before ${p.name} was born (${by}).`;
  const approx = t.approx || !bm;
  if (a === b) return `${p.name} (born ${by}) was ${about(true)}${ageAt(a)} when ${t.name} ${was(t)} (${label(t)}).`;
  if (t.approx) return `${p.name} (born ${by}) was about ${ageAt(a)}–${ageAt(Math.min(b, dy ?? b))} when ${t.name} ${was(t)} (${label(t)}).`;
  return `${p.name} (born ${by}) was ${about(approx)}${ageAt(a)} when ${t.name} was begun (${a}) and ${about(approx)}${ageAt(Math.min(b, dy ?? b))} when it was finished (${b}).`;
}

// About a person: who they were, life span and age at death, and their dated life events with ages.
export function personFacts(p) {
  const [by, bm] = p.born, [dy, dm] = p.died || [];
  const ageAt = (y) => y - by - (bm && bm > 6 ? 1 : 0);
  const lines = [];
  if (p.who) lines.push(`${p.name} was ${p.who}.`);
  if (dy) {
    const age = bm && dm ? dy - by - (dm < bm ? 1 : 0) : null;
    lines.push(`${p.name}: born ${by}, died ${dy}${age != null ? `, aged ${age}` : `, aged about ${dy - by}`}.`);
  }
  for (const [y, what] of p.events || []) lines.push(`In ${y}, aged about ${ageAt(y)}, ${p.name} ${what}.`);
  return lines;
}

export function yearsAgo(t, nowYear) {
  const { a, b } = span(t);
  const ago = a === b ? `${about(t.approx)}${plural(nowYear - a, 'year')} ago` : `${about(t.approx)}${nowYear - b}–${nowYear - a} years ago`;
  return `${cap(t.name)} (${label(t)}): ${ago} (counting from ${nowYear}).`;
}

// Build the CALCULATED FACTS block. `things` are what the question is about; `related` are linked
// things (e.g. later alterations) that are compared with them and named, but not given full detail.
// compare: optional explicit list of [thingId, thingId] pairs instead of the default.
// named: people the question itself names (they get a full summary); others only appear through linked things.
export function calculatedFacts(dates, { things = [], related = [], people = [], named = [], pairs = [], compare: only = null, nowYear = new Date().getFullYear() } = {}) {
  const byId = (id) => dates.things.find(t => t.id === id);
  const T = things.map(byId).filter(Boolean), R = related.map(byId).filter(Boolean).filter(t => !things.includes(t.id));
  const P = people.map(id => dates.people.find(p => p.id === id)).filter(Boolean);
  const lines = [];
  for (const p of P.filter(p => named.includes(p.id))) lines.push(...personFacts(p));
  for (const t of [...T, ...R]) if (t.who) lines.push(`${cap(t.name)} (${label(t)}) ${t.plural ? 'were' : 'was'} ${t.who}.`);
  if (only) { for (const [x, y] of only) if (byId(x) && byId(y)) lines.push(compare(byId(x), byId(y)).text); }
  else {
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) lines.push(compare(T[i], T[j]).text);
    for (const t of T) for (const r of R) lines.push(compare(r, t).text);
  }
  for (const t of T) { const r = rulersDuring(t, dates.rulers); if (r) lines.push(r); }
  // Ages and 'after their death' only for people linked to the thing (builder, owner, subject) or explicitly paired.
  for (const p of P) for (const t of [...T, ...R]) {
    if ((t.people || []).includes(p.id) || pairs.some(([x, y]) => x === p.id && y === t.id)) lines.push(personAt(p, t));
  }
  for (const t of T) lines.push(yearsAgo(t, nowYear));
  return lines;
}

// Find which dated things and people a question mentions (simple name matching), plus the
// things and people linked to them (builder, related works), so the facts cover the context.
export function mentions(dates, question, { expand: doExpand = true } = {}) {
  const q = ' ' + question.toLowerCase().replace(/[^a-z0-9' -]/g, ' ') + ' ';
  const hit = (names) => names.some(n => q.includes(' ' + n + ' ') || q.includes(' ' + n + 's ') || q.includes(' ' + n + "'s "));
  const things = dates.things.filter(t => hit(t.names)).map(t => t.id);
  const named = dates.people.filter(p => hit(p.names)).map(p => p.id);
  return doExpand ? expand(dates, { things, named }) : { things, related: [], people: [...named], named };
}

// Add linked works and people: things' related works, people linked to any of them, and (up to 4) works
// linked to a named person.
export function expand(dates, { things = [], named = [] }) {
  const people = new Set(named);
  const related = new Set();
  for (const pid of named) dates.things.filter(t => (t.people || []).includes(pid) && !things.includes(t.id)).slice(0, 4).forEach(t => related.add(t.id));
  for (const id of things) (dates.things.find(x => x.id === id)?.related || []).forEach(r => { if (!things.includes(r)) related.add(r); });
  for (const id of [...things, ...related]) (dates.things.find(x => x.id === id)?.people || []).forEach(p => people.add(p));
  return { things: [...things], related: [...related], people: [...people], named: [...named] };
}
