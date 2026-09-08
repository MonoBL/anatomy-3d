// Generates the PWA icons as PNGs with no image dependency: a few capsule
// distance fields, supersampled, then hand-packed into a PNG.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve(import.meta.dirname, '../public');

const BG = [0x10, 0x12, 0x16];
const BONE = [0xe6, 0xdd, 0xc2];
const ACCENT = [0xd8, 0x7a, 0x5a];

// Distance from p to the segment ab, minus r: <= 0 is inside the capsule.
function capsule(px, py, ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t) - r;
}

// The mark: a standing figure in the anatomical position, arms a little out.
// Coordinates are in a 0..1 square so one description serves every size.
function figure(x, y) {
  let d = Infinity;
  const m = (v) => (d = Math.min(d, v));
  m(Math.hypot(x - 0.5, y - 0.215) - 0.083);          // head
  m(capsule(x, y, 0.5, 0.345, 0.5, 0.55, 0.092));      // torso
  m(capsule(x, y, 0.5, 0.545, 0.5, 0.60, 0.066));      // pelvis
  m(capsule(x, y, 0.565, 0.365, 0.685, 0.635, 0.040));  // arms
  m(capsule(x, y, 0.435, 0.365, 0.315, 0.635, 0.040));
  m(capsule(x, y, 0.455, 0.60, 0.412, 0.875, 0.050));  // legs
  m(capsule(x, y, 0.545, 0.60, 0.588, 0.875, 0.050));
  return d;
}

// The spine reads as the accent, so the icon still says "anatomy" at 32 px.
function spine(x, y) {
  return capsule(x, y, 0.5, 0.30, 0.5, 0.585, 0.019);
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function render(size, { padding = 0, round = 0.22 } = {}) {
  const ss = 3;                                  // supersampling factor
  const px = new Uint8Array(size * size * 4);
  const s = 1 - padding * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgA = 0, figA = 0, spnA = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          // Rounded square background, inset by the padding.
          const bx = Math.max(Math.abs(u - 0.5) - (0.5 - round), 0);
          const by = Math.max(Math.abs(v - 0.5) - (0.5 - round), 0);
          if (Math.hypot(bx, by) <= round) bgA++;
          const fu = (u - padding) / s, fv = (v - padding) / s;
          if (fu >= 0 && fu <= 1 && fv >= 0 && fv <= 1) {
            if (figure(fu, fv) <= 0) figA++;
            if (spine(fu, fv) <= 0) spnA++;
          }
        }
      }
      const n = ss * ss;
      let rgb = BG;
      if (figA) rgb = mix(BG, BONE, figA / n);
      if (spnA) rgb = mix(rgb, ACCENT, spnA / n);
      const o = (y * size + x) * 4;
      px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2];
      px[o + 3] = Math.round((255 * bgA) / n);
    }
  }
  return px;
}

// ------------------------------------------------------------------ PNG
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;      // bit depth
  ihdr[9] = 6;      // truecolour with alpha
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;   // filter: none
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const jobs = [
  ['icon-192.png', 192, { round: 0.22 }],
  ['icon-512.png', 512, { round: 0.22 }],
  // iOS applies its own mask, so ship this one square and unrounded.
  ['apple-touch-icon.png', 180, { round: 0.001, padding: 0.06 }],
  // Maskable: the platform may crop to a circle, so keep the mark in the middle.
  ['icon-maskable-512.png', 512, { round: 0.5, padding: 0.14 }],
];

for (const [name, size, opts] of jobs) {
  fs.writeFileSync(path.join(OUT, name), png(size, render(size, opts)));
  console.log(`${name}  ${size}x${size}`);
}
