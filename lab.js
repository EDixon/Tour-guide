// Offline assistant feasibility test: can this phone run a small model with WebGPU, and how fast,
// on a realistic "answer from these notes" prompt? Results are copied back to the chat.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const log = [];
let webllm = null, f16 = false, models = [];

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

// ---------------------------------------------------------------- 1. device
async function checkDevice() {
  const rows = [];
  const add = (k, v) => { rows.push(`<span class="muted">${esc(k)}</span><span>${esc(v)}</span>`); log.push(`${k}: ${v}`); };
  add('Browser', navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 120));
  add('Memory (approx.)', navigator.deviceMemory ? `${navigator.deviceMemory} GB or more` : 'not reported');
  let ok = false;
  if (!('gpu' in navigator)) add('WebGPU', 'not available');
  else {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) add('WebGPU', 'no adapter');
      else {
        ok = true;
        f16 = adapter.features.has('shader-f16');
        const info = adapter.info || {};
        add('WebGPU', 'available');
        add('GPU', [info.vendor, info.architecture, info.description].filter(Boolean).join(' / ') || 'not reported');
        add('16-bit shaders', f16 ? 'yes (faster models)' : 'no (using 32-bit models)');
        add('Max buffer', `${Math.round(adapter.limits.maxBufferSize / 1048576)} MB`);
      }
    } catch (e) { add('WebGPU', 'error: ' + e.message); }
  }
  try {
    const persisted = await navigator.storage?.persist?.();
    const est = await navigator.storage?.estimate?.();
    add('Storage', est ? `${(est.usage / 1e9).toFixed(2)} GB used of ${(est.quota / 1e9).toFixed(1)} GB available to the app` : 'unknown');
    add('Kept by Android', persisted ? 'yes (persistent)' : 'not guaranteed');
  } catch (e) { /* ignore */ }
  $('#device').innerHTML = rows.join('');
  return ok;
}

// ---------------------------------------------------------------- 2. models
const RECOMMENDED = [
  /^Llama-3\.2-1B-Instruct-q4f(16|32)_1-MLC$/,
  /^Qwen3-1\.7B-q4f(16|32)_1-MLC$/,
  /^Qwen2\.5-1\.5B-Instruct-q4f(16|32)_1-MLC$/,
  /^Llama-3\.2-3B-Instruct-q4f(16|32)_1-MLC$/,
  /^Phi-3\.5-mini-instruct-q4f(16|32)_1-MLC$/,
  /^gemma-2-2b-it-q4f(16|32)_1-MLC$/,
  /^Qwen3-4B-q4f(16|32)_1-MLC$/,
];
function listModels(showAll) {
  const want = f16 ? 'q4f16_1' : 'q4f32_1';
  const all = (webllm?.prebuiltAppConfig?.model_list || [])
    .filter(m => !/embed|snowflake|arctic/i.test(m.model_id) && (m.model_type ?? 0) === 0);
  const rec = [];
  for (const re of RECOMMENDED) {
    const hits = all.filter(m => re.test(m.model_id));
    const pick = hits.find(m => m.model_id.includes(want)) || hits[0];
    if (pick) rec.push(pick);
  }
  const list = showAll ? [...rec, ...all.filter(m => !rec.includes(m)).sort((a, b) => (a.vram_required_MB || 0) - (b.vram_required_MB || 0))] : rec;
  models = list;
  $('#models').innerHTML = list.length ? list.map((m, i) => `
    <label class="model"><input type="checkbox" value="${esc(m.model_id)}" ${rec.includes(m) && i < 2 ? 'checked' : ''}>
      <span>${esc(m.model_id)} ${rec.includes(m) ? '<span class="rec">recommended</span>' : ''}
      <small>≈ ${m.vram_required_MB ? (m.vram_required_MB / 1024).toFixed(1) + ' GB memory' : 'size not listed'}${m.low_resource_required ? ' · suits phones' : ''}</small></span></label>`).join('')
    : '<p class="muted">No models found. Is the network on?</p>';
}

// ---------------------------------------------------------------- 3. prompt like the real feature
const REIGNS = [
  ['Charles II', 1660, 1685], ['James II', 1685, 1688], ['William III (jointly with Mary II until 1694)', 1689, 1702], ['Anne', 1702, 1714],
  ['George I', 1714, 1727], ['George II', 1727, 1760], ['George III', 1760, 1820], ['George IV', 1820, 1830], ['William IV', 1830, 1837],
  ['Victoria', 1837, 1901], ['Edward VII', 1901, 1910], ['George V', 1910, 1936],
];
const QUESTIONS = [
  'Was the orangery built before or after the house?',
  'When was William III king, and why is there a statue of him here?',
  'What is trompe-l’œil, and where can we see it here?',
  'Who won the 1966 football World Cup?', // not in the notes: should say so
];
let SYSTEM = '';
async function buildContext() {
  const tour = await (await fetch('tours/wrest-park.json')).json();
  const S = Object.fromEntries(tour.stops.map(s => [s.id, s]));
  const facts = [
    'The house: built 1834–39 for Thomas, 2nd Earl de Grey, who designed it himself.',
    'The Orangery: built c.1835, also designed by Earl de Grey.',
    'Comparison: the Orangery (c.1835) was built while the house was being built (1834–39).',
    'The Archer Pavilion: built 1709–11 by Thomas Archer for Henry Grey, Duke of Kent.',
    'Statue of William III: lead, 1730s, by John Cheere.',
  ];
  const pick = ['terrace', 'orangery', 'william', 'pavilion', 'staircase', 'oldhouse', 'bathhouse', 'longwater', 'parterre', 'conservatory', 'whh', 'chinese'];
  const notes = pick.filter(id => S[id]).map(id => `## ${S[id].name} (${S[id].dateLabel || S[id].date})\n` + S[id].bullets.map(b => '- ' + b.t).join('\n')).join('\n\n');
  SYSTEM = 'You are a friendly guide for a family visiting Wrest Park. Answer the question using ONLY the FACTS, REIGNS and NOTES below. ' +
    'If they do not contain the answer, reply exactly: "Sorry, that isn\'t in my notes." Use British English. Keep answers under 80 words.\n\n' +
    'FACTS:\n' + facts.map(f => '- ' + f).join('\n') + '\n\nREIGNS (British monarchs):\n' + REIGNS.map(([n, a, b]) => `- ${n}: ${a}–${b}`).join('\n') +
    '\n\nNOTES:\n' + notes;
  const words = SYSTEM.split(/\s+/).length;
  $('#ctxwords').textContent = words.toLocaleString('en-GB');
  log.push(`Context: ${words} words`);
}

// ---------------------------------------------------------------- run
async function runTest() {
  const chosen = [...document.querySelectorAll('#models input:checked')].map(i => i.value);
  if (!chosen.length) return toast('Pick at least one model.');
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* ignore */ }
  $('#run').disabled = true;
  const out = $('#results');
  let engine = null;
  for (const id of chosen) {
    const sect = document.createElement('div');
    sect.innerHTML = `<h3>${esc(id)}</h3><div class="t">Downloading / loading…</div><progress max="1" value="0"></progress>`;
    out.appendChild(sect);
    const bar = sect.querySelector('progress'), status = sect.querySelector('.t');
    const t0 = performance.now();
    try {
      const cb = (p) => { bar.value = p.progress ?? 0; status.textContent = p.text || ''; };
      if (!engine) engine = await webllm.CreateMLCEngine(id, { initProgressCallback: cb });
      else { engine.setInitProgressCallback?.(cb); await engine.reload(id); }
    } catch (e) {
      status.textContent = 'Failed to load: ' + e.message;
      log.push(`\n## ${id}\nFAILED to load: ${e.message}`);
      continue;
    }
    const loadS = (performance.now() - t0) / 1000;
    bar.remove();
    status.textContent = `Loaded in ${loadS.toFixed(0)} s (includes download the first time).`;
    log.push(`\n## ${id}\nLoad: ${loadS.toFixed(1)} s`);
    const stats = [];
    for (const q of QUESTIONS) {
      const box = document.createElement('div');
      box.className = 'answer';
      box.innerHTML = `<div class="q">${esc(q)}</div><div class="a">…</div><div class="t"></div>`;
      sect.appendChild(box);
      const userMsg = /^Qwen3/i.test(id) ? q + ' /no_think' : q;
      const tq = performance.now();
      let first = null, text = '', usage = null;
      try {
        const stream = await engine.chat.completions.create({
          messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
          temperature: 0.2, max_tokens: 160, stream: true, stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
          const d = chunk.choices?.[0]?.delta?.content || '';
          if (d && first == null) first = performance.now();
          text += d;
          if (chunk.usage) usage = chunk.usage;
          box.querySelector('.a').textContent = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim() || '…';
        }
      } catch (e) {
        box.querySelector('.a').textContent = 'Error: ' + e.message;
        log.push(`Q: ${q}\nERROR: ${e.message}`);
        continue;
      }
      const end = performance.now();
      const ttft = ((first ?? end) - tq) / 1000, total = (end - tq) / 1000;
      const outTok = usage?.completion_tokens ?? Math.round(text.split(/\s+/).length * 1.3);
      const inTok = usage?.prompt_tokens;
      const decode = first && end > first ? (outTok - 1) / ((end - first) / 1000) : null;
      const prefill = inTok && ttft ? inTok / ttft : null;
      stats.push({ ttft, total, decode, prefill });
      box.querySelector('.t').textContent = `First words after ${ttft.toFixed(1)} s · ${decode ? (decode / 1.3).toFixed(1) + ' words/s' : ''} · done in ${total.toFixed(1)} s`;
      log.push(`Q: ${q}\nA: ${text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()}\n(first words ${ttft.toFixed(1)} s, total ${total.toFixed(1)} s, prompt ${inTok ?? '?'} tokens, prefill ${prefill ? prefill.toFixed(0) : '?'} tok/s, decode ${decode ? decode.toFixed(1) : '?'} tok/s)`);
    }
    if (stats.length) {
      const avg = (k) => stats.filter(s => s[k] != null).reduce((n, s) => n + s[k], 0) / Math.max(1, stats.filter(s => s[k] != null).length);
      const sum = `Average: first words after ${avg('ttft').toFixed(1)} s, answer done in ${avg('total').toFixed(1)} s, ${(avg('decode') / 1.3).toFixed(1)} words/s`;
      const p = document.createElement('p'); p.innerHTML = `<b>${esc(sum)}</b>`; sect.appendChild(p);
      log.push(sum);
    }
  }
  $('#run').disabled = false;
  try { await wake?.release(); } catch (e) { /* ignore */ }
  toast('Test finished. Tap “Copy results”.');
}

async function freeModels() {
  if (!webllm?.deleteModelAllInfoInCache) return toast('Clear site data in Chrome settings to free the space.');
  const ids = [...document.querySelectorAll('#models input')].map(i => i.value);
  for (const id of ids) { try { if (await webllm.hasModelInCache?.(id)) await webllm.deleteModelAllInfoInCache(id); } catch (e) { /* ignore */ } }
  toast('Deleted downloaded test models.');
}

// ---------------------------------------------------------------- boot
(async () => {
  const ok = await checkDevice();
  await buildContext().catch(e => { $('#ctxwords').textContent = '?'; log.push('Context error: ' + e.message); });
  if (!ok) {
    $('#models').innerHTML = '<p>WebGPU isn’t available in this browser, so an offline model can’t run here. Use Chrome on the phone.</p>';
    $('#run').disabled = true;
    return;
  }
  try {
    webllm = await import('https://esm.run/@mlc-ai/web-llm@0.2');
    log.push('WebLLM loaded');
    listModels(false);
  } catch (e) {
    $('#models').innerHTML = `<p>Couldn’t load the AI library (${esc(e.message)}). Check you’re online.</p>`;
    $('#run').disabled = true;
  }
})();
$('#showall').addEventListener('change', (e) => listModels(e.target.checked));
$('#run').addEventListener('click', runTest);
$('#free').addEventListener('click', freeModels);
$('#copy').addEventListener('click', async () => {
  const text = 'Offline assistant test results\n' + log.join('\n');
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into the chat.'); }
  catch (e) { const w = window.open(); w.document.body.innerText = text; }
});
