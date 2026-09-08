// Thumbnail cache for the contents screen. The images are rendered by the
// viewer itself, so nothing has to be shipped with the atlas; they are then
// kept in IndexedDB, keyed by the atlas version, and survive a reload.

const DB_NAME = 'atlas-thumbs';
const STORE = 'thumbs';
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!self.indexedDB) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch(err => {
    // Private browsing and locked-down settings both refuse a database. The
    // contents screen still works; it just re-renders its thumbnails.
    console.warn('thumbnail cache unavailable', err);
    return null;
  });
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function getThumb(key) {
  const db = await open();
  if (!db) return null;
  return new Promise(resolve => {
    const req = tx(db, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function putThumb(key, blob) {
  const db = await open();
  if (!db) return;
  await new Promise(resolve => {
    const req = tx(db, 'readwrite').put(blob, key);
    req.onsuccess = req.onerror = () => resolve();
  });
}

// Everything from an older atlas build is dead weight; drop it on startup.
export async function pruneThumbs(prefix) {
  const db = await open();
  if (!db) return;
  const store = tx(db, 'readwrite');
  const req = store.getAllKeys();
  req.onsuccess = () => {
    for (const key of req.result) {
      if (typeof key === 'string' && !key.startsWith(prefix)) store.delete(key);
    }
  };
}
