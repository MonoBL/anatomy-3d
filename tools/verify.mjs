import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path';
const dir = 'public/atlas';
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json')));
for (const sys of index.systems) {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(dir, sys.file)));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const dv = new DataView(ab);
  const jsonLen = dv.getUint32(4, true);
  const h = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 12, jsonLen)).replace(/\0+$/, ''));
  let o = 12 + jsonLen;
  const take = b => { const at = o; o += b + ((4 - (b % 4)) % 4); return at; };
  const V = h.vertexCount, I = h.indexCount;
  const pos = new Uint16Array(ab, take(V * 3 * 2), V * 3);
  const nrm = new Int16Array(ab, take(V * 3 * 2), V * 3);
  const pid = new Uint16Array(ab, take(V * 2), V);
  const idx = new Uint32Array(ab, take(I * 4), I);
  let maxI = 0; for (let i = 0; i < I; i++) if (idx[i] > maxI) maxI = idx[i];
  let zeroN = 0; for (let i = 0; i < V; i++) if (!nrm[i*3] && !nrm[i*3+1] && !nrm[i*3+2]) zeroN++;
  const pidMin = Math.min(...pid.slice(0, 1000)), pidMax = Math.max(...pid.slice(-1000));
  console.log(sys.id.padEnd(13), 'V', String(V).padStart(7), 'I', String(I).padStart(8),
    'maxIdx', String(maxI).padStart(7), maxI < V ? 'ok' : 'OUT-OF-RANGE',
    'zeroNormals', zeroN, 'pid', pidMin, '..', pidMax, 'bytesLeft', buf.byteLength - o);
}
