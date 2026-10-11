// Date arithmetic for the assistant. The model never does sums: the app works out every date
// relationship that might matter and hands them over as CALCULATED FACTS, which the model must use.
// Pure functions over a dates file (knowledge/<site>-dates.json).

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const about = (approx) => (approx ? 'about ' : '');

export function label(t) {
  const c = t.approx ? 'c.' : '';
  if (t.to == null || t.to === t.from) return `${c}${t.from}`;
  const sameCentury = Math.floor(t.from / 100) === Math.floor(t.to / 100);
  return `${c}${t.from}–${sameCentury ? String(t.to).slice(2) : t.to}`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const span = (t) => ({ a: t.from, b: t.to ?? t.from });
// "was built" / "happened"; "being built" / "happening"
const was = (t) => (t.verb === 'happened' ? 'happened' : `was ${t.verb}`);
const being = (t) => (t.verb === 'happened' ? 'happening' : `being ${t.verb}`);

// Before / after / during between two dated things.
export function compare(A, B) {
  const x = span(A), y = span(B), ap = A.approx || B.approx;
  const nA = `${A.name} (${label(A)})`, nB = `${B.name} (${label(B)})`;
  if (x.b < y.a) return { rel: 'before', text: `${cap(nA)} ${was(A)} BEFORE ${nB}: ${about(ap)}${plural(y.a - x.b, 'year')} earlier.` };
  if (x.a > y.b) return { rel: 'after', text: `${cap(nA)} ${was(A)} AFTER ${nB}: ${about(ap)}${plural(x.a - y.b, 'year')} later.` };
  if (x.a >= y.a && x.b <= y.b && !(x.a === y.a && x.b === y.b)) {
    const start = x.a - y.a, end = y.b - x.b;
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

export function yearsAgo(t, nowYear) {
  const { a, b } = span(t);
  const ago = a === b ? `${about(t.approx)}${plural(nowYear - a, 'year')} ago` : `${about(t.approx)}${nowYear - b}–${nowYear - a} years ago`;
  return `${cap(t.name)} (${label(t)}): ${ago} (counting from ${nowYear}).`;
}

// Build the CALCULATED FACTS block for the things and people relevant to a question.
// compare: optional list of [thingId, thingId] to compare; by default every pair of the things given.
export function calculatedFacts(dates, { things = [], people = [], pairs = [], compare: only = null, nowYear = new Date().getFullYear() } = {}) {
  const T = things.map(id => dates.things.find(t => t.id === id)).filter(Boolean);
  const P = people.map(id => dates.people.find(p => p.id === id)).filter(Boolean);
  const lines = [];
  const byId = (id) => dates.things.find(t => t.id === id);
  if (only) for (const [x, y] of only) { if (byId(x) && byId(y)) lines.push(compare(byId(x), byId(y)).text); }
  else for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) lines.push(compare(T[i], T[j]).text);
  for (const t of T) { const r = rulersDuring(t, dates.rulers); if (r) lines.push(r); }
  // Ages and 'after their death' only for people linked to the thing (builder, owner, subject) or explicitly paired.
  for (const p of P) for (const t of T) {
    if ((t.people || []).includes(p.id) || pairs.some(([x, y]) => x === p.id && y === t.id)) lines.push(personAt(p, t));
  }
  for (const t of T) lines.push(yearsAgo(t, nowYear));
  return lines;
}

// Find which dated things and people a question mentions (simple name matching).
export function mentions(dates, question) {
  const q = ' ' + question.toLowerCase().replace(/[^a-z0-9' -]/g, ' ') + ' ';
  const hit = (names) => names.some(n => q.includes(' ' + n + ' ') || q.includes(' ' + n + 's ') || q.includes(' ' + n + "'s "));
  return {
    things: dates.things.filter(t => hit(t.names)).map(t => t.id),
    people: dates.people.filter(p => hit(p.names)).map(p => p.id),
  };
}
