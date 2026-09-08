// Minimal OBJ reader for BodyParts3D element files. They carry `v`, `vn` and
// `f` lines, one normal per vertex; the authored normals hold the sculpted
// surface relief, so they are kept rather than recomputed.
export function parseObj(buf) {
  const s = buf.length !== undefined && typeof buf !== 'string' ? buf.toString('latin1') : buf;
  const pos = [];
  const nrm = [];
  const idx = [];
  let i = 0;
  const n = s.length;
  const face = [];

  const num = () => {
    while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
    const start = i;
    while (i < n && s.charCodeAt(i) > 32) i++;
    return start === i ? NaN : parseFloat(s.slice(start, i));
  };

  while (i < n) {
    // Start of a line: dispatch on the keyword.
    const c = s[i];
    if (c === 'v' && (s[i + 1] === ' ' || s[i + 1] === '\t')) {
      i += 2;
      pos.push(num(), num(), num());
    } else if (c === 'v' && s[i + 1] === 'n' && (s[i + 2] === ' ' || s[i + 2] === '\t')) {
      i += 3;
      nrm.push(num(), num(), num());
    } else if (c === 'f' && (s[i + 1] === ' ' || s[i + 1] === '\t')) {
      i += 2;
      face.length = 0;
      while (i < n && s[i] !== '\n' && s[i] !== '\r') {
        while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
        if (i >= n || s[i] === '\n' || s[i] === '\r') break;
        const start = i;
        while (i < n && s.charCodeAt(i) > 32) i++;
        const tok = s.slice(start, i);
        const slash = tok.indexOf('/');
        let v = parseInt(slash === -1 ? tok : tok.slice(0, slash), 10);
        if (v < 0) v = pos.length / 3 + v; else v -= 1;
        face.push(v);
      }
      // Fan-triangulate any polygon.
      for (let k = 2; k < face.length; k++) idx.push(face[0], face[k - 1], face[k]);
    }
    // Skip to the next line.
    while (i < n && s[i] !== '\n') i++;
    i++;
  }
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), idx: Uint32Array.from(idx) };
}

// Area-weighted smooth normals.
export function computeNormals(pos, idx) {
  const nrm = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
    const e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
    nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
    nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
  }
  for (let v = 0; v < nrm.length; v += 3) {
    const l = Math.hypot(nrm[v], nrm[v + 1], nrm[v + 2]) || 1;
    nrm[v] /= l; nrm[v + 1] /= l; nrm[v + 2] /= l;
  }
  return nrm;
}

// BP3D meshes are triangle soups with duplicated vertices along every seam.
// Welding first makes simplification far more effective and shrinks the output.
export function weld(pos, idx, epsilon = 1e-4) {
  const inv = 1 / epsilon;
  const map = new Map();
  const remap = new Uint32Array(pos.length / 3);
  const out = [];
  for (let v = 0; v < pos.length / 3; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = out.length / 3;
      map.set(key, id);
      out.push(x, y, z);
    }
    remap[v] = id;
  }
  const nidx = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) nidx[i] = remap[idx[i]];
  // Drop triangles that collapsed to a line or a point.
  const kept = [];
  for (let t = 0; t < nidx.length; t += 3) {
    const a = nidx[t], b = nidx[t + 1], c = nidx[t + 2];
    if (a !== b && b !== c && a !== c) kept.push(a, b, c);
  }
  return { pos: Float32Array.from(out), idx: Uint32Array.from(kept) };
}
