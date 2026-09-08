// Matches the rows extracted from the myology table (data/miologia-raw.json)
// onto the atlas's muscle keys, and writes data/miologia.json for the build to
// pick up. Run: npm run map:miologia
//
// The table names its muscles in Portuguese, and tools/pt-muscles.mjs already
// carries the Portuguese name for every key, so the join is Portuguese to
// Portuguese: accents and punctuation off, then a token-set comparison, which
// absorbs the differences that remain ("Interósseos Dorsais" against
// "interósseos dorsais da mão", "Gastrocnémios" against "gastrocnémio").
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib-bp3d.mjs';
import { MUSCLES } from './pt-muscles.mjs';

// Rows that name a family rather than one muscle, or that the table spells
// differently enough that no token comparison should be trusted with them.
const FAMILIES = {
  'Iliocostal': ['iliocostalis cervicis', 'iliocostalis lumborum', 'iliocostalis thoracis'],
  'Longuíssimo': ['longissimus capitis', 'longissimus cervicis', 'longissimus thoracis'],
  'Semiespinhal': ['semispinalis capitis', 'semispinalis cervicis', 'semispinalis thoracis'],
  'Espinhal': ['spinalis', 'spinalis thoracis'],
  'Interespinhais': ['interspinales cervicis', 'interspinales lumborum', 'interspinalis thoracis'],
  'Intertransversais': ['anterior cervical intertransversarii', 'posterior cervical intertransversarii',
    'lateral lumbar intertransversarius', 'medial lumbar intertransversarius'],
  'Rotadores': ['cervical rotator', 'thoracic rotator', 'lumbar rotator'],
  'Levantadores das Costelas': ['levatores costarum breves', 'levatores costarum longi'],
  'Intercostais Externos': ['external intercostal'],
  'Intercostais Internos': ['internal intercostal'],
  'Intercostais Íntimos': ['innermost intercostal'],
  'Gastrocnémios': ['gastrocnemius'],
  'Quadricípite': ['rectus femoris', 'vastus intermedius', 'vastus lateralis', 'vastus medialis'],
  'Tensor da Fáscia Lata': ['tensor fasciae latae'],
  'Abdutor do Hallux': ['abductor hallucis'],
  'Adutor do Hallux': ['adductor hallucis'],
  'Extensor Curto do Hallux': ['extensor hallucis brevis'],
  'Extensor Longo do Hallux': ['extensor hallucis longus'],
  'Flexor Curto do Hallux': ['flexor hallucis brevis'],
  'Flexor Longo do Hallux': ['flexor hallucis longus'],
  'Lumbricoides': ['lumbricals of hand', 'lumbrical of hand'],
  'Lumbricoides (pé)': ['lumbrical of foot'],
  'Interósseo Dorsal (pé)': ['dorsal interosseous of foot'],
  'Interósseo Plantar': ['plantar interosseous of foot'],
  'Interósseos Dorsais': ['dorsal interossei of hand'],
  'Interósseos Palmares': ['palmar interossei of hand'],
};

const RAW = path.join(ROOT, 'data/miologia-raw.json');
const OUT = path.join(ROOT, 'data/miologia.json');

const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Portuguese plurals, roughly, so "interósseos" and "interósseo" compare equal.
const stem = w => w.replace(/(oes|ais|eis|is|es|s)$/, '');
const STOP = new Set(['do', 'da', 'dos', 'das', 'de', 'e', 'o', 'a', 'os', 'as', 'no', 'na']);

function tokens(name) {
  return fold(name)
    .replace(/[().,;:º°]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP.has(w))
    .map(stem);
}

function score(a, b) {
  const A = new Set(a), B = new Set(b);
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return (2 * hit) / (A.size + B.size);        // Dice coefficient
}

const rows = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const keys = Object.entries(MUSCLES).map(([key, [pt]]) => ({ key, pt, tok: tokens(pt) }));

const out = {};
const unmatched = [];
let matched = 0;
const entry = row => ({
  o: row.origem || undefined,
  i: row.insercao || undefined,
  a: row.acao || undefined,
  src: row.muscle,
});

for (const row of rows) {
  const family = FAMILIES[row.muscle];
  if (family) {
    matched++;
    for (const key of family) {
      if (!MUSCLES[key]) { unmatched.push(`${row.muscle} -> unknown key ${key}`); continue; }
      out[key] = entry(row);
    }
    continue;
  }
  const tok = tokens(row.muscle);
  let best = null, bestScore = 0;
  for (const cand of keys) {
    const s = score(tok, cand.tok);
    if (s > bestScore) { bestScore = s; best = cand; }
  }
  // Below this the "match" is two muscles that merely share a word.
  if (!best || bestScore < 0.62) {
    unmatched.push(`${row.muscle} (best ${best?.pt ?? '-'} ${bestScore.toFixed(2)})`);
    continue;
  }
  matched++;
  out[best.key] = entry(row);
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`${matched} of ${rows.length} table rows matched a key, `
  + `${Object.keys(out).length} keys covered of ${keys.length}`);
if (unmatched.length) {
  console.log(`\nunmatched (${unmatched.length}):`);
  for (const u of unmatched) console.log(`  ${u}`);
}
const missing = keys.filter(k => !out[k.key]).map(k => k.pt);
if (missing.length) console.log(`\nkeys with no table row (${missing.length}): ${missing.join(', ')}`);
