// Date arithmetic for the assistant. The model never does sums: the app works out every date
// relationship that might matter and hands them over as CALCULATED FACTS, which the model must use.
// Pure functions over the merged dates (knowledge/<site>/dates.json plus reference packs).

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// Years BC are stored as negative numbers (-1550 = 1550 BC). There is no year 0, so a gap across it is one less.
export const Y = (y) => (y == null ? 'today' : y < 0 ? `${-y} BC` : String(y));
export const gap = (from, to) => to - from - (from < 0 && to > 0 ? 1 : 0);
const about = (approx) => (approx ? 'about ' : '');

// Full years and words only: small models misread shorthand like "c.1706–29" ("29 years later").
export function label(t) {
  const c = t.approx ? 'about ' : '';
  if (t.to == null || t.to === t.from) return `${c}${Y(t.from)}`;
  return `${c}${Y(t.from)}–${Y(t.to)}`;
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
  if (x.b < y.a) return { rel: 'before', text: `${cap(nA)} ${was(A)} BEFORE ${nB}: ${about(ap)}${plural(gap(x.b, y.a), 'year')} earlier.` };
  if (x.a > y.b) return { rel: 'after', text: `${cap(nA)} ${was(A)} AFTER ${nB}: ${about(ap)}${plural(gap(y.b, x.a), 'year')} later.` };
  if (x.a >= y.a && x.b <= y.b && !(x.a === y.a && x.b === y.b)) {
    const start = gap(y.a, x.a), end = gap(x.b, y.b);
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
  const at = (list, y) => list.filter(([, s, e]) => s <= y && e >= y);
  const covers = (list, y) => list.length && list[0][1] <= y && list[list.length - 1][2] >= y;
  const fmt = (hits) => hits.map(([n, s, e]) => `${n} (${Y(s)}–${Y(e)})`).join(' / ');
  const parts = [];
  for (const [country, list] of Object.entries(rulers)) {
    if (b - a <= 60) {
      if (!covers(list, a) && !covers(list, b)) continue;
      const hits = list.filter(([, s, e]) => s <= b && e >= a); // inclusive: a boundary year lists both rulers
      if (hits.length) parts.push(`${country}: ${hits.map(([n, s, e]) => `${n} (${Y(s)}–${Y(e)})`).join(', then ')}`);
    } else {
      // Long spans (a family's ownership, a temple built over centuries): who reigned at the start and at the end.
      const start = covers(list, a) ? at(list, a) : [], end = covers(list, b) ? at(list, b) : [];
      if (!start.length && !end.length) continue;
      parts.push(`${country}: ${start.length ? `at the start (${Y(a)}) ${fmt(start)}` : `no ruler data for ${Y(a)}`}; ${end.length ? `at the end (${Y(b)}) ${fmt(end)}` : `no ruler data for ${Y(b)}`}`);
    }
  }
  if (!parts.length) return '';
  return b - a <= 60 ? `When ${t.name} ${was(t)} (${label(t)}), the rulers were — ${parts.join('; ')}.` : `Rulers during ${t.name} (${label(t)}) — ${parts.join('. ')}.`;
}

// Who owned the site: owners = [[from, to, "name"], ...] in order (to = null for the present owner).
export function ownerAt(owners, y) {
  return owners.filter(([s, e]) => s <= y && (e == null || e >= y));
}
export function ownersDuring(t, owners, site) {
  if (!owners?.length) return '';
  const { a, b } = span(t);
  const hits = owners.filter(([s, e]) => s <= b && (e == null || e >= a));
  if (!hits.length) return '';
  return `When ${t.name} ${was(t)} (${label(t)}), ${site} was owned by ${hits.map(([s, e, n]) => `${n} (owner ${Y(s)}–${Y(e)})`).join(', then ')}.`;
}
export function ownersList(owners, site) {
  if (!owners?.length) return '';
  return `Owners of ${site} in order: ${owners.map(([s, e, n]) => `${n} (${Y(s)}–${Y(e)})`).join('; ')}.`;
}

// A person's age at a dated thing, or how long after their death it came.
// Birth years are unknown for some people (medieval owners, craftsmen): then only death is used.
export function personAt(p, t) {
  const { a, b } = span(t);
  if (!p.born) {
    const [dy] = p.died || [];
    if (dy && a > dy) return `${cap(t.name)} (${label(t)}) ${was(t)} ${about(t.approx)}${plural(gap(dy, a), 'year')} after ${p.name} died (${Y(dy)}).`;
    return `${p.name}'s birth year is not known, so their age when ${t.name} ${was(t)} (${label(t)}) is not known.`;
  }
  const [by, bm] = p.born, [dy] = p.died || [];
  const ageAt = (y) => gap(by, y) - (bm && bm > 6 ? 1 : 0); // age at mid-year
  if (dy && a > dy) return `${cap(t.name)} (${label(t)}) ${was(t)} ${about(t.approx)}${plural(gap(dy, a), 'year')} after ${p.name} died (${Y(dy)}).`;
  if (b < by) return `${cap(t.name)} (${label(t)}) ${was(t)} ${plural(gap(b, by), 'year')} before ${p.name} was born (${Y(by)}).`;
  const approx = t.approx || !bm;
  if (a === b) return `${p.name} (born ${Y(by)}) was ${about(true)}${ageAt(a)} when ${t.name} ${was(t)} (${label(t)}).`;
  if (t.approx) return `${p.name} (born ${Y(by)}) was about ${ageAt(a)}–${ageAt(Math.min(b, dy ?? b))} when ${t.name} ${was(t)} (${label(t)}).`;
  return `${p.name} (born ${Y(by)}) was ${about(approx)}${ageAt(a)} when ${t.name} was begun (${Y(a)}) and ${about(approx)}${ageAt(Math.min(b, dy ?? b))} when it was finished (${Y(b)}).`;
}

// About a person: who they were, life span and age at death, and their dated life events with ages.
export function personFacts(p) {
  if (!p.born) {
    const lines = [];
    if (p.who) lines.push(`${p.name} was ${p.who}.`);
    lines.push(p.died ? `${p.name}: birth year not known, died ${Y(p.died[0])}.` : `${p.name}: birth and death years not known.`);
    for (const [y, what] of p.events || []) lines.push(`In ${Y(y)}, ${p.name} ${what}.`);
    return lines;
  }
  const [by, bm] = p.born, [dy, dm] = p.died || [];
  const ageAt = (y) => gap(by, y) - (bm && bm > 6 ? 1 : 0);
  const lines = [];
  if (p.who) lines.push(`${p.name} was ${p.who}.`);
  if (dy) {
    const age = bm && dm ? gap(by, dy) - (dm < bm ? 1 : 0) : null;
    lines.push(`${p.name}: born ${Y(by)}, died ${Y(dy)}${age != null ? `, aged ${age}` : `, aged about ${gap(by, dy)}`}.`);
  }
  for (const [y, what] of p.events || []) lines.push(`In ${Y(y)}, aged about ${ageAt(y)}, ${p.name} ${what}.`);
  return lines;
}

export function yearsAgo(t, nowYear) {
  const { a, b } = span(t);
  const ago = a === b ? `${about(t.approx)}${plural(gap(a, nowYear), 'year')} ago` : `${about(t.approx)}${gap(b, nowYear)}–${gap(a, nowYear)} years ago`;
  return `${cap(t.name)} (${label(t)}): ${ago} (counting from ${nowYear}).`;
}

// Build the CALCULATED FACTS block. `things` are what the question is about; `related` are linked
// things (e.g. later alterations) that are compared with them and named, but not given full detail.
// compare: optional explicit list of [thingId, thingId] pairs instead of the default.
// named: people the question itself names (they get a full summary); others only appear through linked things.
// detail: 'full' for questions about dates and order; 'light' (who made it, who someone was, life span only)
// for other questions, so the model isn't handed a page of dates it then recites.
// ownership: true adds the site's full owner chronology (for questions about owners, the family, inheriting, selling).
export function calculatedFacts(dates, { things = [], related = [], people = [], named = [], pairs = [], compare: only = null, detail = 'full', ownership = false, nowYear = new Date().getFullYear() } = {}) {
  const byId = (id) => dates.things.find(t => t.id === id);
  const T = things.map(byId).filter(Boolean), R = related.map(byId).filter(Boolean).filter(t => !things.includes(t.id));
  const P = people.map(id => dates.people.find(p => p.id === id)).filter(Boolean);
  const lines = [];
  for (const p of P.filter(p => named.includes(p.id))) lines.push(...personFacts(p).slice(0, detail === 'light' ? 2 : undefined));
  for (const t of [...T, ...R]) if (t.who) lines.push(`${cap(t.name)} (${label(t)}) ${t.plural ? 'were' : 'was'} ${t.who}.`);
  if (detail === 'light') { if (ownership && dates.owners?.length) lines.push(ownersList(dates.owners, dates.site || 'the site')); return lines; }
  // Things the question names are always compared, however far apart. Linked background items (R) only
  // when within 150 years, so a question about the house doesn't get "548 years after the first record".
  const near = (a, b) => Math.max(a.from, b.from) - Math.min(a.to ?? a.from, b.to ?? b.from) <= 150;
  if (only) { for (const [x, y] of only) if (byId(x) && byId(y)) lines.push(compare(byId(x), byId(y)).text); }
  else {
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) lines.push(compare(T[i], T[j]).text);
    for (const t of T) for (const r of R) if (near(t, r)) lines.push(compare(r, t).text);
  }
  for (const t of T) { const r = rulersDuring(t, dates.rulers); if (r) lines.push(r); }
  const site = dates.site || 'the site';
  for (const t of T) { const o = ownersDuring(t, dates.owners, site); if (o) lines.push(o); }
  if (ownership && dates.owners?.length) lines.push(ownersList(dates.owners, site));
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
