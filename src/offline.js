// Service-worker registration and the offline download of the atlas.
// The worker only ships in a build: under vite dev it would serve stale
// modules on every reload.

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      // Ask on every start: a home-screen app can sit open for days, and the
      // worker only notices a new version when it is told to look.
      reg.update();
      setInterval(() => reg.update(), 60 * 60 * 1000);
    } catch (err) {
      console.warn('service worker registration failed', err);
    }
  });

  // A new worker calls clients.claim(), which swaps the controller under a page
  // that is already running with the old assets. Reload once, and only once.
  let swapped = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swapped) return;
    swapped = true;
    location.reload();
  });
}

// Every file a session needs, so a device can be filled up before a lecture.
export function atlasUrls(index, base = '/atlas') {
  return [
    `${base}/index.json`,
    ...index.systems.map(s => `${base}/${s.file}`),
    `${base}/text-en.json.gz`,
    `${base}/text-pt.json.gz`,
  ];
}

// Resolves once the worker reports every file stored. onProgress(done, total).
export async function cacheAtlasOffline(index, onProgress) {
  if (!('serviceWorker' in navigator)) throw new Error('offline storage unavailable');
  const reg = await navigator.serviceWorker.ready;
  const worker = reg.active;
  if (!worker) throw new Error('offline storage not ready');
  const urls = atlasUrls(index);
  return new Promise((resolve, reject) => {
    const onMessage = (e) => {
      const m = e.data;
      if (m?.type !== 'cache-atlas-progress') return;
      onProgress?.(m.done, m.total);
      if (m.complete) {
        navigator.serviceWorker.removeEventListener('message', onMessage);
        resolve(m);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    try {
      worker.postMessage({ type: 'cache-atlas', urls });
    } catch (err) {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      reject(err);
    }
  });
}

// Whether a previous visit already filled the cache.
export async function offlineReady(index) {
  if (!('caches' in self)) return false;
  const cache = await caches.open('atlas-v1');
  const hits = await Promise.all(atlasUrls(index).map(u => cache.match(u)));
  return hits.every(Boolean);
}
