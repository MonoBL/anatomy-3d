// Region assignment report: counts per region and sub-region, plus a sample of
// the parts in each, so a wrong rule shows up as an obviously misplaced name.
// Run: npm run report:regions [substring]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib-bp3d.mjs';

const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/atlas/index.json'), 'utf8'));
const query = process.argv[2];

if (query) {
  const hits = idx.parts.filter(p => p.n.toLowerCase().includes(query.toLowerCase()));
  for (const p of hits.slice(0, 60)) {
    const shared = p.rgw ? `  shared ${JSON.stringify(p.rgw)}` : '';
    console.log(`${p.n.padEnd(46)} ${p.s.padEnd(13)} ${String(p.rg).padEnd(10)} ${String(p.sr ?? '-').padEnd(9)}${shared}`);
  }
  console.log(`${hits.length} matches`);
  process.exit(0);
}

const bySub = new Map();
const byRegion = new Map();
for (const p of idx.parts) {
  byRegion.set(p.rg, (byRegion.get(p.rg) ?? 0) + 1);
  const k = p.sr ?? '-';
  if (!bySub.has(k)) bySub.set(k, []);
  bySub.get(k).push(p);
}

for (const region of idx.regions) {
  const shared = idx.parts.filter(p => p.rg !== region.id && p.rgw?.[region.id]).length;
  console.log(`\n${region.label}  ${byRegion.get(region.id) ?? 0} parts${shared ? ` (+${shared} shared)` : ''}`);
  for (const sub of idx.subregions.filter(s => s.region === region.id)) {
    const parts = bySub.get(sub.id) ?? [];
    const sample = parts.slice(0, 4).map(p => p.n).join(', ');
    console.log(`  ${sub.id.padEnd(9)} ${String(parts.length).padStart(4)}  ${sample}`);
  }
}
const none = bySub.get('-') ?? [];
if (none.length) console.log(`\nno sub-region: ${none.length}  ${none.slice(0, 6).map(p => p.n).join(', ')}`);
