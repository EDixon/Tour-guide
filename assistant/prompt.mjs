// Builds the prompt for one question: a fresh, short prompt each time (rules, the facts the app
// worked out, the best-matching notes, the question), rather than one ever-growing chat.
import { calculatedFacts, mentions } from './maths.mjs';
import { rank } from './retrieve.mjs';

export const RULES = `You are a friendly guide for a family visiting Wrest Park. Answer the QUESTION in under 80 words, in British English, written to be read aloud (no lists).
- For any date, number of years, age, ruler, or who made or designed something, use the FACTS. They are exact. Never calculate anything yourself.
- For anything else about Wrest Park, use the NOTES.
- If the FACTS and NOTES don't answer it, say you don't know. You may add one sentence of general background if it helps.`;

// Write dates out in full for the model: "1834–39" -> "1834–1839", "c.1835" -> "about 1835".
export function plainDates(text) {
  return text
    .replace(/\bc\.\s?(\d{3,4})/g, 'about $1')
    .replace(/\b(1\d|20)(\d\d)\s?[–-]\s?(\d\d)\b(?![\d.,]\d)/g, (m, cc, yy, zz) => (+zz > +yy ? `${cc}${yy}–${cc}${zz}` : m));
}

// previous: earlier questions in this conversation, most recent last (createSession manages this as the app will). Only the questions (and what they were
// about) are carried forward, never the model's own answers, so a mistake in one answer can't feed the next.
export function buildPrompt({ question, sections, dates, nowYear = new Date().getFullYear(), topK = 3, previous = [] }) {
  const last = previous[previous.length - 1];
  let m = mentions(dates, question);
  const lastM = last ? mentions(dates, last) : null;
  // A follow-up that names nothing ("why did he do that?") inherits what the previous question was about.
  const followUp = lastM && !m.things.length && !m.named.length;
  if (followUp) m = lastM;
  // Sections about what the question names get a boost over plain keywords; linked people and works a smaller one.
  const boost = new Map();
  for (const id of [...m.related, ...m.people]) boost.set(id, 1);
  for (const id of m.named) boost.set(id, 3);
  for (const id of m.things) boost.set(id, 4);
  const query = followUp ? `${question} ${last}` : question;
  const picked = rank(sections, query, { boost }).filter(s => s.score > 0).slice(0, topK);
  const facts = calculatedFacts(dates, { ...m, nowYear });
  const nameOf = (id) => (dates.things.find(t => t.id === id) || dates.people.find(p => p.id === id))?.name;
  const prev = last ? `EARLIER QUESTION: ${last}` + (lastM.things.length || lastM.people.length ? ` (about ${[...lastM.things, ...lastM.related, ...lastM.people].map(nameOf).filter(Boolean).join('; ')})` : '') + '\n\n' : '';
  const text = `${RULES}\n\nQUESTION: ${question}\n\n${prev}` +
    `FACTS:\n${facts.length ? facts.map(f => '- ' + plainDates(f)).join('\n') : '- (none for this question)'}\n\n` +
    `NOTES:\n${picked.map(s => `## ${s.title}\n${plainDates(s.text)}`).join('\n\n')}\n\nQUESTION: ${question}`;
  return { text, picked: picked.map(s => s.title), facts };
}

// A conversation, exactly as the app runs it: each question gets a fresh prompt; the earlier question carried
// forward is the most recent one that named something, so chains like "Why did he do that?" then "When did he die?"
// keep their subject. Only questions are remembered, never the model's answers.
export function createSession({ sections, dates, nowYear }) {
  const asked = [];
  let subject = null;
  return {
    get asked() { return [...asked]; },
    get subject() { return subject; },
    prompt(question) {
      const r = buildPrompt({ question, sections, dates, nowYear, previous: subject ? [subject] : [] });
      const m = mentions(dates, question);
      if (m.things.length || m.named.length) subject = question;
      asked.push(question);
      return r;
    },
    reset() { asked.length = 0; subject = null; },
  };
}
