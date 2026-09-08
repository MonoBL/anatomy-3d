// Joint landmarks, for the "shoulder / elbow / wrist" shortcuts in the views
// sheet. A joint is where two bones almost touch, so that is how it is found:
// the closest pair of sampled vertices between the two bones, and the midpoint
// between them. No hand-placed coordinates to drift out of date.

export const JOINTS = [
  { id: 'shoulder', label: 'Shoulder', labelPt: 'Ombro', region: 'upperLimb', a: /^humerus$/, b: /^scapula$/, sided: true },
  { id: 'elbow', label: 'Elbow', labelPt: 'Cotovelo', region: 'upperLimb', a: /^humerus$/, b: /^ulna$/, sided: true },
  { id: 'wrist', label: 'Wrist', labelPt: 'Punho', region: 'upperLimb', a: /^radius$/, b: /^lunate$/, sided: true },
  { id: 'hand', label: 'Hand', labelPt: 'Mão', region: 'upperLimb', a: /^third metacarpal bone$/, b: /^proximal phalanx of middle finger$/, sided: true },
  { id: 'hip', label: 'Hip', labelPt: 'Anca', region: 'lowerLimb', a: /^femur$/, b: /^hip bone$/, sided: true },
  { id: 'knee', label: 'Knee', labelPt: 'Joelho', region: 'lowerLimb', a: /^femur$/, b: /^tibia$/, sided: true },
  { id: 'ankle', label: 'Ankle', labelPt: 'Tornozelo', region: 'lowerLimb', a: /^tibia$/, b: /^talus$/, sided: true },
  { id: 'foot', label: 'Foot', labelPt: 'Pé', region: 'lowerLimb', a: /^third metatarsal bone$/, b: /^proximal phalanx of third toe$/, sided: true },
  { id: 'jaw', label: 'Jaw', labelPt: 'Mandíbula', region: 'head', a: /^mandible$/, b: /^temporal bone$/, sided: true },
  { id: 'skullBase', label: 'Skull base', labelPt: 'Base do crânio', region: 'head', a: /^atlas$/, b: /^occipital bone$/, sided: false },
  { id: 'neckSpine', label: 'Cervical spine', labelPt: 'Coluna cervical', region: 'head', a: /^fourth cervical vertebra$/, b: /^fifth cervical vertebra$/, sided: false },
  { id: 'sternoclavicular', label: 'Sternoclavicular', labelPt: 'Esternoclavicular', region: 'trunk', a: /^clavicle$/, b: /^manubrium$/, sided: true },
  { id: 'lumbarSpine', label: 'Lumbar spine', labelPt: 'Coluna lombar', region: 'trunk', a: /^third lumbar vertebra$/, b: /^fourth lumbar vertebra$/, sided: false },
  { id: 'sacroiliac', label: 'Sacroiliac', labelPt: 'Sacroilíaca', region: 'trunk', a: /^sacrum$/, b: /^hip bone$/, sided: true },
];

const SAMPLES = 600;

function samples(pos) {
  const n = pos.length / 3;
  const stride = Math.max(1, Math.floor(n / SAMPLES));
  const out = [];
  for (let v = 0; v < n; v += stride) out.push([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
  return out;
}

// Bare name: no side word, lower case, so the patterns above stay readable.
function bareName(name) {
  return name.toLowerCase().replace(/^(left|right)\s+/, '').replace(/\s+of (the )?(left|right)\s+/, ' of ');
}

function closestPair(a, b) {
  let best = null, bestD = Infinity;
  for (const p of a) {
    for (const q of b) {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d < bestD) { bestD = d; best = [p, q]; }
    }
  }
  return best ? { point: best[0].map((v, i) => (v + best[1][i]) / 2), gap: Math.sqrt(bestD) } : null;
}

// Parts need `{ name, system, pos, radius }`. Returns one entry per joint and
// side that could be resolved.
export function findJoints(parts, { log = () => {} } = {}) {
  const bones = parts.filter(p => p.system === 'skeletal');
  const bySide = new Map();          // `${side}|${bare name}` -> part
  for (const p of bones) {
    const side = /^left\b/i.test(p.name) || /\bof (the )?left\b/i.test(p.name) ? 'l'
      : /^right\b/i.test(p.name) || /\bof (the )?right\b/i.test(p.name) ? 'r' : null;
    bySide.set(`${side ?? 'x'}|${bareName(p.name)}`, p);
  }
  const cache = new Map();
  const sampled = p => {
    if (!cache.has(p)) cache.set(p, samples(p.pos));
    return cache.get(p);
  };
  const find = (side, re) => {
    for (const [key, p] of bySide) {
      const [s, name] = key.split('|');
      if (s !== side) continue;
      if (re.test(name)) return p;
    }
    return null;
  };

  const out = [];
  for (const joint of JOINTS) {
    for (const side of joint.sided ? ['l', 'r'] : ['x']) {
      const a = find(side, joint.a) ?? find('x', joint.a);
      const b = find(side, joint.b) ?? find('x', joint.b);
      if (!a || !b) { log(`  joint ${joint.id}${side !== 'x' ? `/${side}` : ''}: bones not found`); continue; }
      const hit = closestPair(sampled(a), sampled(b));
      if (!hit) continue;
      out.push({
        id: joint.id, label: joint.label, labelPt: joint.labelPt,
        region: joint.region,
        ...(side === 'x' ? {} : { side }),
        // A view of a joint wants the bone ends around it, not just the gap.
        p: hit.point.map(v => +v.toFixed(4)),
        r: +Math.max(0.035, Math.min(a.radius, b.radius) * 0.7).toFixed(4),
      });
    }
  }
  log(`joints: ${out.length} landmarks from ${JOINTS.length} definitions`);
  return out;
}
