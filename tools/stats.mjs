import fs from 'node:fs';
import path from 'node:path';
import { parseObj } from './obj.mjs';
const dir = 'data/obj/isa_BP3D_4.0_obj_99';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.obj'));
let V = 0, T = 0, big = [];
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (const f of files) {
  const { pos, idx } = parseObj(fs.readFileSync(path.join(dir, f)));
  V += pos.length / 3; T += idx.length / 3;
  big.push([idx.length / 3, f]);
  for (let i = 0; i < pos.length; i += 3)
    for (let a = 0; a < 3; a++) { const v = pos[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
}
big.sort((a, b) => b[0] - a[0]);
console.log('files', files.length, 'verts', V, 'tris', T);
console.log('bbox min', mn.map(v => v.toFixed(1)).join(', '));
console.log('bbox max', mx.map(v => v.toFixed(1)).join(', '));
console.log('size', mx.map((v, i) => (v - mn[i]).toFixed(1)).join(' x '));
console.log('largest:', big.slice(0, 10).map(([t, f]) => `${f}:${t}`).join(' '));
console.log('median tris', big[Math.floor(big.length / 2)][0]);
