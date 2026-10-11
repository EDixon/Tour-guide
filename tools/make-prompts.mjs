// Builds prompts.html: copy-and-paste prompts for testing on-phone AI apps (e.g. AI Edge Gallery)
// with the same material the in-app assistant would use. Run: node tools/make-prompts.mjs
import fs from 'node:fs';
import { calculatedFacts, mentions } from '../assistant/maths.mjs';
import { rank, parseSections } from '../assistant/retrieve.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => fs.readFileSync(root + p, 'utf8');
const tour = JSON.parse(read('tours/wrest-park.json'));
const dates = JSON.parse(read('knowledge/wrest-park-dates.json'));
const S = Object.fromEntries(tour.stops.map(s => [s.id, s]));
const bulletNotes = (ids) => ids.filter(id => S[id]).map(id => `## ${S[id].name} (${S[id].dateLabel || S[id].date})\n` + S[id].bullets.map(b => '- ' + b.t).join('\n')).join('\n\n');
const words = (s) => s.split(/\s+/).length;

// ------------------------------------------------ Test 3: fuller notes + calculated facts
const sample = read('knowledge/wrest-park-sample.md');
const sections = parseSections(sample);
const RIVER = ['The boundary canals ("the river")', 'Lancelot "Capability" Brown', 'Jemima, Marchioness Grey'];
const fmt = (secs) => secs.map(x => `## ${x.title}\n${x.text}`).join('\n\n');
const notes = fmt(sections.filter(x => !RIVER.includes(x.title)));
const facts = calculatedFacts(dates, {
  things: ['orangery', 'house', 'pavilion', 'william-statue', 'glorious-revolution'],
  people: ['earl-de-grey', 'duke-of-kent', 'thomas-archer', 'william-iii', 'louis-philippe'],
  compare: [['orangery', 'house'], ['orangery', 'pavilion'], ['william-statue', 'pavilion'], ['william-statue', 'glorious-revolution'], ['admiralty', 'house'], ['riba', 'house'], ['ireland', 'house']],
  nowYear: new Date().getFullYear(),
});
const RULES = `You are a friendly, knowledgeable guide for a family visiting Wrest Park. Answer each question I ask.
Rules:
1. For any date, age, number of years, who was on the throne, or whether something came before, after or during something else, use ONLY the CALCULATED FACTS. They are exact. Never work out dates yourself. If the fact you need is not there, say you can't work that out exactly.
2. For facts about Wrest Park itself (who built or made what, what is inside, what happened here), use only the NOTES. If they don't cover it, say "I don't have that in my notes". Do not guess.
3. For general background (history, people, how things work), you may add what you know, but start that part with "Beyond my notes," and keep it short.
4. British English. Under 100 words. Write it to be read aloud: no lists or headings.`;
const Q3 = [
  'Was the orangery built before or after the house?',
  'Why would a duke put up a statue of a king who had been dead for decades?',
  'How did they keep orange trees alive through the winter here?',
  'Who was on the throne when the Archer Pavilion was built, and what was going on in Europe at the time?',
  'Is there any link between the orange trees and the Habsburgs?',
  'How old was Earl de Grey when he built the house, and what else was he doing then?',
  'Which famous scientist was related to the Duke of Kent, and what did he do?',
  'What year was the visitor centre café built?',
];
// Test 3b: a question about a part of the site not in the first notes, built the way the app would:
// keyword retrieval picks the sections, name matching picks the dated things, and the maths is worked out.
const QR = 'Who made the river?';
const picked = rank(sections, QR).slice(0, 3);
const m = mentions(dates, QR);
const factsR = calculatedFacts(dates, { ...m, nowYear: new Date().getFullYear() });
const EXTRA = `The app has added material for this question.\n\nCALCULATED FACTS (worked out by the app; exact):\n${factsR.map(f => '- ' + f).join('\n')}\n\nNOTES:\n${fmt(picked)}\n\nQUESTION: ${QR}`;
console.log('3b picked:', picked.map(x => x.title).join(' | '), '| things:', m.things.join(','), '| people:', m.people.join(','));

const FULL3 = `${RULES}\n\nCALCULATED FACTS (worked out by the app; exact):\n${facts.map(f => '- ' + f).join('\n')}\n\nNOTES:\n${notes}\n\nQUESTION: ${Q3[0]}`;

// ------------------------------------------------ Earlier tests (bullets only)
const REIGNS = dates.rulers['England/Britain'].filter(([, s]) => s >= 1660 && s < 1936).map(([n, a, b]) => `- ${n}: ${a}–${b}`).join('\n');
const FULL1 = 'You are a friendly guide for a family visiting Wrest Park. Answer the question using ONLY the FACTS, REIGNS and NOTES below. ' +
  'If they do not contain the answer, reply exactly: "Sorry, that isn\'t in my notes." Use British English. Keep answers under 80 words.\n\n' +
  'FACTS:\n' + [
    'The house: built 1834–39 for Thomas, 2nd Earl de Grey, who designed it himself.',
    'The Orangery: built c.1835, also designed by Earl de Grey.',
    'Comparison: the Orangery (c.1835) was built while the house was being built (1834–39).',
    'The Archer Pavilion: built 1709–11 by Thomas Archer for Henry Grey, Duke of Kent.',
    'Statue of William III: lead, 1730s, by John Cheere.',
  ].map(f => '- ' + f).join('\n') + '\n\nREIGNS (British monarchs):\n' + REIGNS +
  '\n\nNOTES:\n' + bulletNotes(['terrace', 'orangery', 'william', 'pavilion', 'staircase', 'oldhouse', 'bathhouse', 'longwater', 'parterre', 'conservatory', 'whh', 'chinese']) +
  '\n\nQUESTION: Was the orangery built before or after the house?';
const FOLLOW1 = ['When was William III king, and why is there a statue of him here?', 'What is trompe-l’œil, and where can we see it here?', 'Who won the 1966 football World Cup?'];

// ------------------------------------------------ page
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let n = 0;
const block = (title, text, note) => { n++; return `
    <div class="card">
      <h2>${title}</h2>
      ${note ? `<p class="small muted">${note}</p>` : ''}
      <textarea id="p${n}" readonly rows="${Math.min(8, text.split('\n').length + 1)}">${esc(text)}</textarea>
      <button class="btn block" data-copy="p${n}">Copy</button>
    </div>`; };
const tokens = (s) => Math.round(words(s) * 1.4 / 100) * 100;
const html = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1f4d3a">
  <title>Test prompts</title>
  <link rel="stylesheet" href="style.css">
  <style>
    body { display: block; }
    main { padding: 16px; max-width: 720px; margin: 0 auto; }
    textarea { width: 100%; box-sizing: border-box; font: 0.8rem/1.35 ui-monospace, monospace; padding: 8px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: inherit; margin: 6px 0 10px; }
    ol { padding-left: 1.2em; } li { margin: 4px 0; }
    details > summary { cursor: pointer; font-weight: 600; padding: 8px 0; }
  </style>
</head>
<body>
  <header id="top"><div class="top-row"><div class="title">Test prompts</div><a class="icon-btn" href="lab.html" style="color:inherit;text-decoration:none">✕</a></div>
    <div class="status">For testing on-phone AI apps (e.g. AI Edge Gallery) with the material the assistant would use.</div></header>
  <main>
    <div class="card">
      <h2>Test 3: fuller notes, dates worked out by the app</h2>
      <ol class="small">
        <li>In Edge Gallery, open the model's settings and raise <b>max tokens</b> to 8,000 or more. This prompt is about ${tokens(FULL3).toLocaleString('en-GB')} tokens.</li>
        <li>New <b>AI Chat</b> with Gemma 4 E2B on GPU. Paste <b>Prompt</b> below (${words(FULL3).toLocaleString('en-GB')} words). It has the rules, ${facts.length} calculated date facts, the notes and the first question.</li>
        <li>Send the <b>follow-ups</b> one at a time in the same chat.</li>
        <li>Send me the answers, times, and anything wrong or dull.</li>
      </ol>
      <p class="small muted">In the real app the calculated facts are worked out for whatever your question mentions, and the notes are the best-matching sections of a much bigger knowledge base. Here both are fixed for these questions.</p>
    </div>
    ${block('Prompt', FULL3, 'Paste as the first message of a new chat.')}
    ${Q3.slice(1).map((q, i) => block(`Follow-up ${i + 1}`, q, i === Q3.length - 2 ? 'Not in the notes: it should say so rather than guess.' : 'Send in the same chat.')).join('')}
    <div class="card">
      <h2>Test 3b: a different part of the site</h2>
      <ol class="small">
        <li>In the same chat, send <b>Plain question</b>. Its first notes don't cover the river, so it should say so rather than guess.</li>
        <li>Then send <b>With the app's added material</b>. This is what the app would actually send: the best-matching notes for the question (found by keyword search) and dates worked out for what it mentions.</li>
      </ol>
    </div>
    ${block('Plain question', QR, 'Send in the same chat, after the test 3 questions.')}
    ${block("With the app's added material", EXTRA, `${words(EXTRA)} words. Send in the same chat.`)}
    <details class="card">
      <summary>Earlier test (tour bullets only)</summary>
      ${block('Full notes + first question', FULL1, 'Paste as the first message of a new chat.')}
      ${FOLLOW1.map((q, i) => block(`Follow-up ${i + 1}`, q, i === 2 ? 'Not in the notes: it should say so.' : 'Send in the same chat.')).join('')}
    </details>
  </main>
  <div id="toast" class="toast hidden"></div>
  <script>
    document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const t = document.getElementById(b.dataset.copy);
      try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
      const s = document.getElementById('toast'); s.textContent = 'Copied'; s.classList.remove('hidden');
      setTimeout(() => s.classList.add('hidden'), 1500);
    }));
  </script>
</body>
</html>
`;
fs.writeFileSync(root + 'prompts.html', html);
console.log(`Test 3 prompt: ${words(FULL3)} words (~${tokens(FULL3)} tokens), ${facts.length} calculated facts`);
