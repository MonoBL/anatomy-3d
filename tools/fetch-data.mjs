// Downloads the BodyParts3D 4.0 source data into data/ and unpacks the meshes.
// Run: npm run fetch:data
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, RAW } from './lib-bp3d.mjs';

const BASE = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST';
const META = [
  'isa_parts_list_e.txt', 'partof_parts_list_e.txt',
  'isa_inclusion_relation_list.txt', 'partof_inclusion_relation_list.txt',
  'isa_element_parts.txt', 'partof_element_parts.txt',
];
const ZIP = 'isa_BP3D_4.0_obj_99.zip';
const OBJ_DIR = path.join(ROOT, 'data/obj');

async function get(name, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`  have ${name}`);
    return;
  }
  process.stdout.write(`  get  ${name} … `);
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
}

fs.mkdirSync(RAW, { recursive: true });
console.log('BodyParts3D 4.0 — CC BY-SA 2.1 Japan, DBCLS');
for (const f of META) await get(f, path.join(RAW, f));
await get(ZIP, path.join(RAW, ZIP));

if (!fs.existsSync(path.join(OBJ_DIR, 'isa_BP3D_4.0_obj_99'))) {
  console.log('  unzip meshes …');
  fs.mkdirSync(OBJ_DIR, { recursive: true });
  execFileSync('unzip', ['-o', '-q', path.join(RAW, ZIP), '-d', OBJ_DIR], { stdio: 'inherit' });
}
const n = fs.readdirSync(path.join(OBJ_DIR, 'isa_BP3D_4.0_obj_99')).filter(f => f.endsWith('.obj')).length;
console.log(`ready: ${n} meshes in data/obj — now run: npm run build:atlas`);
