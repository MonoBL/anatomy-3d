// Study notes. A note is a piece of the reader's own text tied to one or more
// structures, so a multiselection ("these four muscles flex the elbow") is one
// note rather than four copies. Stored in localStorage, like the saved views:
// no account, no server, and it survives a reload of the atlas.
//
// The parts are ids from the atlas build. `names` is only a snapshot for the
// list to fall back on: names are read live from the atlas so a note written
// in English still reads in Portuguese.

const KEY = 'atlas.notes';
const LIMIT = 400;
const MAX_LEN = 2000;

export function loadNotes() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch {
    return [];
  }
}

const valid = n => n && typeof n.text === 'string' && Array.isArray(n.parts);

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
    return true;
  } catch {
    // Full, or private browsing. The caller says so rather than failing on.
    return false;
  }
}

export function addNote({ text, parts, names }) {
  const list = loadNotes();
  const item = {
    id: `nt${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    at: Date.now(),
    text: text.slice(0, MAX_LEN),
    parts: [...new Set(parts)],
    names: names ?? [],
  };
  list.unshift(item);
  return save(list) ? item : null;
}

export function updateNote(id, text) {
  const list = loadNotes();
  const item = list.find(n => n.id === id);
  if (!item) return null;
  item.text = text.slice(0, MAX_LEN);
  item.edited = Date.now();
  return save(list) ? item : null;
}

export function removeNote(id) {
  save(loadNotes().filter(n => n.id !== id));
}

// part id -> the notes that mention it, newest first (the list is already
// newest first). Rebuilt whenever the notes change: 400 notes is nothing.
export function notesIndex(list) {
  const map = new Map();
  for (const n of list) {
    for (const id of n.parts) {
      const bucket = map.get(id);
      if (bucket) bucket.push(n); else map.set(id, [n]);
    }
  }
  return map;
}

// localStorage is per device and a cleared browser takes it with it, so the
// notes can leave as a file and come back.
export function exportNotes() {
  return JSON.stringify({ kind: 'human-atlas-notes', version: 1, at: Date.now(), notes: loadNotes() }, null, 2);
}

// Merges rather than replaces: an id already here is left alone, so importing
// the same file twice does not double the list.
export function importNotes(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  const incoming = Array.isArray(data) ? data : data?.notes;
  if (!Array.isArray(incoming)) return null;
  const list = loadNotes();
  const have = new Set(list.map(n => n.id));
  let added = 0;
  for (const n of incoming) {
    if (!valid(n) || have.has(n.id)) continue;
    list.push({
      id: n.id ?? `nt${Date.now().toString(36)}${added}`,
      at: n.at ?? Date.now(),
      edited: n.edited,
      text: String(n.text).slice(0, MAX_LEN),
      parts: [...new Set(n.parts.filter(Number.isInteger))],
      names: Array.isArray(n.names) ? n.names : [],
    });
    added++;
  }
  list.sort((a, b) => (b.edited ?? b.at) - (a.edited ?? a.at));
  return save(list) ? added : null;
}
