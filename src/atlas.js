// Loader for the binary atlas produced by tools/build-atlas.mjs.
const MAGIC = 'ATL1';

export async function loadIndex(base = '/atlas') {
  const res = await fetch(`${base}/index.json`);
  if (!res.ok) throw new Error(`atlas index missing (${res.status}) — run: npm run build:atlas`);
  return res.json();
}

// Files ship pre-gzipped. Static hosts vary on whether they unwrap them, so
// sniff the gzip magic instead of trusting Content-Encoding.
async function fetchMaybeGzip(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url} (${res.status})`);
  let buf;
  if (onProgress && res.body) {
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
      onProgress(got, total);
    }
    buf = await new Blob(chunks).arrayBuffer();
  } else {
    buf = await res.arrayBuffer();
  }
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const ds = new DecompressionStream('gzip');
    buf = await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
  }
  return buf;
}

export async function loadSystem(system, base = '/atlas', onProgress) {
  const buf = await fetchMaybeGzip(`${base}/${system.file}`, onProgress);
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== MAGIC) throw new Error(`bad atlas file ${system.file}`);
  const jsonLen = dv.getUint32(4, true);
  // jsonLen counts the 4-byte alignment padding, which is NUL-filled.
  const headerText = new TextDecoder().decode(new Uint8Array(buf, 12, jsonLen)).replace(/\0+$/, '');
  const header = JSON.parse(headerText);
  const { vertexCount: V, indexCount: I } = header;

  let o = 12 + jsonLen;
  const take = (bytes) => { const at = o; o += bytes + ((4 - (bytes % 4)) % 4); return at; };
  const position = new Uint16Array(buf, take(V * 3 * 2), V * 3);
  const normal = new Int16Array(buf, take(V * 3 * 2), V * 3);
  const pid = new Uint16Array(buf, take(V * 2), V);
  const index = new Uint32Array(buf, take(I * 4), I);
  return { header, position, normal, pid, index };
}

// Per-language names and paragraphs, loaded when the language is chosen.
export async function loadText(lang, base = '/atlas') {
  const buf = await fetchMaybeGzip(`${base}/text-${lang}.json.gz`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
}
