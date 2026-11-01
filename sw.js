// Offline-first service worker. Bump VERSION when shipping new files or data.
const VERSION = 'ccarp-v2';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/i18n.js', 'js/lang/vi.js', 'js/store.js', 'js/ui.js', 'js/claude.js', 'js/labs.js', 'js/quiz.js', 'js/views.js',
  'data/domains.json', 'data/questions.json', 'data/plan.json', 'data/labs.json', 'data/case.json',
  'data/vi/domains.json', 'data/vi/questions.json', 'data/vi/plan.json', 'data/vi/labs.json', 'data/vi/case.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // never touch API calls
  // Network first so updates show up; fall back to cache when offline.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
});
