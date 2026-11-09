/* Avatar Chess — offline-friendly service worker */
const CACHE_VERSION = 'avatar-chess-welcomemenu1';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './src/main.js',
  './src/game.js',
  './src/board3d.js',
  './src/ai.js',
  './src/ui.js',
  './src/themes.js',
  './src/themePreview3d.js',
  './src/training.js',
  './src/helpDiagrams.js',
  './src/helpWalkthrough.js',
  './src/save.js',
  './src/replay.js',
  './src/sound.js',
  './src/powerFx.js',
  './src/meta.js',
  './src/dice3d.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function matchLocal(request) {
  const direct = await caches.match(request);
  if (direct) return direct;

  const url = new URL(request.url);
  // Strip ?v= so precached modules/CSS still match versioned HTML refs
  if (!url.search) return null;

  const barePath = await caches.match(url.pathname);
  if (barePath) return barePath;

  const fileName = url.pathname.split('/').pop();
  for (const entry of PRECACHE) {
    if (!entry.endsWith(fileName)) continue;
    const hit = await caches.match(new URL(entry, self.registration.scope));
    if (hit) return hit;
  }
  return null;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await matchLocal(req);
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(req, res.clone());
          }
          return res;
        } catch {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return (await caches.match('./index.html')) || (await caches.match('./'));
          }
          throw new Error('Offline and not cached');
        }
      })()
    );
    return;
  }

  // CDN (Three.js, fonts): network-first with cache fallback
  if (
    url.hostname === 'unpkg.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
