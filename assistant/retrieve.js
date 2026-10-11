// Picks the knowledge-base sections most relevant to a question (BM25 keyword scoring).
// The real app will add meaning-based (vector) search alongside this; keywords alone are a fair first test.

const STOP = new Set('a an and are as at be by did do does for from had has have he her his how i in is it its me of on or our she so than that the their them then there these they this to us was we were what when where which who whom why will with you your'.split(' '));
const words = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) || [];
const stem = (w) => w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')).replace(/(ing|ed)$/, '');
const terms = (s) => words(s).filter(w => !STOP.has(w)).map(stem);

// sections: [{ title, text, about? }]; returns sections sorted by score with .score.
// boost: Map of thing/person id -> weight; a section gets the sum of the weights of the ids it is About (max 8).
export function rank(sections, question, { k1 = 1.4, b = 0.75, titleBoost = 2, boost = null } = {}) {
  const docs = sections.map(s => { const t = [...terms(s.title), ...terms(s.title).flatMap(x => Array(titleBoost - 1).fill(x)), ...terms(s.text)]; return { s, t, len: t.length }; });
  const N = docs.length, avg = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, N);
  const df = new Map();
  for (const d of docs) for (const w of new Set(d.t)) df.set(w, (df.get(w) || 0) + 1);
  const q = [...new Set(terms(question))];
  return docs.map(d => {
    let score = 0;
    for (const w of q) {
      const f = d.t.filter(x => x === w).length; if (!f) continue;
      const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5));
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avg));
    }
    // A section about several of the things the question names beats one about a single thing (capped).
    if (boost) score += Math.min(8, [...new Set(d.s.about || [])].reduce((n, id) => n + (boost.get(id) || 0), 0));
    return { ...d.s, score };
  }).sort((x, y) => y.score - x.score);
}

// Parse a knowledge markdown file into sections ("## Title", optional "Kind:" and "Sources:" lines).
export function parseSections(md) {
  return md.split(/^## /m).slice(1).map(sec => {
    const [title, ...rest] = sec.split('\n');
    const body = rest.join('\n');
    return {
      title: title.trim(),
      kind: (body.match(/^Kind:\s*(.*)$/m) || [])[1] || '',
      about: ((body.match(/^About:\s*(.*)$/m) || [])[1] || '').split(',').map(x => x.trim()).filter(Boolean),
      sources: (body.match(/^Sources:\s*(.*)$/m) || [])[1] || '',
      text: body.replace(/^(Kind|About|Sources):.*\n?/gm, '').trim(),
    };
  });
}
