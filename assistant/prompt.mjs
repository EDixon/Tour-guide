// Builds the prompt for one question: a fresh, short prompt each time (rules, where the family is, the
// facts the app works out, the best-matching notes, the question), rather than one ever-growing chat.
import { calculatedFacts, mentions, expand } from './maths.mjs';
import { rank } from './retrieve.mjs';

export const RULES = `You are a friendly guide for a family visiting Wrest Park. Answer the QUESTION in under 80 words of plain British English prose (no lists).
- Answer the question directly, then add the most interesting detail from the NOTES, ideally something to do with WHERE WE ARE.
- WHERE WE ARE says where the family is standing. "This", "here" or "it" usually means that place.
- For any date, number of years, age, ruler, or who made or designed something, use the FACTS. They are exact. Never calculate anything yourself. Only give dates that help the answer.
- Write years and numbers as digits, for example 1716.
- For anything else about Wrest Park, use the NOTES.
- If the FACTS and NOTES don't answer it, say you don't know. You may add one sentence of general background if it helps.`;

// Questions about dates, order, ages or rulers get the full date facts; others get only who-made-it and life spans.
const DATE_QUESTION = /\b(when|what year|which year|years?|before|after|during|how long|how old|age|aged|century|centuries|ago|older|oldest|newer|first|last|reign|reigned|king|queen|monarch|throne|dates?|period|same time)\b/i;

// Write dates out in full for the model: "1834–39" -> "1834–1839", "c.1835" -> "about 1835".
export function plainDates(text) {
  return text
    .replace(/\bc\.\s?(\d{3,4})/g, 'about $1')
    .replace(/\b(1\d|20)(\d\d)\s?[–-]\s?(\d\d)\b(?![\d.,]\d)/g, (m, cc, yy, zz) => (+zz > +yy ? `${cc}${yy}–${cc}${zz}` : m));
}

// Where the family is: a tour stop, the dated things there, and the text about it: the knowledge
// section most about this place, or the tour's own points where the knowledge base doesn't cover it yet.
export function hereContext({ tour, dates, sections, stopId }) {
  const stop = tour.stops.find(s => s.id === stopId);
  if (!stop) return null;
  const things = dates.things.filter(t => (t.stops || []).includes(stopId)).map(t => t.id);
  const best = sections
    .map(s => ({ s, n: (s.about || []).filter(id => things.includes(id)).length + (s.kind === 'site' ? 0.5 : 0) }))
    .filter(x => x.n >= 1).sort((a, b) => b.n - a.n)[0];
  const tourText = { title: `${stop.name}${stop.dateLabel ? ` (${stop.dateLabel})` : ''}`, text: [stop.look, ...(stop.bullets || []).map(b => b.t)].filter(Boolean).join(' ') };
  return { id: stopId, name: stop.name, things, section: best ? best.s : null, tourText };
}

const PERSON_PRONOUN = /\b(he|she|him|her|his|hers|they|them|their)\b/i;
const PLACE_WORD = /\b(this|it|here|these|this place|this building)\b/i;

// previous: earlier questions (createSession supplies the latest one that named something). Only questions
// are carried forward, never the model's answers, so a mistake in one answer can't feed the next.
// here: hereContext(...) for where the family is, or null.
export function buildPrompt({ question, sections, dates, nowYear = new Date().getFullYear(), topK = 3, previous = [], here = null }) {
  const last = previous[previous.length - 1];
  const asked = mentions(dates, question);
  const lastM = last ? mentions(dates, last) : null;
  const hereM = here && here.things.length ? expand(dates, { things: here.things }) : null;
  // What the question is about: what it names; otherwise "he/she" means the previous subject and
  // "this/here/it" (or nothing at all) means where we are.
  let m = asked, about = 'question';
  if (!asked.things.length && !asked.named.length) {
    if (lastM && PERSON_PRONOUN.test(question) && !PLACE_WORD.test(question)) { m = lastM; about = 'previous'; }
    else if (hereM) { m = hereM; about = 'here'; }
    else if (lastM) { m = lastM; about = 'previous'; }
  }
  // Notes: when the question names its own subject, the best match for it first, then where we are, then the rest;
  // otherwise where we are first.
  const boost = new Map();
  for (const id of hereM ? hereM.things : []) boost.set(id, 2);
  for (const id of [...m.related, ...m.people]) boost.set(id, Math.max(boost.get(id) || 0, 1));
  for (const id of m.named) boost.set(id, 3);
  for (const id of m.things) boost.set(id, 4);
  const query = about === 'previous' ? `${question} ${last}` : question;
  const hereNote = here ? (here.section || here.tourText) : null;
  const ranked = rank(sections, query, { boost }).filter(s => s.score > 0 && s.title !== hereNote?.title);
  const order = about === 'question' && ranked.length ? [ranked[0], hereNote, ...ranked.slice(1)] : [hereNote, ...ranked];
  const picked = order.filter(Boolean).slice(0, topK);
  // Facts: what the question is about, plus the things where we are (so "was this built before the house?" works).
  const uniq = (a) => [...new Set(a)];
  const facts = calculatedFacts(dates, {
    things: uniq([...m.things, ...(hereM ? hereM.things : [])]),
    related: m.related,
    people: uniq([...m.people, ...(hereM ? hereM.people : [])]),
    named: m.named,
    detail: DATE_QUESTION.test(question) ? 'full' : 'light',
    nowYear,
  });
  const nameOf = (id) => (dates.things.find(t => t.id === id) || dates.people.find(p => p.id === id))?.name;
  const where = here ? `WHERE WE ARE: ${here.name}\n\n` : '';
  const prev = last ? `EARLIER QUESTION: ${last}` + (lastM.things.length || lastM.people.length ? ` (about ${[...lastM.things, ...lastM.related, ...lastM.people].map(nameOf).filter(Boolean).join('; ')})` : '') + '\n\n' : '';
  const text = `${RULES}\n\nQUESTION: ${question}\n\n${where}${prev}` +
    `FACTS:\n${facts.length ? facts.map(f => '- ' + plainDates(f)).join('\n') : '- (none for this question)'}\n\n` +
    `NOTES:\n${picked.map(s => `## ${s.title}\n${plainDates(s.text)}`).join('\n\n')}\n\nQUESTION: ${question}`;
  return { text, picked: picked.map(s => s.title), facts, about };
}

// A conversation, exactly as the app runs it: each question gets a fresh prompt with where the family is now;
// the earlier question carried forward is the most recent one that named something, so chains like
// "Why did he do that?" then "When did he die?" keep their subject. Answers are never remembered.
export function createSession({ sections, dates, tour, nowYear }) {
  const asked = [];
  let subject = null;
  return {
    get asked() { return [...asked]; },
    get subject() { return subject; },
    prompt(question, { stopId = null } = {}) {
      const here = stopId && tour ? hereContext({ tour, dates, sections, stopId }) : null;
      const r = buildPrompt({ question, sections, dates, nowYear, here, previous: subject ? [subject] : [] });
      const m = mentions(dates, question);
      if (m.things.length || m.named.length) subject = question;
      asked.push(question);
      return r;
    },
    reset() { asked.length = 0; subject = null; },
  };
}
