import { loadGraph, loadElements, ancestorsOf } from './lib-bp3d.mjs';
import { SYSTEMS, OTHER, classify } from './systems.mjs';
const { parents, names } = loadGraph('isa');
const { byConcept, byElement } = loadElements('isa');
const memo = new Map(), dmemo = new Map();
function depth(id) {
  if (dmemo.has(id)) return dmemo.get(id);
  dmemo.set(id, 0);
  let d = 0; for (const p of parents.get(id) ?? []) d = Math.max(d, depth(p) + 1);
  dmemo.set(id, d); return d;
}
const counts = new Map(), unk = [];
for (const [eid, cids] of byElement) {
  let best = cids[0];
  for (const c of cids) {
    const dc = depth(c), db = depth(best);
    if (dc > db || (dc === db && byConcept.get(c).els.length < byConcept.get(best).els.length)) best = c;
  }
  const own = byConcept.get(best).name;
  const anc = [...ancestorsOf(parents, best, memo)].map(a => names.get(a) ?? a).sort((a, b) => depth(0) || 0);
  const sys = classify(own, anc);
  counts.set(sys, (counts.get(sys) ?? 0) + 1);
  if (sys === 'other') unk.push(own);
}
let tot = 0;
for (const s of [...SYSTEMS, OTHER]) { const c = counts.get(s.id) ?? 0; tot += c; console.log(String(c).padStart(5), s.label); }
console.log('TOTAL', tot);
console.log('\nunclassified sample:', unk.slice(0, 60).join(' / '));
