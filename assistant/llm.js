// Talks to the on-phone model provided by the Android app (window.TourLLMNative).
// In an ordinary browser there is no model: available() is false and the app explains how to get it.
const native = () => (typeof window !== 'undefined' ? window.TourLLMNative : null);
const statusListeners = new Set();
const pending = new Map();
let seq = 0;

if (typeof window !== 'undefined') {
  window.TourLLM = {
    _event(e) {
      if (e.type === 'status') { statusListeners.forEach(f => f(e.status)); return; }
      const p = pending.get(e.id);
      if (!p) return;
      if (e.type === 'token') { p.text += e.text; p.onToken?.(p.text, e.text); }
      else if (e.type === 'done') { pending.delete(e.id); p.resolve({ text: p.text, firstMs: e.firstMs, totalMs: e.totalMs, backend: e.backend }); }
      else if (e.type === 'error') { pending.delete(e.id); p.reject(new Error(e.message || 'Error')); }
    },
  };
}

export const llm = {
  available: () => !!native(),
  appVersion: () => native()?.appVersion?.() || null,
  status() {
    const n = native();
    if (!n) return { state: 'unavailable' };
    try { return JSON.parse(n.status()); } catch (e) { return { state: 'error', error: e.message }; }
  },
  onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
  download: () => native()?.download(),
  importModel: () => native()?.importModel(),
  deleteModel: () => native()?.deleteModel(),
  load: () => native()?.load(),
  // Streams the answer: onToken(fullTextSoFar, newPiece). Resolves with { text, firstMs, totalMs, backend }.
  ask(prompt, { onToken, maxTokens = 320 } = {}) {
    const n = native();
    if (!n) return { id: null, done: Promise.reject(new Error('The offline assistant needs the Android app.')) };
    const id = `q${Date.now()}-${++seq}`;
    const done = new Promise((resolve, reject) => pending.set(id, { onToken, resolve, reject, text: '' }));
    n.ask(id, prompt, maxTokens);
    return { id, done };
  },
  cancel: (id) => native()?.cancel(id),
  saveText: (name, mime, text) => native()?.saveText?.(name, mime, text) ?? false,
};
