import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib-bp3d.mjs';

// Muscular layers. "Layer 1" in an atlas means "what you see when you look at
// the body from outside", so the depth of a muscle is measured the way the eye
// measures it: shoot a ray outward from the muscle's own surface and count how
// many other muscles it has to pass through to get out. A muscle that is
// nowhere visible from outside sits behind however many it is behind.
//
// The alternative, distance from the skin, was rejected: it puts the
// subscapularis (thin body wall, deep to the scapula) on the surface.

// Triangles live in a uniform grid; 2 cm cells keep a few dozen per cell for
// this mesh density, which is the sweet spot between traversal and tests.
const CELL = 0.02;
const SAMPLES = 110;          // rays per muscle
const MAX_LAYERS = 6;

// Everything solid that is not a muscle: it hides what is behind it but is
// never itself peeled. Skin is excluded (looking "from outside" means through
// it), and so are vessels and nerves, which are too thin to hide anything.
const BLOCKERS = ['skeletal', 'connective', 'cardiac', 'respiratory', 'digestive',
  'urinary', 'reproductive', 'endocrine', 'sensory'];
// Owner id for those blockers: never in `remaining`, always opaque.
const BLOCKED = -1;

class TriGrid {
  constructor() {
    this.cells = new Map();
    this.tri = [];            // [ax,ay,az, bx,by,bz, cx,cy,cz] per entry
    this.owner = [];          // part id per entry
  }

  addMesh(pos, idx, owner) {
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const e = this.tri.length / 9;
      this.tri.push(
        pos[a], pos[a + 1], pos[a + 2],
        pos[b], pos[b + 1], pos[b + 2],
        pos[c], pos[c + 1], pos[c + 2]);
      this.owner.push(owner);
      // Register in every cell the triangle's box touches.
      const lo = [0, 1, 2].map(k => Math.floor(Math.min(pos[a + k], pos[b + k], pos[c + k]) / CELL));
      const hi = [0, 1, 2].map(k => Math.floor(Math.max(pos[a + k], pos[b + k], pos[c + k]) / CELL));
      for (let ix = lo[0]; ix <= hi[0]; ix++) {
        for (let iy = lo[1]; iy <= hi[1]; iy++) {
          for (let iz = lo[2]; iz <= hi[2]; iz++) {
            const key = `${ix},${iy},${iz}`;
            let cell = this.cells.get(key);
            if (!cell) this.cells.set(key, (cell = []));
            cell.push(e);
          }
        }
      }
    }
  }

  // Möller-Trumbore, front and back faces alike: a muscle is a closed shell,
  // so both of its walls count as one crossing pair and the parity is what
  // matters, not the facing.
  hit(e, ox, oy, oz, dx, dy, dz) {
    const t = this.tri, o = e * 9;
    const e1x = t[o + 3] - t[o], e1y = t[o + 4] - t[o + 1], e1z = t[o + 5] - t[o + 2];
    const e2x = t[o + 6] - t[o], e2y = t[o + 7] - t[o + 1], e2z = t[o + 8] - t[o + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return -1;
    const inv = 1 / det;
    const sx = ox - t[o], sy = oy - t[o + 1], sz = oz - t[o + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return -1;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return -1;
    return (e2x * qx + e2y * qy + e2z * qz) * inv;
  }

  // The distinct owners crossed along the ray, ignoring `skip` and anything
  // behind the origin. Marches the grid cell by cell (3D DDA).
  crossings(ox, oy, oz, dx, dy, dz, skip, maxT = 1.2) {
    const owners = new Set();
    const tested = new Set();
    let ix = Math.floor(ox / CELL), iy = Math.floor(oy / CELL), iz = Math.floor(oz / CELL);
    const step = [Math.sign(dx) || 1, Math.sign(dy) || 1, Math.sign(dz) || 1];
    const tDelta = [Math.abs(CELL / (dx || 1e-9)), Math.abs(CELL / (dy || 1e-9)), Math.abs(CELL / (dz || 1e-9))];
    const next = (i, o, d, s) => {
      const bound = (i + (s > 0 ? 1 : 0)) * CELL;
      return Math.abs((bound - o) / (d || 1e-9));
    };
    let tMax = [next(ix, ox, dx, step[0]), next(iy, oy, dy, step[1]), next(iz, oz, dz, step[2])];
    for (let guard = 0; guard < 400; guard++) {
      const cell = this.cells.get(`${ix},${iy},${iz}`);
      if (cell) {
        for (const e of cell) {
          if (tested.has(e) || this.owner[e] === skip) continue;
          tested.add(e);
          const t = this.hit(e, ox, oy, oz, dx, dy, dz);
          if (t > 1e-4 && t < maxT) owners.add(this.owner[e]);
        }
      }
      const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      if (tMax[axis] > maxT) break;
      if (axis === 0) { ix += step[0]; tMax[0] += tDelta[0]; }
      else if (axis === 1) { iy += step[1]; tMax[1] += tDelta[1]; }
      else { iz += step[2]; tMax[2] += tDelta[2]; }
    }
    return [...owners];
  }
}

// Peels the set one layer at a time: whatever is visible from outside now is
// this layer, and once it is gone whatever became visible is the next. This is
// the definition an atlas plate uses, and it only needs the ray casts once —
// each sample remembers *which* muscles cover it, so later rounds are set
// arithmetic.
// A muscle counts as exposed once this share of its surface samples can see
// out. A couple of clear rays is not enough: almost anything has a gap
// somewhere, which collapsed every region into a single layer.
const EXPOSED_SHARE = 0.25;

function peelOrder(group, ids, maxLayers) {
  const remaining = new Set(ids);
  const layerOf = new Map();
  let layer = 0;
  while (remaining.size) {
    const exposed = [];
    for (const p of group) {
      if (!remaining.has(p.id)) continue;
      let clear = 0;
      const need = Math.max(2, Math.ceil(p.samples.length * EXPOSED_SHARE));
      for (const list of p.samples) {
        // Occluders outside this region are treated as absent: a region view
        // does not draw them, so they cannot hide anything in it.
        if (list.every(o => o !== BLOCKED && !remaining.has(o))) clear++;
        if (clear >= need) break;
      }
      if (clear >= need) exposed.push(p);
    }
    // Nothing exposed means what is left is walled in by bone or by the
    // structures around it (deep facial and pharyngeal muscles, mostly). Rank
    // those by how much they have over them rather than dumping them together.
    let round = exposed;
    if (!round.length) {
      const rest = group.filter(p => remaining.has(p.id));
      const min = Math.min(...rest.map(p => p.crossings));
      round = rest.filter(p => p.crossings <= min);
    }
    for (const p of round) {
      layerOf.set(p.id, Math.min(layer, maxLayers - 1));
      remaining.delete(p.id);
    }
    layer++;
  }
  return layerOf;
}

function readCache(file, sig) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data.sig === sig ? data.samples : null;
  } catch { return null; }
}

function writeCache(file, sig, targets) {
  try {
    const samples = Object.fromEntries(targets.map(p => [p.eid, p.samples]));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ sig, samples }));
  } catch (err) { /* a missing cache only costs time */ }
}

// Samples spread over the surface by area, not by vertex: BP3D tessellates a
// tendon as finely as a belly, and vertex-stride sampling let the subcutaneous
// tendon at the wrist speak for the whole muscle.
function sampleSurface(p, grid) {
  const { pos, idx } = p;
  const areas = new Float64Array(idx.length / 3);
  let total = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    total += (areas[t / 3] = Math.hypot(nx, ny, nz) / 2);
  }
  if (total <= 0) return [];
  const samples = [];
  // One walk over the triangles, taking a point whenever the accumulated area
  // passes the next sample's share. Deterministic, so builds are repeatable.
  const step = total / SAMPLES;
  let acc = 0, nextAt = step * 0.5;
  for (let t = 0; t < idx.length; t += 3) {
    acc += areas[t / 3];
    while (acc >= nextAt && samples.length < SAMPLES) {
      nextAt += step;
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) break;
      nx /= len; ny /= len; nz /= len;
      const cx = (pos[a] + pos[b] + pos[c]) / 3;
      const cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3;
      const cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
      samples.push(grid.crossings(
        cx + nx * 0.0015, cy + ny * 0.0015, cz + nz * 0.0015, nx, ny, nz, p.id));
    }
  }
  return samples;
}

// Assigns `layer` (0 = superficial) to every part in `systems`, ranked inside
// each region so peeling an arm does not peel the back with it. Parts need
// `{ id, name, system, region, pos, nrm, idx }`.
export function assignLayers(parts, { systems = ['muscular'], blockers = BLOCKERS, log = () => {} } = {}) {
  const set = new Set(systems);
  const blockSet = new Set(blockers);
  const targets = parts.filter(p => set.has(p.system));
  if (!targets.length) return parts;

  const grid = new TriGrid();
  for (const p of targets) grid.addMesh(p.pos, p.idx, p.id);
  // Solid structures that are not muscles block the view without ever being
  // peeled: you cannot see the deep forearm flexors through the radius.
  let blocking = 0;
  for (const p of parts) {
    if (!blockSet.has(p.system)) continue;
    grid.addMesh(p.pos, p.idx, BLOCKED);
    blocking++;
  }
  log(`layer grid: ${targets.length} parts + ${blocking} blockers, `
    + `${grid.tri.length / 9} tris, ${grid.cells.size} cells`);

  // The ray casting is the slow half of the build (~35 s), and the peel
  // thresholds are worth tuning, so the samples are cached against a signature
  // of the geometry they were computed from.
  const sig = `${targets.length}:${blocking}:${grid.tri.length}`;
  const cacheFile = path.join(ROOT, 'data/layer-samples.json');
  const cached = readCache(cacheFile, sig);
  if (cached) {
    log(`layer samples: reusing cache (${sig})`);
    for (const p of targets) p.samples = cached[p.eid] ?? [];
  } else {
    for (const p of targets) p.samples = sampleSurface(p, grid);
    writeCache(cacheFile, sig, targets);
  }
  // LAYER_DEBUG=<substring> prints how much of a muscle can see out, which is
  // the number the peel threshold is set against.
  if (process.env.LAYER_DEBUG) {
    const q = process.env.LAYER_DEBUG.toLowerCase();
    for (const p of targets) {
      if (!p.name.toLowerCase().includes(q)) continue;
      const clear = p.samples.filter(l => !l.length).length;
      const hist = p.samples.map(l => l.length).sort((a, b) => a - b);
      log(`  ${p.name.padEnd(44)} clear ${clear}/${p.samples.length}`
        + ` median crossings ${hist[hist.length >> 1]}`);
    }
  }

  for (const p of targets) {
    const counts = p.samples.map(l => l.filter(o => o !== BLOCKED).length).sort((a, b) => a - b);
    p.crossings = counts.length ? counts[counts.length >> 1] : 0;
  }

  // Rank within the region: layer numbers should mean the same thing whichever
  // region is on screen.
  const byRegion = new Map();
  for (const p of targets) {
    if (!byRegion.has(p.region)) byRegion.set(p.region, []);
    byRegion.get(p.region).push(p);
  }
  const layerCount = {};
  for (const [region, group] of byRegion) {
    const ids = group.map(p => p.id);
    const layerOf = peelOrder(group, ids, MAX_LAYERS);
    for (const p of group) p.layer = layerOf.get(p.id) ?? 0;
    layerCount[region] = Math.max(...group.map(p => p.layer)) + 1;
    const hist = Array.from({ length: layerCount[region] }, (_, i) => group.filter(p => p.layer === i).length);
    log(`  ${region.padEnd(10)} ${String(group.length).padStart(4)} muscles, `
      + `${layerCount[region]} layers [${hist.join(' ')}]`);
  }
  for (const p of targets) delete p.samples;
  return layerCount;
}
