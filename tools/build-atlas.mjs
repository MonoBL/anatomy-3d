// Turns the BodyParts3D OBJ dump into per-system binary buffers plus one
// manifest, ready for the web viewer. Run: npm run build:atlas
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { parseObj, computeNormals, weld } from './obj.mjs';
import { loadGraph, loadElements, ancestorsOf, ROOT } from './lib-bp3d.mjs';
import { SYSTEMS, ALL_SYSTEMS, classify } from './systems.mjs';
import { loadSources, describePart } from './describe.mjs';

const OBJ_DIR = path.join(ROOT, 'data/obj/isa_BP3D_4.0_obj_99');
const OUT_DIR = path.join(ROOT, 'public/atlas');

const TRI_BUDGET = 3_000_000;   // total triangles after simplification
const MIN_TRIS = 32;            // never decimate a part below this
const BODY_HEIGHT = 1.75;       // world units for the tallest axis
const GRID_ASPECT = 2.6;        // inventory wall proportions
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- metadata
function buildMeta() {
  const { parents, names } = loadGraph('isa');
  const partof = loadGraph('partof');
  const { byConcept, byElement } = loadElements('isa');
  const ancMemo = new Map(), depthMemo = new Map();
  const depth = id => {
    if (depthMemo.has(id)) return depthMemo.get(id);
    depthMemo.set(id, 0);
    let d = 0;
    for (const p of parents.get(id) ?? []) d = Math.max(d, depth(p) + 1);
    depthMemo.set(id, d);
    return d;
  };
  const nameOf = id => names.get(id) ?? byConcept.get(id)?.name ?? id;
  const meta = new Map();
  for (const [eid, cids] of byElement) {
    // The most specific concept naming this mesh: deepest in the is-a tree,
    // tie-broken by the concept that owns the fewest meshes.
    let best = cids[0];
    for (const c of cids) {
      const dc = depth(c), db = depth(best);
      if (dc > db || (dc === db && byConcept.get(c).els.length < byConcept.get(best).els.length)) best = c;
    }
    const name = byConcept.get(best).name;
    const ancIds = [...ancestorsOf(parents, best, ancMemo)].sort((a, b) => depth(b) - depth(a));
    const anc = ancIds.map(nameOf);
    // Nearest is-a parent and part-of parent, used for the fallback sentence.
    const isaParent = anc[0] ?? null;
    const partofParent = [...(partof.parents.get(best) ?? [])].map(id => partof.names.get(id))[0] ?? null;
    meta.set(eid, {
      fma: best, name, system: classify(name, anc),
      chain: [best, ...ancIds.slice(0, 8)],
      chainNames: [name, ...ancIds.slice(0, 8).map(nameOf)],
      isaParent, partofParent,
    });
  }
  return meta;
}

// Signed volume of a closed mesh, in cubic centimetres.
function meshVolume(pos, idx) {
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
       - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
       + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return Math.abs(v) / 6 * 1e6;   // world units are metres
}

// Left/right partners, matched on the BP3D name minus its side word.
function pairUp(parts) {
  const byKey = new Map();
  for (const p of parts) {
    const m = /^(left|right)\s+(.+)$/i.exec(p.name);
    if (!m) continue;
    const key = `${p.system}|${m[2].toLowerCase()}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)).push(p);
  }
  let n = 0;
  for (const group of byKey.values()) {
    if (group.length !== 2) continue;
    const [a, b] = group;
    if (/^left/i.test(a.name) === /^left/i.test(b.name)) continue;
    a.pair = b.id; b.pair = a.id; n++;
  }
  return n;
}


// Dominant axis of a mesh by power iteration on the covariance matrix. For a
// muscle this lands along the fibre direction, which the shader uses to draw
// striations and to pale out the tendinous ends.
function principalAxis(pos, centroid) {
  const c = [0, 0, 0, 0, 0, 0];   // xx xy xz yy yz zz
  const n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] - centroid[0], y = pos[i + 1] - centroid[1], z = pos[i + 2] - centroid[2];
    c[0] += x * x; c[1] += x * y; c[2] += x * z;
    c[3] += y * y; c[4] += y * z; c[5] += z * z;
  }
  for (let k = 0; k < 6; k++) c[k] /= Math.max(1, n);
  let v = [0.577, 0.577, 0.577];
  for (let it = 0; it < 24; it++) {
    const nx = c[0] * v[0] + c[1] * v[1] + c[2] * v[2];
    const ny = c[1] * v[0] + c[3] * v[1] + c[4] * v[2];
    const nz = c[2] * v[0] + c[4] * v[1] + c[5] * v[2];
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return [0, 1, 0];
    v = [nx / len, ny / len, nz / len];
  }
  return v;
}

// Extent along the mesh's own axis, and how elongated it is across it. Only
// clearly elongated parts get tendinous ends drawn.
function extentAlong(pos, centroid, axis) {
  let along = 0, across = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i] - centroid[0], y = pos[i + 1] - centroid[1], z = pos[i + 2] - centroid[2];
    const d = x * axis[0] + y * axis[1] + z * axis[2];
    const px = x - d * axis[0], py = y - d * axis[1], pz = z - d * axis[2];
    if (Math.abs(d) > along) along = Math.abs(d);
    const r = Math.hypot(px, py, pz);
    if (r > across) across = r;
  }
  return { half: along, elongation: across > 1e-6 ? along / across : 1 };
}

// ------------------------------------------------------------------ helpers
const titleCase = s => s.replace(/\b([a-z])(\w*)/g, (m, a, b) =>
  /^(of|the|and|to|in|for|at|on|with|from|by)$/.test(m) ? m : a.toUpperCase() + b);

// Power-law triangle budget: small parts keep almost all detail, huge meshes
// take the cut. Solve for the scale factor that lands on TRI_BUDGET.
function solveBudget(tris) {
  const P = 0.72;
  const total = tris.reduce((a, b) => a + b, 0);
  if (total <= TRI_BUDGET) return () => Infinity;
  let lo = 0, hi = 1e6;
  const sum = A => tris.reduce((acc, t) => acc + Math.min(t, Math.max(MIN_TRIS, Math.round(A * Math.pow(t, P)))), 0);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sum(mid) > TRI_BUDGET) hi = mid; else lo = mid;
  }
  const A = lo;
  return t => Math.min(t, Math.max(MIN_TRIS, Math.round(A * Math.pow(t, P))));
}


// Rebuild a vertex buffer from a meshoptimizer remap table.
function applyRemap(pos, remap, uniqueVerts) {
  const out = new Float32Array(uniqueVerts * 3);
  for (let v = 0; v < remap.length; v++) {
    const d = remap[v];
    if (d === 0xffffffff) continue;
    out[d * 3] = pos[v * 3];
    out[d * 3 + 1] = pos[v * 3 + 1];
    out[d * 3 + 2] = pos[v * 3 + 2];
  }
  return out;
}

// --------------------------------------------------------------------- main
async function main() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  MeshoptSimplifier.useExperimentalFeatures = false;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const meta = buildMeta();
  const files = fs.readdirSync(OBJ_DIR).filter(f => f.endsWith('.obj')).sort();
  log(`parsing ${files.length} OBJ files`);

  const raw = [];
  for (const f of files) {
    const eid = f.replace(/\.obj$/, '');
    const m = meta.get(eid);
    if (!m) { log(`  skip ${eid} (no metadata)`); continue; }
    const parsed = parseObj(fs.readFileSync(path.join(OBJ_DIR, f)));
    if (!parsed.idx.length) { log(`  skip ${eid} (empty)`); continue; }
    const { pos, idx } = weld(parsed.pos, parsed.idx);
    raw.push({ eid, ...m, pos, idx });
  }
  log(`parsed ${raw.length} meshes, ${raw.reduce((a, r) => a + r.idx.length / 3, 0)} tris`);

  const budget = solveBudget(raw.map(r => r.idx.length / 3));

  // Simplify, then rebuild a compact vertex buffer per part.
  let keptTris = 0;
  for (const r of raw) {
    const targetTris = budget(r.idx.length / 3);
    let idx = r.idx;
    if (targetTris < r.idx.length / 3) {
      const [simplified] = MeshoptSimplifier.simplify(
        r.idx, r.pos, 3, targetTris * 3, 0.05, ['LockBorder']);
      if (simplified.length >= 3) idx = simplified;
    }
    // compactMesh and reorderMesh both renumber `idx` in place and hand back the
    // old -> new vertex map, which the caller must apply to the vertex buffer.
    let pos = applyRemap(r.pos, ...MeshoptSimplifier.compactMesh(idx));
    // Reorder for GPU cache locality; it also makes the buffers gzip better.
    pos = applyRemap(pos, ...MeshoptEncoder.reorderMesh(idx, true, false));
    r.pos = pos;
    r.idx = idx;
    keptTris += idx.length / 3;
  }
  log(`simplified to ${keptTris} tris`);

  // BP3D is millimetres, Z-up, +Y posterior. Map to Y-up, +Z anterior.
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const r of raw) {
    const p = r.pos;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 2], z = -p[i + 1];
      p[i] = x; p[i + 1] = y; p[i + 2] = z;
      if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x;
      if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y;
      if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z;
    }
  }
  const scale = BODY_HEIGHT / (mx[1] - mn[1]);
  const mid = [0, 1, 2].map(a => (mn[a] + mx[a]) / 2);
  for (const r of raw) {
    const p = r.pos;
    for (let i = 0; i < p.length; i += 3) {
      p[i] = (p[i] - mid[0]) * scale;
      p[i + 1] = (p[i + 1] - mid[1]) * scale;
      p[i + 2] = (p[i + 2] - mid[2]) * scale;
    }
  }
  const worldMin = [0, 1, 2].map(a => (mn[a] - mid[a]) * scale);
  const worldMax = [0, 1, 2].map(a => (mx[a] - mid[a]) * scale);
  log('world bounds', worldMin.map(v => v.toFixed(3)).join(','), '->', worldMax.map(v => v.toFixed(3)).join(','));

  // Per-part normals, bounds and centroid.
  for (const r of raw) {
    r.nrm = computeNormals(r.pos, r.idx);
    const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < r.pos.length; i += 3)
      for (let a = 0; a < 3; a++) {
        const v = r.pos[i + a];
        if (v < bmin[a]) bmin[a] = v;
        if (v > bmax[a]) bmax[a] = v;
      }
    r.bmin = bmin; r.bmax = bmax;
    r.centroid = [0, 1, 2].map(a => (bmin[a] + bmax[a]) / 2);
    r.radius = Math.hypot(...[0, 1, 2].map(a => (bmax[a] - bmin[a]) / 2));
    r.volume = meshVolume(r.pos, r.idx);
    r.axis = principalAxis(r.pos, r.centroid);
    const ext = extentAlong(r.pos, r.centroid, r.axis);
    r.half = ext.half;
    r.elong = ext.elongation;
  }

  // Stable global part ids: grouped by system, largest first.
  const sysOrder = new Map(ALL_SYSTEMS.map((s, i) => [s.id, i]));
  raw.sort((a, b) => (sysOrder.get(a.system) - sysOrder.get(b.system)) ||
    (b.radius - a.radius) || a.name.localeCompare(b.name));
  raw.forEach((r, i) => { r.id = i; });
  log(`paired ${pairUp(raw)} left/right structures`);

  // Inventory wall: one slot per part, laid out in reading order.
  const cols = Math.max(1, Math.round(Math.sqrt(raw.length * GRID_ASPECT)));
  const rows = Math.ceil(raw.length / cols);
  // Cell size from a high percentile rather than the max: a handful of
  // full-body meshes (skin) would otherwise blow the whole wall apart.
  const radii = raw.map(r => r.radius).sort((a, b) => a - b);
  const p85 = radii[Math.floor(radii.length * 0.85)];
  const cell = p85 * 1.35 + 0.01;
  raw.forEach((r, i) => {
    const cx = (i % cols) - (cols - 1) / 2;
    const cy = (rows - 1) / 2 - Math.floor(i / cols);
    r.slot = [cx * cell, cy * cell * 1.06, 0];
  });
  log(`inventory grid ${cols} x ${rows}, cell ${cell.toFixed(3)}`);

  // ---------------------------------------------------------- write buffers
  const qMin = worldMin, qScale = [0, 1, 2].map(a => (worldMax[a] - worldMin[a]) / 65535);
  const systems = [];
  for (const sys of ALL_SYSTEMS) {
    const parts = raw.filter(r => r.system === sys.id);
    if (!parts.length) continue;
    const V = parts.reduce((a, r) => a + r.pos.length / 3, 0);
    const I = parts.reduce((a, r) => a + r.idx.length, 0);

    const pos = new Uint16Array(V * 3);
    const nrm = new Int8Array(V * 3);
    const pid = new Uint16Array(V);
    const idx = new Uint32Array(I);
    const entries = [];
    let vo = 0, io = 0;
    for (const r of parts) {
      const vc = r.pos.length / 3;
      for (let v = 0; v < vc; v++) {
        for (let a = 0; a < 3; a++) {
          const q = Math.round((r.pos[v * 3 + a] - qMin[a]) / qScale[a]);
          pos[(vo + v) * 3 + a] = Math.min(65535, Math.max(0, q));
          nrm[(vo + v) * 3 + a] = Math.max(-127, Math.min(127, Math.round(r.nrm[v * 3 + a] * 127)));
        }
        pid[vo + v] = r.id;
      }
      for (let i = 0; i < r.idx.length; i++) idx[io + i] = r.idx[i] + vo;
      entries.push({ id: r.id, vStart: vo, vCount: vc, iStart: io, iCount: r.idx.length });
      vo += vc; io += r.idx.length;
    }

    const header = { vertexCount: V, indexCount: I, parts: entries };
    const json = Buffer.from(JSON.stringify(header), 'utf8');
    const pad = n => (4 - (n % 4)) % 4;
    const jsonPad = pad(json.length);
    const chunks = [];
    const head = Buffer.alloc(12);
    head.write('ATL1', 0, 'ascii');
    head.writeUInt32LE(json.length + jsonPad, 4);
    head.writeUInt32LE(0, 8);
    chunks.push(head, json, Buffer.alloc(jsonPad));
    const push = (buf) => { chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)); const p = pad(buf.byteLength); if (p) chunks.push(Buffer.alloc(p)); };
    push(pos); push(nrm); push(pid); push(idx);
    const bin = Buffer.concat(chunks);
    const gz = zlib.gzipSync(bin, { level: 9 });
    const file = `${sys.id}.bin.gz`;
    fs.writeFileSync(path.join(OUT_DIR, file), gz);

    systems.push({
      id: sys.id, label: sys.label, labelPt: sys.labelPt, info: sys.info,
      color: sys.color, group: sys.group,
      count: parts.length, tris: I / 3, file, bytes: gz.length, rawBytes: bin.length,
    });
    log(`  ${sys.id.padEnd(13)} ${String(parts.length).padStart(4)} parts  ${String(Math.round(I / 3)).padStart(7)} tris  ${(gz.length / 1e6).toFixed(2)} MB`);
  }

  // ----------------------------------------------- names and descriptions
  const sources = loadSources();
  const systemInfo = {
    en: Object.fromEntries(ALL_SYSTEMS.map(s => [s.id, s.info.en])),
    pt: Object.fromEntries(ALL_SYSTEMS.map(s => [s.id, s.info.pt])),
  };
  const text = { en: {}, pt: {} };
  let ptNamed = 0, wikiEn = 0, wikiPt = 0;
  for (const r of raw) {
    const t = describePart({ ...r, name: r.name }, sources, systemInfo);
    text.en[r.id] = { d: t.descEn, ...(t.srcEn ? { s: t.srcEn.t } : {}) };
    text.pt[r.id] = { d: t.descPt, ...(t.namePt ? { n: t.namePt } : {}), ...(t.srcPt ? { s: t.srcPt.t } : {}) };
    if (t.namePt) ptNamed++;
    if (t.srcEn) wikiEn++;
    if (t.srcPt) wikiPt++;
  }
  for (const lang of ['en', 'pt']) {
    const json = JSON.stringify(text[lang]);
    fs.writeFileSync(path.join(OUT_DIR, `text-${lang}.json.gz`), zlib.gzipSync(json, { level: 9 }));
  }
  log(`text: ${ptNamed} portuguese names, ${wikiEn} en / ${wikiPt} pt wikipedia paragraphs`);

  const index = {
    version: 2,
    generated: new Date().toISOString(),
    source: 'BodyParts3D 4.0 (isa element parts)',
    license: 'CC Attribution-Share Alike 2.1 Japan',
    credit: 'BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan',
    bounds: { min: worldMin, max: worldMax },
    quant: { min: qMin, scale: qScale },
    grid: { cols, rows, cell },
    coverage: { ptNames: ptNamed, wikiEn, wikiPt },
    systems,
    parts: raw.map(r => ({
      i: r.id, e: r.eid, n: titleCase(r.name), f: r.fma, s: r.system,
      c: r.centroid.map(v => +v.toFixed(4)),
      g: r.slot.map(v => +v.toFixed(4)),
      r: +r.radius.toFixed(4),
      t: r.idx.length / 3,
      v: +r.volume.toFixed(2),
      a: r.axis.map(v => +v.toFixed(3)),
      h: +r.half.toFixed(4),
      el: +r.elong.toFixed(2),
      ...(r.pair !== undefined ? { p: r.pair } : {}),
    })),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));
  const totalGz = systems.reduce((a, s) => a + s.bytes, 0);
  log(`\nwrote ${systems.length} systems, ${raw.length} parts, ${(totalGz / 1e6).toFixed(2)} MB gz total`);
}

main().catch(e => { console.error(e); process.exit(1); });
