import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const RAW = path.join(ROOT, 'data/raw');

// BodyParts3D TSVs are UTF-8 with a single header row.
export function readTsv(file) {
  const txt = fs.readFileSync(path.join(RAW, file), 'utf8');
  return txt.split(/\r?\n/).filter(Boolean).slice(1).map(l => l.split('\t'));
}

export function loadGraph(kind = 'isa') {
  const parents = new Map();  // child id -> Set(parent id)
  const names = new Map();
  for (const [pid, pname, cid, cname] of readTsv(`${kind}_inclusion_relation_list.txt`)) {
    if (pname) names.set(pid, pname);
    if (cname) names.set(cid, cname);
    if (!parents.has(cid)) parents.set(cid, new Set());
    parents.get(cid).add(pid);
  }
  return { parents, names };
}

export function loadElements(kind = 'isa') {
  const byConcept = new Map();  // concept id -> {name, els[]}
  const byElement = new Map();  // element file id -> concept ids[]
  for (const [cid, cname, eid] of readTsv(`${kind}_element_parts.txt`)) {
    if (!byConcept.has(cid)) byConcept.set(cid, { name: cname, els: [] });
    byConcept.get(cid).els.push(eid);
    if (!byElement.has(eid)) byElement.set(eid, []);
    byElement.get(eid).push(cid);
  }
  return { byConcept, byElement };
}

// Transitive ancestors, memoised; the memo doubles as a cycle guard.
export function ancestorsOf(parents, id, memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  const out = new Set();
  memo.set(id, out);
  for (const p of parents.get(id) ?? []) {
    out.add(p);
    for (const a of ancestorsOf(parents, p, memo)) out.add(a);
  }
  return out;
}
