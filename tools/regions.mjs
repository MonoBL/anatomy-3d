// Body regions. BodyParts3D's part-of graph is no help here — it covers only
// 1258 of the 2234 meshes and has no `upper limb` concept at all — so regions
// are derived instead: name rules give every bone a region, then every other
// structure inherits the region of the skeleton it lies against.
//
// Four top-level regions, as in the reference app, with finer sub-regions
// underneath for the joint shortcuts and the preset cards.

export const REGIONS = [
  { id: 'head', label: 'Head and neck', labelPt: 'Cabeça e pescoço' },
  { id: 'trunk', label: 'Trunk', labelPt: 'Tronco' },
  { id: 'upperLimb', label: 'Upper limb', labelPt: 'Membro superior' },
  { id: 'lowerLimb', label: 'Lower limb', labelPt: 'Membro inferior' },
];

export const SUBREGIONS = [
  { id: 'head', region: 'head', label: 'Head', labelPt: 'Cabeça' },
  { id: 'neck', region: 'head', label: 'Neck', labelPt: 'Pescoço' },
  { id: 'thorax', region: 'trunk', label: 'Thorax', labelPt: 'Tórax' },
  { id: 'abdomen', region: 'trunk', label: 'Abdomen', labelPt: 'Abdómen' },
  { id: 'pelvis', region: 'trunk', label: 'Pelvis', labelPt: 'Pelve' },
  { id: 'shoulder', region: 'upperLimb', label: 'Shoulder', labelPt: 'Ombro' },
  { id: 'arm', region: 'upperLimb', label: 'Arm', labelPt: 'Braço' },
  { id: 'forearm', region: 'upperLimb', label: 'Forearm', labelPt: 'Antebraço' },
  { id: 'hand', region: 'upperLimb', label: 'Hand', labelPt: 'Mão' },
  { id: 'thigh', region: 'lowerLimb', label: 'Thigh', labelPt: 'Coxa' },
  { id: 'leg', region: 'lowerLimb', label: 'Leg', labelPt: 'Perna' },
  { id: 'foot', region: 'lowerLimb', label: 'Foot', labelPt: 'Pé' },
];

const SUB_TO_REGION = new Map(SUBREGIONS.map(s => [s.id, s.region]));

// The shoulder girdle belongs to the limb and to the trunk both, the way the
// reference app shows the scapula in either view.
const ALSO_TRUNK = new Set(['shoulder']);

// --------------------------------------------------------------- bone rules
// Order matters: the first match wins, so the specific patterns come first.
const BONE_RULES = [
  // Cranium and face
  [/^(frontal|parietal|occipital|temporal|sphenoid|ethmoid|nasal|zygomatic|palatine|lacrimal|vomer)\b/, 'head'],
  [/^(maxilla|mandible|inferior nasal concha)\b/, 'head'],
  [/\b(alar cartilage|nasal septum)\b/, 'head'],
  [/\b(tooth|gingiva)\b/, 'head'],
  // Neck: cervical spine, hyoid, laryngeal cartilages
  [/^(atlas|axis)$/, 'neck'],
  [/\bcervical vertebra\b/, 'neck'],
  [/^hyoid\b/, 'neck'],
  [/\b(thyroid|cricoid|arytenoid|corniculate|tracheal) cartilage\b/, 'neck'],
  [/^cuneiform cartilage\b/, 'neck'],          // laryngeal, not the foot bone
  // Thorax
  [/\b(rib|costal cartilage)\b/, 'thorax'],
  [/\b(sternum|manubrium|xiphoid process)\b/, 'thorax'],
  [/\bthoracic vertebra\b/, 'thorax'],
  // Abdomen and pelvis
  [/\blumbar vertebra\b/, 'abdomen'],
  [/^(sacrum|coccyx|hip bone|pubic symphysis)\b/, 'pelvis'],
  // Shoulder girdle
  [/^(clavicle|scapula)$/, 'shoulder'],
  // Free upper limb
  [/^humerus$/, 'arm'],
  [/^(radius|ulna)$/, 'forearm'],
  [/^(scaphoid|lunate|triquetral|pisiform|hamate|capitate|trapezium|trapezoid)$/, 'hand'],
  [/\bmetacarpal\b/, 'hand'],
  [/\bphalanx of .*(finger|thumb)\b/, 'hand'],
  // Free lower limb
  [/^(femur|patella)$/, 'thigh'],
  [/^(tibia|fibula)$/, 'leg'],
  [/^(talus|calcaneus|cuboid bone)$/, 'foot'],
  [/^(navicular|sesamoid) bone of .*foot$/, 'foot'],
  [/^(medial|intermediate|lateral) cuneiform bone$/, 'foot'],
  [/\bmetatarsal\b/, 'foot'],
  [/\bphalanx of .*toe\b/, 'foot'],
];

// Which side of the body a structure is on, from the BP3D name. Midline
// structures (sternum, vertebrae, aorta) have no side.
export function sideOf(name) {
  const m = /^(left|right)\b/i.exec(name.trim());
  if (m) return m[1].toLowerCase() === 'left' ? 'l' : 'r';
  // Some names carry the side later on: "Distal Phalanx of Left Big Toe".
  const inner = /\bof (the )?(left|right)\b/i.exec(name);
  return inner ? (inner[2].toLowerCase() === 'left' ? 'l' : 'r') : null;
}

// The sub-region a bone anchors, or null when the name is not a bone we trust
// as an anchor (a plain "Intervertebral Disk" could sit anywhere on the spine).
export function boneSubregion(name) {
  const n = name.toLowerCase()
    .replace(/^(left|right)\s+/, '')
    .replace(/^intervertebral disk of (the )?/, '');
  for (const [re, sub] of BONE_RULES) if (re.test(n)) return sub;
  return null;
}

// ------------------------------------------------------------- spatial index
// A uniform grid over the anchor samples. 3 cm cells: fine enough that a hand
// bone and a forearm bone land in different cells, coarse enough that a query
// almost always finishes in the first 3x3x3 block.
const CELL = 0.03;

class AnchorGrid {
  constructor() {
    this.cells = new Map();
    this.x = []; this.y = []; this.z = []; this.sub = [];
  }

  key(ix, iy, iz) { return `${ix},${iy},${iz}`; }

  add(x, y, z, sub) {
    const i = this.x.length;
    this.x.push(x); this.y.push(y); this.z.push(z); this.sub.push(sub);
    const k = this.key(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    cell.push(i);
  }

  // Nearest anchor sample as [subregion, distance], searching outward one ring
  // at a time and stopping once no closer point can exist outside the box.
  nearest(x, y, z) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
    let best = -1, bestD = Infinity;
    for (let ring = 0; ring <= 24; ring++) {
      // Anything outside the searched box is at least this far away.
      if (best >= 0 && bestD <= (ring - 1) * CELL) break;
      for (let ix = cx - ring; ix <= cx + ring; ix++) {
        for (let iy = cy - ring; iy <= cy + ring; iy++) {
          for (let iz = cz - ring; iz <= cz + ring; iz++) {
            // Only the shell of the box is new on this ring.
            const onShell = Math.abs(ix - cx) === ring || Math.abs(iy - cy) === ring || Math.abs(iz - cz) === ring;
            if (!onShell) continue;
            const cell = this.cells.get(this.key(ix, iy, iz));
            if (!cell) continue;
            for (const i of cell) {
              const d = (x - this.x[i]) ** 2 + (y - this.y[i]) ** 2 + (z - this.z[i]) ** 2;
              if (d < bestD) { bestD = d; best = i; }
            }
          }
        }
      }
      if (best >= 0) bestD = Math.sqrt(bestD);
    }
    return best >= 0 ? [this.sub[best], bestD] : null;
  }
}

// Even sampling of a part's vertices, capped so a 40k-vertex mesh costs the
// same as a small one.
function* sampleVertices(pos, cap) {
  const n = pos.length / 3;
  const stride = Math.max(1, Math.ceil(n / cap));
  for (let v = 0; v < n; v += stride) yield [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
}

// Anchors are sampled at a fixed spacing rather than a fixed count per bone.
// A count per bone biases the vote: a wrist full of small dense bones would
// out-vote the femur next to it, which is what dragged the tibialis muscles
// into the foot and the sartorius into the pelvis.
const ANCHOR_SPACING = 0.008;

function* spacedVertices(pos, seen, spacing = ANCHOR_SPACING) {
  const n = pos.length / 3;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const k = `${Math.round(x / spacing)},${Math.round(y / spacing)},${Math.round(z / spacing)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    yield [x, y, z];
  }
}

const PART_SAMPLES = 260;
// A structure counts as belonging to a second region once a fifth of it lies
// there: enough for the femoral artery to be in the trunk and the thigh both,
// not enough for a stray vote to add a region.
const SECOND_REGION_SHARE = 0.2;
// ...and only if the structure is big enough to physically straddle a boundary.
// In the anatomical position the hands hang beside the hips, so nearest-bone
// voting gave small pelvic structures a share of the upper limb — the glans
// penis showed up in the arm view.
const MULTI_MIN_RADIUS = 0.05;

// ------------------------------------------------------- name-based override
// Geometry alone cannot decide where a structure that spans a joint belongs:
// the sartorius touches the hip bone and the femur both. Anatomical naming
// can, because limb structures are named after limb bones. These rules only
// get to pick between regions the geometry already found, so a brachiocephalic
// vein in the thorax can never be talked into the arm.
const NAME_RULES = [
  [/\b(humer|brachii|brachial(is)?|antebrach|coracobrachial|anconeus)\b/, 'upperLimb'],
  [/\b(radial(is)?|ulnar(is)?|carp(i|al|us)|metacarp|pollicis|thenar|palmar|interosseous of (the )?hand)\b/, 'upperLimb'],
  [/\b(deltoid|supraspinat|infraspinat|subscapular|teres (major|minor)|scapular)\b/, 'upperLimb'],
  [/\b(finger|thumb)\b/, 'upperLimb'],
  [/\b(femor(al|is)|gluteal|gluteus|popliteal|sartorius|gracilis|quadriceps|semitendinosus|semimembranosus)\b/, 'lowerLimb'],
  [/\b(tibial(is)?|fibular(is)?|peroneal|sural|gastrocnemius|soleus|plantaris|popliteus)\b/, 'lowerLimb'],
  [/\b(plantar|hallucis|calcaneal|tars(al|us)|metatars|dorsalis pedis|saphenous|toe)\b/, 'lowerLimb'],
  [/\b(sternocleidomastoid|scalene|jugular|thyroid|laryng|pharyng|cervical)\b/, 'head'],
  [/\b(facial|temporal(is)?|masseter|occipital|frontalis|orbicularis|lingual|palat(al|ine)|maxillary|mandibular|ophthalmic|nasal|orbital)\b/, 'head'],
  [/\b(intercostal|thoracic|abdominal|lumbar|renal|hepatic|gastric|splenic|mesenteric|pulmonary|coronary|azygos|latissimus dorsi|trapezius|pectoralis|serratus)\b/, 'trunk'],
];

// A rule may only move a part into a region that already holds a quarter of it.
const NAME_RULE_SHARE = 0.25;

function nameRegion(name) {
  const n = name.toLowerCase();
  for (const [re, region] of NAME_RULES) if (re.test(n)) return region;
  return null;
}

// Assigns a region to every part. `parts` need `{ name, pos }`; the result is
// written onto each part as `region`, `regions` (weights) and `subregion`.
export function assignRegions(parts, { log = () => {} } = {}) {
  const grid = new AnchorGrid();
  const seen = new Set();
  let anchors = 0;
  for (const p of parts) {
    if (p.system !== 'skeletal') continue;
    const sub = boneSubregion(p.name);
    if (!sub) continue;
    anchors++;
    for (const [x, y, z] of spacedVertices(p.pos, seen)) grid.add(x, y, z, sub);
  }
  log(`region anchors: ${anchors} bones, ${grid.x.length} samples`);
  if (!anchors) throw new Error('no bone anchors matched — check the region rules');

  for (const p of parts) {
    const subVotes = new Map();
    let total = 0;
    for (const [x, y, z] of sampleVertices(p.pos, PART_SAMPLES)) {
      const hit = grid.nearest(x, y, z);
      if (!hit) continue;
      // Plain counts. Weighting by proximity was tried and is worse: broad flat
      // bones (hip bone, scapula) sit closer to more samples than a long thin
      // one, which pulled the sartorius and the femoral artery into the trunk.
      subVotes.set(hit[0], (subVotes.get(hit[0]) ?? 0) + 1);
      total++;
    }
    const regionVotes = new Map();
    for (const [sub, n] of subVotes) {
      const r = SUB_TO_REGION.get(sub);
      regionVotes.set(r, (regionVotes.get(r) ?? 0) + n);
      if (ALSO_TRUNK.has(sub)) regionVotes.set('trunk', (regionVotes.get('trunk') ?? 0) + n);
    }
    // A bone keeps the region its own rule gives it, whatever the vote says.
    const own = p.system === 'skeletal' ? boneSubregion(p.name) : null;
    if (own) {
      subVotes.clear();
      subVotes.set(own, total || 1);
      regionVotes.clear();
      regionVotes.set(SUB_TO_REGION.get(own), total || 1);
      if (ALSO_TRUNK.has(own)) regionVotes.set('trunk', total || 1);
    }
    const sum = total || 1;
    const shares = [...regionVotes].map(([r, n]) => [r, n / sum]).sort((a, b) => b[1] - a[1]);
    p.region = shares[0]?.[0] ?? 'trunk';
    const radius = p.radius ?? (p.bmax
      ? Math.hypot(...[0, 1, 2].map(a => (p.bmax[a] - p.bmin[a]) / 2))
      : Infinity);
    const spans = radius >= MULTI_MIN_RADIUS;
    if (!own) {
      const named = nameRegion(p.name);
      const share = shares.find(([r]) => r === named)?.[1] ?? 0;
      if (named && named !== p.region && share >= NAME_RULE_SHARE) p.region = named;
    }
    p.regions = Object.fromEntries(
      shares.filter(([, s], i) => i === 0 || (spans && s >= SECOND_REGION_SHARE))
        .map(([r, s]) => [r, +s.toFixed(3)]));
    // The sub-region has to sit inside the region that won, or the panel would
    // read "Lower limb / pelvis".
    const subs = [...subVotes].sort((a, b) => b[1] - a[1]);
    p.subregion = subs.find(([sub]) => SUB_TO_REGION.get(sub) === p.region)?.[0]
      ?? subs[0]?.[0] ?? null;
    // Shares per sub-region as well, so "the arm" can include the structures
    // that only pass through it.
    p.subregions = Object.fromEntries(
      subs.map(([sub, n]) => [sub, +(n / sum).toFixed(3)])
        .filter(([, share], i) => i === 0 || (spans && share >= SECOND_REGION_SHARE)));
    p.side = sideOf(p.name);
  }
  return parts;
}

// Bounding box per region, so a region view can trim a vessel that runs out of
// it instead of chasing it up the body. Only the anchor bones shape the box:
// the skeleton is what fixes where a region is, and one full-body mesh (the
// skin) would otherwise stretch every box over the whole figure.
export function regionBoxes(parts, { pad = 0.05 } = {}) {
  const acc = new Map();       // `${id}|${side}` -> box
  const grow = (key, p) => {
    let b = acc.get(key);
    if (!b) acc.set(key, (b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
    for (let a = 0; a < 3; a++) {
      b.min[a] = Math.min(b.min[a], p.bmin[a]);
      b.max[a] = Math.max(b.max[a], p.bmax[a]);
    }
  };
  for (const p of parts) {
    if (p.system !== 'skeletal') continue;
    const sub = boneSubregion(p.name);
    if (!sub) continue;
    const side = sideOf(p.name);
    const ids = [sub, SUB_TO_REGION.get(sub), ...(ALSO_TRUNK.has(sub) ? ['trunk'] : [])];
    for (const id of ids) {
      grow(`${id}|all`, p);
      if (side) grow(`${id}|${side}`, p);
    }
  }
  const round = b => ({
    min: b.min.map(v => +(v - pad).toFixed(4)),
    max: b.max.map(v => +(v + pad).toFixed(4)),
  });
  const out = {};
  for (const [key, b] of acc) {
    if (!Number.isFinite(b.min[0])) continue;
    const [id, side] = key.split('|');
    (out[id] ??= {})[side] = round(b);
  }
  return out;
}
