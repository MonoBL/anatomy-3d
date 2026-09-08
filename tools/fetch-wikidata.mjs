// Maps every atlas structure to a Wikidata item through the FMA identifier
// (property P1402), which gives us verified English and Portuguese article
// titles instead of guessed translations.
// Run: npm run fetch:wikidata
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadGraph, loadElements, ancestorsOf } from './lib-bp3d.mjs';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'HumanAtlas/0.1 (BodyParts3D viewer; build script)';
const OUT = path.join(ROOT, 'data/wikidata.json');
const BATCH = 300;
const ANCESTOR_DEPTH = 8;   // how far up the is-a tree we accept a stand-in

const { parents, names } = loadGraph('isa');
const { byConcept, byElement } = loadElements('isa');

const depthMemo = new Map();
const depth = id => {
  if (depthMemo.has(id)) return depthMemo.get(id);
  depthMemo.set(id, 0);
  let d = 0;
  for (const p of parents.get(id) ?? []) d = Math.max(d, depth(p) + 1);
  depthMemo.set(id, d);
  return d;
};

// The concept each mesh is named after, plus its nearest ancestors as fallbacks.
export function conceptChains() {
  const ancMemo = new Map();
  const chains = new Map();
  for (const [eid, cids] of byElement) {
    let best = cids[0];
    for (const c of cids) {
      const dc = depth(c), db = depth(best);
      if (dc > db || (dc === db && byConcept.get(c).els.length < byConcept.get(best).els.length)) best = c;
    }
    const anc = [...ancestorsOf(parents, best, ancMemo)]
      .sort((a, b) => depth(b) - depth(a))
      .slice(0, ANCESTOR_DEPTH);
    chains.set(eid, [best, ...anc]);
  }
  return chains;
}

async function sparql(ids) {
  const values = ids.map(i => `"${i}"`).join(' ');
  // Sitelinks give article titles; labels cover items with no Portuguese article.
  const query = `SELECT ?fma ?item ?en ?pt ?enLabel ?ptLabel WHERE {
  VALUES ?fma { ${values} }
  ?item wdt:P1402 ?fma .
  OPTIONAL { ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?en }
  OPTIONAL { ?b schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> ; schema:name ?pt }
  OPTIONAL { ?item rdfs:label ?enLabel FILTER(lang(?enLabel) = "en") }
  OPTIONAL { ?item rdfs:label ?ptLabel FILTER(lang(?ptLabel) = "pt") }
}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': UA },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) return (await res.json()).results.bindings;
    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error('Wikidata query failed after retries');
}

async function main() {
  const chains = conceptChains();
  const wanted = new Set();
  for (const chain of chains.values()) for (const c of chain) wanted.add(c.replace(/^FMA/, ''));
  const ids = [...wanted];
  console.log(`resolving ${ids.length} FMA ids via Wikidata P1402`);

  const map = {};
  for (let i = 0; i < ids.length; i += BATCH) {
    const rows = await sparql(ids.slice(i, i + BATCH));
    for (const r of rows) {
      const key = `FMA${r.fma.value}`;
      const entry = map[key] ?? (map[key] = { q: r.item.value.split('/').pop() });
      if (r.en) entry.en = r.en.value;
      if (r.pt) entry.pt = r.pt.value;
      if (r.enLabel) entry.enLabel = r.enLabel.value;
      if (r.ptLabel) entry.ptLabel = r.ptLabel.value;
    }
    console.log(`  ${Math.min(i + BATCH, ids.length)}/${ids.length} — ${Object.keys(map).length} matched`);
  }

  // How much of the atlas this actually covers.
  let direct = 0, viaAncestor = 0, none = 0, withPt = 0;
  for (const chain of chains.values()) {
    const hit = chain.find(c => map[c]?.en || map[c]?.pt || map[c]?.ptLabel);
    if (!hit) none++;
    else if (hit === chain[0]) direct++;
    else viaAncestor++;
    if (hit && (map[hit].pt || map[hit].ptLabel)) withPt++;
  }
  console.log(`\nmeshes: ${direct} direct, ${viaAncestor} via ancestor, ${none} unmatched`);
  console.log(`portuguese title available for ${withPt} of ${chains.size} meshes`);
  fs.writeFileSync(OUT, JSON.stringify(map));
  console.log(`wrote ${OUT} (${Object.keys(map).length} entries)`);
}

if (import.meta.filename === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
