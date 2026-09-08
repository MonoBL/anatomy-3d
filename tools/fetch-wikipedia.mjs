// Pulls the lead paragraph of every Wikipedia article the Wikidata step matched,
// in English and Portuguese. Cached to data/wikipedia.json.
// Run: npm run fetch:wikipedia
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib-bp3d.mjs';

const UA = 'HumanAtlas/0.1 (BodyParts3D anatomy viewer; local build script)';
const IN = path.join(ROOT, 'data/wikidata.json');
const OUT = path.join(ROOT, 'data/wikipedia.json');
const BATCH = 20;            // prop=extracts caps at 20 titles per query

async function extracts(lang, titles) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', prop: 'extracts',
    exintro: '1', explaintext: '1', exlimit: String(BATCH), redirects: '1',
    titles: titles.join('|'),
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      // The anonymous API rate-limits hard; back off rather than hammering it.
      const wait = res.status === 429 ? 5000 * 2 ** attempt : 1500 * (attempt + 1);
      console.warn(`  ${lang} HTTP ${res.status}, waiting ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const out = new Map();
      // Follow redirects and normalisations back to the title we asked for.
      const alias = new Map();
      for (const r of data.query?.redirects ?? []) alias.set(r.to, r.from);
      for (const n of data.query?.normalized ?? []) alias.set(n.to, n.from);
      for (const p of data.query?.pages ?? []) {
        if (!p.extract) continue;
        const asked = alias.get(p.title) ?? p.title;
        out.set(asked, p.extract);
        out.set(p.title, p.extract);
      }
      return out;
    }
  }
  throw new Error(`${lang}.wikipedia failed for a batch`);
}

async function main() {
  const wd = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  for (const lang of ['en', 'pt']) {
    const titles = [...new Set(Object.values(wd).map(e => e[lang]).filter(Boolean))]
      .filter(t => !(`${lang}:${t}` in cache));
    console.log(`${lang}: ${titles.length} articles to fetch`);
    for (let i = 0; i < titles.length; i += BATCH) {
      const slice = titles.slice(i, i + BATCH);
      const got = await extracts(lang, slice);
      await new Promise(r => setTimeout(r, 900));   // stay polite
      for (const t of slice) cache[`${lang}:${t}`] = got.get(t) ?? null;
      if ((i / BATCH) % 10 === 0) {
        console.log(`  ${Math.min(i + BATCH, titles.length)}/${titles.length}`);
        fs.writeFileSync(OUT, JSON.stringify(cache));
      }
    }
    fs.writeFileSync(OUT, JSON.stringify(cache));
  }
  const have = Object.values(cache).filter(Boolean).length;
  console.log(`wrote ${OUT}: ${have} extracts of ${Object.keys(cache).length} lookups`);
}

main().catch(e => { console.error(e); process.exit(1); });
