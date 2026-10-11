// Offline cache: everything the app needs is cached on first visit; afterwards it runs with no signal.
const VERSION = 'tg-v7';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'planner.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'tours/index.json', 'tours/wrest-park.json',
];
self.addEventListener('install', (e) => {
  // cache: 'reload' bypasses the browser's HTTP cache so an update never caches stale files.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Cache first (works offline); refresh the cache in the background when online.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // The assistant test pages need the network anyway, so always fetch their latest version.
  if (/\/(lab\.(html|js)|prompts\.html|prompt-builder\.html)$|\/(assistant|knowledge)\//.test(url.pathname)) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('Offline and not cached', { status: 503 });
  }));
});
