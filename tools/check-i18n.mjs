// Checks the UI strings: every key used in index.html exists, English and
// Portuguese carry the same keys, and nothing is left untranslated.
// Run: npm run check:i18n
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib-bp3d.mjs';

const { STRINGS } = await import(path.join(ROOT, 'src/i18n.js'));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');

const used = new Set();
for (const m of html.matchAll(/data-i18n(?:-ph|-title|-label)?="([^"]+)"/g)) used.add(m[1]);
for (const m of js.matchAll(/\bt\('([^']+)'\)/g)) used.add(m[1]);
for (const m of js.matchAll(/state\.t\('([^']+)'\)/g)) used.add(m[1]);

const en = new Set(Object.keys(STRINGS.en));
const pt = new Set(Object.keys(STRINGS.pt));
const problems = [];

for (const key of used) if (!en.has(key)) problems.push(`missing in en: ${key}`);
for (const key of en) if (!pt.has(key)) problems.push(`missing in pt: ${key}`);
for (const key of pt) if (!en.has(key)) problems.push(`missing in en: ${key}`);
// Anatomical and interface words that really are the same in both languages.
const SAME_IN_BOTH = new Set([
  'app.title', 'view.A', 'view.P', 'view.S', 'view.I', 'view.lateral', 'view.medial',
  'cut.coronal', 'cut.axial', 'detail.volume', 'offline.title', 'detail.noPt',
]);

for (const key of en) {
  if (!pt.has(key)) continue;
  const same = STRINGS.en[key] === STRINGS.pt[key];
  if (same && !SAME_IN_BOTH.has(key) && STRINGS.en[key] !== '') {
    problems.push(`untranslated: ${key} = "${STRINGS.en[key]}"`);
  }
}
const unused = [...en].filter(k => !used.has(k) && !k.startsWith('src.') && !k.startsWith('compare.')
  && !k.startsWith('systems.') && !k.startsWith('detail.') && !k.startsWith('cut.')
  && !k.startsWith('region.') && !k.startsWith('view.') && !k.startsWith('marks.')
  && !k.startsWith('offline.') && !k.startsWith('contents.') && !k.startsWith('tool.'));

console.log(`${used.size} keys used, ${en.size} defined in en, ${pt.size} in pt`);
if (unused.length) console.log(`possibly unused: ${unused.join(', ')}`);
if (!problems.length) {
  console.log('i18n ok');
} else {
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
