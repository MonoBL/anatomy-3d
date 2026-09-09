// Service worker: keeps the shell offline and, on request, the whole atlas.
// The atlas binaries are content-addressed by the build, so they are cached
// forever; index.html never is, or a deploy would never reach the device.
// Bumping these names is what evicts an old shell: the assets are hashed, but
// index.html and the icons are not.
const SHELL = 'shell-v3';
const ATLAS = 'atlas-v1';
const FONTS = 'fonts-v1';

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(SHELL_URLS))
      .catch(() => {})            // a missing optional file must not block install
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => ![SHELL, ATLAS, FONTS].includes(k)).map(k => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req) || await cache.match('/');
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, SHELL));

  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/atlas/')) {
      // index.json changes with every build; the binaries do not.
      const fresh = url.pathname.endsWith('index.json');
      return e.respondWith(fresh ? networkFirst(req, ATLAS) : cacheFirst(req, ATLAS));
    }
    if (url.pathname.startsWith('/assets/') || /\.(png|webmanifest)$/.test(url.pathname)) {
      return e.respondWith(cacheFirst(req, SHELL));
    }
    return;
  }

  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    return e.respondWith(cacheFirst(req, FONTS));
  }
});

// The page asks for the atlas to be stored for offline use and gets progress
// back; the file list comes from the page so the worker needs no build data.
self.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || msg.type !== 'cache-atlas') return;
  const reply = (data) => e.source?.postMessage({ type: 'cache-atlas-progress', ...data });
  e.waitUntil((async () => {
    const cache = await caches.open(ATLAS);
    let done = 0;
    for (const url of msg.urls) {
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { cache: 'reload' });
          if (res.ok) await cache.put(url, res.clone());
        }
      } catch (err) { /* keep going: a partial cache still helps */ }
      reply({ done: ++done, total: msg.urls.length });
    }
    reply({ done, total: msg.urls.length, complete: true });
  })());
});
