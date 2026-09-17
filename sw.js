// Service worker for dgames. Makes the collection installable and playable with no network.
//
// Every path here is relative to this file, which sits at the site root (`/dgames/` on GitHub Pages,
// because this is a project page rather than a user page). Root-absolute paths like `/index.html` would
// point at the wrong origin root and 404 — that is the single easiest way to break a project-page PWA.
//
// Caching strategy is stale-while-revalidate: serve the cached copy at once, fetch a fresh one in the
// background, and keep it for next time. So a game starts instantly and works on a plane, and an update
// lands one visit later. The alternative, cache-first with a version bump, means remembering to bump a
// constant on every push — a step that gets forgotten exactly once and then serves a stale game forever.
//
// Only the shell is precached. The games are cached the first time each is opened, because Rush Lane
// alone is 1 MB and precaching the lot would spend several megabytes of someone's mobile data on games
// they may never open. The trade: a game has to be visited once before it works offline.
const VERSION = 'dgames-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // One bad URL rejects addAll and the whole install, so add them individually and tolerate misses.
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(
    SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))
  )).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Same origin only, and only inside this worker's scope. Cricket 3D and Rush Lane pull Three.js and
  // Google Fonts off a CDN; those are left to the browser's own HTTP cache rather than mirrored here,
  // since an opaque cross-origin response cannot be inspected and would be cached blind.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return;

  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const fresh = fetch(req).then((res) => {
      // Only store a real, complete response. A 404 or an opaque redirect cached here would be served
      // back forever, which looks exactly like the game having vanished.
      if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (hit) return hit;                       // instant, then `fresh` quietly updates the cache
    const res = await fresh;
    if (res) return res;
    // Offline and never seen: fall back to the launcher for a page request so the app still opens.
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline, and this page has not been opened before.', {
      status: 503, headers: { 'Content-Type': 'text/plain' },
    });
  }));
});
