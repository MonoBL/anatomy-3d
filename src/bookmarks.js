// Saved views. Everything needed to put the atlas back where it was: which
// region and side, which systems, what was hidden, peeled, faded, selected and
// pinned, the cuts, and the camera. Stored in localStorage — small, per device,
// and no account to sign into.

const KEY = 'atlas.bookmarks';
const LIMIT = 40;

export function loadBookmarks() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
    return true;
  } catch {
    // Full, or private browsing. The caller reports it rather than failing on.
    return false;
  }
}

export function addBookmark(entry) {
  const list = loadBookmarks();
  const item = { id: `bm${Date.now().toString(36)}`, at: Date.now(), ...entry };
  list.unshift(item);
  return save(list) ? item : null;
}

export function removeBookmark(id) {
  save(loadBookmarks().filter(b => b.id !== id));
}

export function renameBookmark(id, name) {
  const list = loadBookmarks();
  const item = list.find(b => b.id === id);
  if (!item) return;
  item.name = name;
  save(list);
}
