// Builds the prompt for one question: a fresh, short prompt each time (rules, the facts the app
// worked out, the best-matching notes, the question), rather than one ever-growing chat.
import { calculatedFacts, mentions } from './maths.mjs';
import { rank } from './retrieve.mjs';

export const RULES = `You are a friendly guide for a family visiting Wrest Park. Answer the QUESTION in under 80 words, in British English, written to be read aloud (no lists).
- For any date, number of years, age, ruler, or who made or designed something, use the FACTS. They are exact. Never calculate anything yourself.
- For anything else about Wrest Park, use the NOTES.
- If the FACTS and NOTES don't answer it, say you don't know. You may add one sentence of general background if it helps.`;

export function buildPrompt({ question, sections, dates, nowYear = new Date().getFullYear(), topK = 3, history = [] }) {
  const picked = rank(sections, question).filter(s => s.score > 0).slice(0, topK);
  const facts = calculatedFacts(dates, { ...mentions(dates, question), nowYear });
  const prev = history.length ? `EARLIER IN THIS CONVERSATION:\n${history.map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n')}\n\n` : '';
  const text = `${RULES}\n\nQUESTION: ${question}\n\n${prev}` +
    `FACTS (worked out by the app):\n${facts.length ? facts.map(f => '- ' + f).join('\n') : '- (none for this question)'}\n\n` +
    `NOTES:\n${picked.map(s => `## ${s.title}\n${s.text}`).join('\n\n')}\n\nQUESTION: ${question}`;
  return { text, picked: picked.map(s => s.title), facts };
}
