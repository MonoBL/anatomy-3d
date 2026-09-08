import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Display palette tuned for anatomical legibility. The source colours remain in
// the atlas metadata, while these slightly richer hues keep adjacent systems
// recognisable under studio lighting.
export const ANATOMICAL_COLORS = {
  arteries: '#d63f3b',
  veins: '#355fb4',
  heart: '#b94743',
  sensory: '#c6a48f',
  nervous: '#e5bd3f',
  respiratory: '#c98591',
  digestive: '#ad7043',
  urinary: '#8e5549',
  reproductive: '#b86f91',
  endocrine: '#cb922e',
  lymphatic: '#6b9e61',
  muscles: '#b96459',
  skeleton: '#eee3cc',
  teeth: '#f1e8d4',
  integument: '#d8ad8d',
  other: '#a7a09a',
};

// World-space box clip, shared by the colour and picking passes.
const CLIP = /* glsl */`
uniform vec3 uClipMin, uClipMax;
uniform float uClipOn;
bool clipped(vec3 p) {
  return uClipOn > 0.5 && (any(lessThan(p, uClipMin)) || any(greaterThan(p, uClipMax)));
}
`;

const VERT = /* glsl */`
attribute float pid;
uniform vec3 uQMin, uQScale, uCenter;
uniform sampler2D uPartTex, uSlotTex, uExtraTex;
uniform vec2 uTexSize;
uniform float uExplode, uInventory, uExplodeDist, uSelected, uHovered, uCompare;
varying vec3 vNormal, vWorld, vLocal, vAxis;
varying float vState, vSeed, vPid, vHalf, vElong;

vec2 texUv(float i) {
  float x = mod(i, uTexSize.x);
  float y = floor(i / uTexSize.x);
  return vec2((x + 0.5) / uTexSize.x, (y + 0.5) / uTexSize.y);
}
float hash(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }

void main() {
  vec2 uv = texUv(pid);
  vec4 d0 = texture2D(uPartTex, uv);   // xyz: centroid, w: visible
  vec4 d1 = texture2D(uSlotTex, uv);   // xyz: inventory slot
  vec4 d2 = texture2D(uExtraTex, uv);  // xyz: dominant axis, w: half extent
  vPid = pid;
  if (d0.w < 0.5) {                    // hidden: push outside the clip volume
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 p = uQMin + position * uQScale;
  vec3 c = d0.xyz;
  vec3 dir = (c - uCenter) * vec3(1.0, 0.45, 1.0);   // flatten so pieces fan out sideways
  dir = length(dir) < 1e-4 ? vec3(0.0, 1.0, 0.0) : normalize(dir);
  float seed = hash(pid);
  vec3 scatter = dir * (uExplode * uExplodeDist * (0.5 + 0.95 * seed));
  scatter.y += (seed - 0.5) * uExplode * uExplodeDist * 0.35;
  vec3 exploded = p + scatter;
  vec3 inventory = p - c + d1.xyz;
  vec3 wp = mix(exploded, inventory, uInventory);
  vSeed = seed;
  vNormal = normal;                  // model matrix is identity: object space == world
  vWorld = wp;
  vLocal = p - c;
  vAxis = normalize(d2.xyz);
  vHalf = d2.w;
  vElong = d1.w;
  vState = abs(pid - uSelected) < 0.5 ? 2.0
         : abs(pid - uCompare) < 0.5 ? 3.0
         : abs(pid - uHovered) < 0.5 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = CLIP + /* glsl */`
uniform vec3 uColor;
uniform sampler2D uColorTex;
uniform float uDim;
uniform vec2 uTexSize;
varying vec3 vNormal, vWorld, vLocal, vAxis;
varying float vState, vSeed, vPid, vHalf, vElong;

vec2 texUvF(float i) {
  float x = mod(i, uTexSize.x);
  float y = floor(i / uTexSize.x);
  return vec2((x + 0.5) / uTexSize.x, (y + 0.5) / uTexSize.y);
}
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
// Value noise: enough to break up flat plastic-looking surfaces.
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i), n100 = hash3(i + vec3(1, 0, 0));
  float n010 = hash3(i + vec3(0, 1, 0)), n110 = hash3(i + vec3(1, 1, 0));
  float n001 = hash3(i + vec3(0, 0, 1)), n101 = hash3(i + vec3(1, 0, 1));
  float n011 = hash3(i + vec3(0, 1, 1)), n111 = hash3(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

void main() {
  if (clipped(vWorld)) discard;

  // ---- albedo -------------------------------------------------------
  // Broad, low-contrast variation suggests organic tissue without painting
  // noisy spots over the geometry. A tiny warm/cool shift separates neighbours.
  vec4 colorSample = texture2D(uColorTex, texUvF(vPid));
  float muscleMask = step(0.75, colorSample.a);
  float boneMask = (1.0 - step(0.20, abs(colorSample.a - 0.5)));
  vec3 base = colorSample.rgb * (0.94 + 0.13 * vSeed);
  float broad = noise3(vWorld * 10.0 + vSeed * 11.0);
  float micro = noise3(vWorld * 95.0 + vSeed * 29.0);
  base *= 0.955 + 0.07 * broad + 0.018 * micro;
  base = mix(base, base * vec3(1.055, 0.975, 0.94), vSeed * 0.11);

  // Directional muscle fibres use each structure's principal axis. They stay
  // attached to the mesh during explode/inventory transitions because vLocal
  // is evaluated before those transforms.
  vec3 axis = normalize(vAxis);
  vec3 helper = abs(axis.y) < 0.88 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(axis, helper));
  vec3 bitangent = cross(axis, tangent);
  float along = dot(vLocal, axis);
  float fibreCoord = dot(vLocal, tangent) * 510.0 + dot(vLocal, bitangent) * 170.0;
  float fibres = 0.5 + 0.5 * sin(fibreCoord + noise3(vLocal * 75.0) * 2.4);
  fibres = smoothstep(0.18, 0.82, fibres);
  float fibreStrength = muscleMask * smoothstep(1.15, 2.2, vElong);
  base *= mix(1.0, 0.91 + fibres * 0.16, fibreStrength);

  // Elongated muscle bellies become subtly pearly at their attachment ends.
  float endRatio = abs(along) / max(vHalf, 0.0001);
  float tendonEnd = smoothstep(0.72, 0.98, endRatio) * fibreStrength;
  base = mix(base, vec3(0.76, 0.69, 0.58), tendonEnd * 0.32);
  base *= mix(1.0, 0.97 + micro * 0.075, boneMask);

  if (uClipOn > 0.5 && !gl_FrontFacing) {
    vec3 cutCol = base * 0.80;
    if (vState > 2.5) cutCol = mix(cutCol, vec3(0.95, 0.55, 0.15), 0.35);
    else if (vState > 1.5) cutCol = mix(cutCol, vec3(0.22, 0.45, 0.95), 0.35);
    gl_FragColor = vec4(mix(cutCol, vec3(0.957, 0.957, 0.949), uDim), 1.0);
    return;
  }

  // ---- lighting -----------------------------------------------------
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;             // source meshes have mixed winding
  vec3 L1 = normalize(V * 0.48 + vec3(-0.34, 0.78, 0.40));
  vec3 L2 = normalize(vec3(0.72, 0.24, -0.42) - V * 0.12);
  // Wrapped key and fill preserve form while avoiding crushed, muddy shadows.
  float key = max(dot(N, L1) * 0.68 + 0.32, 0.0);
  float fill = max(dot(N, L2) * 0.58 + 0.42, 0.0);
  float sky = 0.5 + 0.5 * N.y;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float back = pow(max(dot(-N, L1), 0.0), 2.0);

  vec3 col = base * (0.44 + 0.52 * key + 0.16 * fill + 0.08 * sky);
  col += base * vec3(1.10, 0.46, 0.36) * back * 0.075;
  vec3 H = normalize(L1 + V);
  float specPower = mix(34.0, 54.0, boneMask);
  float specAmount = mix(0.095, 0.12, boneMask);
  col += vec3(1.0, 0.96, 0.92) * pow(max(dot(N, H), 0.0), specPower) * specAmount;
  col += base * rim * 0.11;

  if (vState > 2.5) col = mix(col, vec3(0.95, 0.55, 0.15), 0.38) + 0.03;
  else if (vState > 1.5) col = mix(col, vec3(0.22, 0.45, 0.95), 0.38) + 0.03;
  else if (vState > 0.5) col = mix(col, vec3(1.0), 0.16) + 0.03;
  col = mix(col, vec3(0.957, 0.957, 0.949), uDim);
  gl_FragColor = vec4(col, 1.0);
}
`;

const PICK_FRAG = CLIP + /* glsl */`
varying float vPid;
varying vec3 vWorld;
void main() {
  if (clipped(vWorld)) discard;
  float id = vPid + 1.0;               // 0 is reserved for "nothing"
  gl_FragColor = vec4(mod(id, 256.0) / 255.0, floor(id / 256.0) / 255.0, 0.0, 1.0);
}
`;


// ---------------------------------------------------------------- post pass
// Screen-space ambient occlusion from the scene depth buffer. Anatomy is mostly
// convex shapes packed against each other; without contact darkening in the
// seams everything reads as one flat mass.
const FULLSCREEN_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const AO_FRAG = /* glsl */`
uniform sampler2D tDepth;
uniform mat4 uProjInv, uProj;
uniform vec2 uResolution;
uniform vec3 uKernel[24];
uniform float uRadius, uBias;
varying vec2 vUv;

vec3 viewFromDepth(vec2 uv, float depth) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = uProjInv * clip;
  return view.xyz / view.w;
}

void main() {
  float depth = texture2D(tDepth, vUv).x;
  if (depth >= 1.0) { gl_FragColor = vec4(1.0); return; }   // background
  vec3 P = viewFromDepth(vUv, depth);

  // Normal from the depth buffer itself: cheaper than a second geometry pass.
  vec2 texel = 1.0 / uResolution;
  vec3 Px = viewFromDepth(vUv + vec2(texel.x, 0.0), texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x);
  vec3 Py = viewFromDepth(vUv + vec2(0.0, texel.y), texture2D(tDepth, vUv + vec2(0.0, texel.y)).x);
  vec3 N = normalize(cross(Px - P, Py - P));
  if (dot(N, -normalize(P)) < 0.0) N = -N;

  // Random tangent basis per pixel so 24 samples look like many more.
  float rnd = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  vec3 rv = vec3(cos(rnd), sin(rnd), 0.0);
  vec3 T = normalize(rv - N * dot(rv, N));
  vec3 B = cross(N, T);
  mat3 basis = mat3(T, B, N);

  // Depth discontinuity: the outline where one structure overlaps another.
  vec3 Pl = viewFromDepth(vUv - vec2(texel.x, 0.0), texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x);
  vec3 Pd = viewFromDepth(vUv - vec2(0.0, texel.y), texture2D(tDepth, vUv - vec2(0.0, texel.y)).x);
  float rel = max(max(abs(Px.z - P.z), abs(Pl.z - P.z)), max(abs(Py.z - P.z), abs(Pd.z - P.z)))
            / max(1e-4, abs(P.z));
  float crease = smoothstep(0.0015, 0.012, rel);

  float occlusion = 0.0;
  for (int i = 0; i < 24; i++) {
    vec3 samplePos = P + (basis * uKernel[i]) * uRadius;
    vec4 offset = uProj * vec4(samplePos, 1.0);
    vec2 sUv = (offset.xy / offset.w) * 0.5 + 0.5;
    if (sUv.x < 0.0 || sUv.x > 1.0 || sUv.y < 0.0 || sUv.y > 1.0) continue;
    float sDepth = texture2D(tDepth, sUv).x;
    if (sDepth >= 1.0) continue;
    float sceneZ = viewFromDepth(sUv, sDepth).z;
    if (sceneZ >= samplePos.z + uBias) {
      // Ignore geometry far behind: that is a different structure, not a crevice.
      float rangeCheck = smoothstep(0.0, 1.0, uRadius / abs(P.z - sceneZ));
      occlusion += rangeCheck;
    }
  }
  float ao = 1.0 - occlusion / 24.0;
  gl_FragColor = vec4(pow(clamp(ao, 0.0, 1.0), 1.7), crease, 0.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tColor, tAo;
uniform vec2 uAoTexel;
uniform float uStrength, uCrease;
uniform vec3 uBackground;
varying vec2 vUv;

void main() {
  vec4 c = texture2D(tColor, vUv);
  // 5-tap blur over the half-resolution AO buffer, which hides the sampling noise.
  vec2 t = uAoTexel;
  vec2 s0 = texture2D(tAo, vUv).rg * 0.4
    + texture2D(tAo, vUv + vec2(t.x, 0.0)).rg * 0.15
    + texture2D(tAo, vUv - vec2(t.x, 0.0)).rg * 0.15
    + texture2D(tAo, vUv + vec2(0.0, t.y)).rg * 0.15
    + texture2D(tAo, vUv - vec2(0.0, t.y)).rg * 0.15;
  float ao = s0.r, crease = s0.g;
  // Occluded tissue loses light and a little warmth, the way deep folds do;
  // the crease term draws the seam where two structures meet.
  float shade = mix(1.0, ao, uStrength) * (1.0 - crease * uCrease);
  vec3 col = c.rgb * shade;
  col = mix(col, col * vec3(0.96, 0.93, 0.92), (1.0 - ao) * uStrength * 0.45);
  float vignette = smoothstep(0.95, 0.18, distance(vUv, vec2(0.5)));
  vec3 bg = uBackground * mix(0.965, 1.025, vignette);
  gl_FragColor = vec4(mix(bg, col, c.a), 1.0);
}
`;

const VIEWS = {
  A: [0, 0, 1], P: [0, 0, -1], S: [0, 1, 0.0001], R: [1, 0, 0], L: [-1, 0, 0],
};

export class Viewer {
  constructor(canvas, index) {
    this.index = index;
    this.parts = index.parts;
    this.byId = new Map(index.parts.map(p => [p.i, p]));
    this.meshes = new Map();
    this.hovered = -1;
    this.selected = -1;
    this.isolated = false;
    this.systemVisible = new Map(index.systems.map(s => [s.id, true]));

    const bmin = index.bounds.min, bmax = index.bounds.max;
    this.boxHalf = bmax.map((v, i) => (v - bmin[i]) / 2);
    this.bodyRadius = Math.hypot(...this.boxHalf);
    this.center = new THREE.Vector3(...bmax.map((v, i) => (v + bmin[i]) / 2));

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.background = new THREE.Color(0xe5e5e2);
    this.renderer.setClearColor(this.background, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.02, 100);
    this.camera.position.set(1.05, 0.12, 4.8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 22;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.target.copy(this.center);

    // Per-part state lives in two float textures indexed by part id.
    const n = this.parts.length;
    const w = 64, h = Math.ceil(n / w);
    this.texSize = new THREE.Vector2(w, h);
    this.partData = new Float32Array(w * h * 4);
    this.slotData = new Float32Array(w * h * 4);
    for (const p of this.parts) {
      const o = p.i * 4;
      this.partData[o] = p.c[0]; this.partData[o + 1] = p.c[1]; this.partData[o + 2] = p.c[2];
      this.partData[o + 3] = 1;
      this.slotData[o] = p.g[0]; this.slotData[o + 1] = p.g[1]; this.slotData[o + 2] = p.g[2];
      this.slotData[o + 3] = p.el ?? 1;
    }
    this.extraData = new Float32Array(w * h * 4);
    this.colorData = new Float32Array(w * h * 4);
    for (const p of this.parts) {
      const o = p.i * 4;
      const a = p.a ?? [0, 1, 0];
      this.extraData[o] = a[0]; this.extraData[o + 1] = a[1]; this.extraData[o + 2] = a[2];
      this.extraData[o + 3] = p.h ?? 0;
      const c = displayColorForPart(p);
      this.colorData[o] = c.r; this.colorData[o + 1] = c.g; this.colorData[o + 2] = c.b;
      this.colorData[o + 3] = materialTypeForPart(p);
    }
    this.partTex = makeDataTexture(this.partData, w, h);
    this.slotTex = makeDataTexture(this.slotData, w, h);
    this.extraTex = makeDataTexture(this.extraData, w, h);
    this.colorTex = makeDataTexture(this.colorData, w, h);
    // Pane B of the split view keeps its own visibility set.
    this.partDataB = this.partData.slice();
    this.partTexB = makeDataTexture(this.partDataB, w, h);
    this.systemVisibleB = new Map(index.systems.map(s => [s.id, s.group === 'skeleton']));
    this.meshVisible = { A: new Map(), B: new Map() };
    this.split = false;

    this.uniforms = {
      uQMin: { value: new THREE.Vector3(...index.quant.min) },
      uQScale: { value: new THREE.Vector3(...index.quant.scale) },
      uCenter: { value: this.center.clone() },
      uPartTex: { value: this.partTex },
      uSlotTex: { value: this.slotTex },
      uExtraTex: { value: this.extraTex },
      uColorTex: { value: this.colorTex },
      uTexSize: { value: this.texSize },
      uExplode: { value: 0 },
      uInventory: { value: 0 },
      uExplodeDist: { value: this.bodyRadius * 1.15 },
      uSelected: { value: -1 },
      uCompare: { value: -1 },
      uHovered: { value: -1 },
      uClipMin: { value: new THREE.Vector3(...index.bounds.min) },
      uClipMax: { value: new THREE.Vector3(...index.bounds.max) },
      uClipOn: { value: 0 },
    };

    this.pickMaterial = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uColor: { value: new THREE.Color() }, uDim: { value: 0 } },
      vertexShader: VERT, fragmentShader: PICK_FRAG,
    });
    this.pickTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.pickPixel = new Uint8Array(4);

    this.initPost();
    this.spread = 0;              // 0 assembled .. 1 inventory wall
    this.autoFrame = false;
    this.clock = new THREE.Clock();
    this.onResize();
    addEventListener('resize', () => this.onResize());
  }

  addSystem(system, data) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.position, 3, false));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3, true));
    g.setAttribute('pid', new THREE.BufferAttribute(data.pid, 1, false));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    // Positions are quantised, so three cannot derive usable bounds.
    g.boundingSphere = new THREE.Sphere(this.center.clone(), 40);

    const material = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uColor: { value: new THREE.Color(ANATOMICAL_COLORS[system.id] ?? system.color) }, uDim: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    material.side = this.clipSide ?? THREE.FrontSide;
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;
    mesh.name = system.id;
    this.scene.add(mesh);
    this.meshes.set(system.id, mesh);
    this.applyVisibility();
  }

  // ------------------------------------------------------------- state
  visibilityMap(pane) {
    return pane === 'B' ? this.systemVisibleB : this.systemVisible;
  }

  setSystemVisible(id, on, pane = 'A') {
    this.visibilityMap(pane).set(id, on);
    if (pane === 'A' && this.isolated && on) this.isolated = false;
    this.applyVisibility();
  }

  setIsolated(on) {
    this.isolated = on && this.selected >= 0;
    this.applyVisibility();
  }

  applyVisibility() {
    const sel = this.selected;
    const selSystem = this.byId.get(sel)?.s;
    for (const [pane, data] of [['A', this.partData], ['B', this.partDataB]]) {
      const vis = this.visibilityMap(pane);
      const isolate = pane === 'A' && this.isolated;
      for (const p of this.parts) {
        const on = isolate ? p.i === sel : vis.get(p.s) !== false;
        data[p.i * 4 + 3] = on ? 1 : 0;
      }
      for (const [id] of this.meshes) {
        this.meshVisible[pane].set(id, isolate ? id === selSystem : vis.get(id) !== false);
      }
    }
    this.partTex.needsUpdate = true;
    this.partTexB.needsUpdate = true;
    this.usePane('A');
  }

  // Point the shared uniforms and mesh flags at one pane's state.
  usePane(pane) {
    this.uniforms.uPartTex.value = pane === 'B' ? this.partTexB : this.partTex;
    for (const [id, mesh] of this.meshes) mesh.visible = this.meshVisible[pane].get(id) !== false;
  }

  setSplit(on) {
    this.split = on;
    this.onResize();
  }

  visibleCount(pane = 'A') {
    const data = pane === 'B' ? this.partDataB : this.partData;
    let n = 0;
    for (const p of this.parts) if (data[p.i * 4 + 3] > 0.5) n++;
    return n;
  }

  // Anatomical cuts: a world-space box, one face per plane. Cut surfaces only
  // read correctly if back faces are drawn, so double-sided goes on with them.
  setClip(box) {
    const on = !!box;
    this.uniforms.uClipOn.value = on ? 1 : 0;
    if (on) {
      this.uniforms.uClipMin.value.set(...box.min);
      this.uniforms.uClipMax.value.set(...box.max);
    }
    const side = on ? THREE.DoubleSide : THREE.FrontSide;
    if (this.clipSide !== side) {
      this.clipSide = side;
      for (const mesh of this.meshes.values()) mesh.material.side = side;
      this.pickMaterial.side = side;
    }
  }

  setSelected(id) {
    this.selected = id;
    this.uniforms.uSelected.value = id;
    if (id < 0) this.isolated = false;
    this.applyVisibility();
  }

  setHovered(id) {
    if (this.hovered === id) return false;
    this.hovered = id;
    this.uniforms.uHovered.value = id;
    return true;
  }

  // Slider 0..1: the first 60% scatters, the rest morphs into the wall.
  setSpread(t) {
    this.spread = t;
    const explode = Math.min(1, t / 0.6);
    const inventory = t <= 0.6 ? 0 : (t - 0.6) / 0.4;
    this.uniforms.uExplode.value = easeOut(explode);
    this.uniforms.uInventory.value = easeInOut(inventory);
  }

  // Half-extents of everything on screen at the current spread.
  currentHalfExtents() {
    const g = this.index.grid;
    const e = this.uniforms.uExplode.value, inv = this.uniforms.uInventory.value;
    const scattered = this.boxHalf.map(v => v + this.uniforms.uExplodeDist.value * 1.45 * e);
    const wall = [g.cols * g.cell / 2, g.rows * g.cell * 1.06 / 2, this.boxHalf[2]];
    return scattered.map((v, i) => THREE.MathUtils.lerp(v, wall[i], inv));
  }

  frameCurrent(instant = false) {
    const [hx, hy, hz] = this.currentHalfExtents();
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    // Extra vertical air so the floating panels never sit on top of the body.
    const dist = Math.max((hy * 1.22) / Math.tan(vFov / 2), hx / Math.tan(hFov / 2)) * 1.06 + hz;
    this.targetDistance = THREE.MathUtils.clamp(dist, this.controls.minDistance, this.controls.maxDistance);
    if (instant) this.applyDistance(1);
  }

  applyDistance(k) {
    const dir = this.camera.position.clone().sub(this.controls.target);
    const d = THREE.MathUtils.lerp(dir.length(), this.targetDistance, k);
    this.camera.position.copy(this.controls.target).add(dir.setLength(d));
  }

  // A standard view reframes as well as rotates: the point of asking for
  // "anterior" is to see the whole thing from the front, not to keep whatever
  // zoom you happened to be at.
  goToView(key, duration = 620) {
    const v = VIEWS[key];
    if (!v) return;
    const part = this.selected >= 0 ? this.byId.get(this.selected) : null;
    let target, dist;
    if (part) {
      target = new THREE.Vector3(...(this.uniforms.uInventory.value > 0.01 ? part.g : part.c));
      const vFov = THREE.MathUtils.degToRad(this.camera.fov);
      dist = Math.max(part.r / Math.tan(vFov / 2) * 1.6, 0.1);
    } else {
      target = this.center.clone();
      this.frameCurrent();
      dist = this.targetDistance;
    }
    this.tween = {
      from: this.camera.position.clone(),
      to: new THREE.Vector3(...v).normalize().multiplyScalar(dist).add(target),
      targetFrom: this.controls.target.clone(), targetTo: target,
      t: 0, duration,
    };
  }

  focusPart(p, duration = 620) {
    const target = new THREE.Vector3(...p.c);
    if (this.uniforms.uInventory.value > 0.01) target.set(...p.g);
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max(p.r / Math.tan(vFov / 2) * 1.6, 0.1);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.tween = {
      from: this.camera.position.clone(),
      to: target.clone().add(dir.multiplyScalar(dist)),
      targetFrom: this.controls.target.clone(), targetTo: target,
      t: 0, duration,
    };
  }

  // Frame two structures at once, used by the left/right comparison.
  focusPair(a, b, duration = 700) {
    const inventory = this.uniforms.uInventory.value > 0.01;
    const pa = new THREE.Vector3(...(inventory ? a.g : a.c));
    const pb = new THREE.Vector3(...(inventory ? b.g : b.c));
    const target = pa.clone().add(pb).multiplyScalar(0.5);
    const radius = pa.distanceTo(pb) / 2 + Math.max(a.r, b.r);
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist = radius / Math.sin(Math.min(vFov, hFov) / 2) * 1.1;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.tween = {
      from: this.camera.position.clone(),
      to: target.clone().add(dir.multiplyScalar(dist)),
      targetFrom: this.controls.target.clone(), targetTo: target,
      t: 0, duration,
    };
  }

  resetCamera() {
    this.controls.target.copy(this.center);
    this.frameCurrent();
    this.tween = {
      from: this.camera.position.clone(),
      // A restrained three-quarter view reveals the depth of the rib cage,
      // pelvis and limbs. The A button still provides a strict anterior view.
      to: new THREE.Vector3(0.22, 0.035, 1).setLength(this.targetDistance).add(this.center),
      targetFrom: this.controls.target.clone(), targetTo: this.center.clone(),
      t: 0, duration: 700,
    };
  }

  // Which pane a screen x falls in, and the pane's pixel rect.
  paneAt(x) {
    if (!this.split) return { pane: 'A', left: 0, width: this.width };
    const half = this.width / 2;
    return x < half
      ? { pane: 'A', left: 0, width: half }
      : { pane: 'B', left: half, width: half };
  }



  // Panning has no limits in OrbitControls, so hold the target inside the
  // content: otherwise the body can be pushed off screen with no way back.
  clampTarget() {
    const half = this.currentHalfExtents();
    const t = this.controls.target;
    const before = t.clone();
    for (let a = 0; a < 3; a++) {
      const limit = half[a] * 1.15 + 0.05;
      const axis = ['x', 'y', 'z'][a];
      const min = this.center[axis] - limit, max = this.center[axis] + limit;
      t[axis] = Math.min(max, Math.max(min, t[axis]));
    }
    // Move the camera by the same correction so the view does not swing.
    this.camera.position.add(t.clone().sub(before));
  }

  // True when the content is no longer usefully on screen. Projecting the
  // bounds beats guessing from camera numbers: it catches every way of getting
  // lost, whether by panning, zooming or a bad view change.
  needsReset() {
    const half = this.currentHalfExtents();
    this.camera.updateMatrixWorld();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let anyInFront = false;
    const p = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      p.set(
        this.center.x + (i & 1 ? half[0] : -half[0]),
        this.center.y + (i & 2 ? half[1] : -half[1]),
        this.center.z + (i & 4 ? half[2] : -half[2]),
      ).project(this.camera);
      if (p.z < 1) anyInFront = true;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    if (!anyInFront) return true;
    // Overlap of the projected box with the clip square, as a fraction of it.
    const overlap = Math.max(0, Math.min(maxX, 1) - Math.max(minX, -1))
                  * Math.max(0, Math.min(maxY, 1) - Math.max(minY, -1));
    const boxArea = Math.max(1e-6, (maxX - minX) * (maxY - minY));
    // Lost if little of the screen shows content, or little of the content is
    // on screen while zoomed out far enough that it should be.
    const screenFill = overlap / 4;
    return screenFill < 0.02 || (overlap / boxArea < 0.35 && boxArea > 0.6);
  }

  // ------------------------------------------------------------ post stack
  initPost() {
    const kernel = [];
    for (let i = 0; i < 24; i++) {
      // Hemisphere samples, packed towards the origin so nearby geometry counts most.
      let v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random());
      v.normalize().multiplyScalar(0.35 + 0.65 * ((i + 1) / 24) ** 2);
      kernel.push(v);
    }
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, samples: 4,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
    });
    this.aoTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.aoTarget.texture.minFilter = this.aoTarget.texture.magFilter = THREE.LinearFilter;

    this.aoMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: this.sceneTarget.depthTexture },
        uProjInv: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uKernel: { value: kernel },
        uRadius: { value: 0.026 },
        uBias: { value: 0.0022 },
      },
      vertexShader: FULLSCREEN_VERT, fragmentShader: AO_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.sceneTarget.texture },
        tAo: { value: this.aoTarget.texture },
        uAoTexel: { value: new THREE.Vector2() },
        uStrength: { value: 0.54 },
        uCrease: { value: 0.025 },
        uBackground: { value: this.background.clone() },
      },
      vertexShader: FULLSCREEN_VERT, fragmentShader: COMPOSITE_FRAG,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.PlaneGeometry(2, 2);
    this.postScene = new THREE.Scene();
    this.postQuad = new THREE.Mesh(quad, this.aoMaterial);
    this.postQuad.frustumCulled = false;
    this.postScene.add(this.postQuad);
    this.postCamera = new THREE.Camera();
  }

  resizePost() {
    const dpr = this.renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(this.width * dpr));
    const h = Math.max(1, Math.floor(this.height * dpr));
    this.sceneTarget.setSize(w, h);
    this.sceneTarget.depthTexture.image.width = w;
    this.sceneTarget.depthTexture.image.height = h;
    this.sceneTarget.depthTexture.needsUpdate = true;
    const aw = Math.max(1, Math.floor(w / 2)), ah = Math.max(1, Math.floor(h / 2));
    this.aoTarget.setSize(aw, ah);
    this.aoMaterial.uniforms.uResolution.value.set(aw, ah);
    this.compositeMaterial.uniforms.uAoTexel.value.set(1 / aw, 1 / ah);
  }

  // Depth -> ambient occlusion -> composite over the page background.
  runPost() {
    this.aoMaterial.uniforms.uProj.value.copy(this.camera.projectionMatrix);
    this.aoMaterial.uniforms.uProjInv.value.copy(this.camera.projectionMatrixInverse);
    this.postQuad.material = this.aoMaterial;
    this.renderer.setRenderTarget(this.aoTarget);
    const dpr = this.renderer.getPixelRatio();
    this.renderer.setViewport(0, 0, this.aoTarget.width / dpr, this.aoTarget.height / dpr);
    this.renderer.render(this.postScene, this.postCamera);

    this.postQuad.material = this.compositeMaterial;
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, this.width, this.height);
    this.renderer.render(this.postScene, this.postCamera);
  }

  // ------------------------------------------------------------- picking
  pickAt(x, y) {
    if (!this.meshes.size) return -1;
    const { pane, left, width } = this.paneAt(x);
    this.usePane(pane);
    const dpr = this.renderer.getPixelRatio();
    const w = Math.floor(width * dpr), h = Math.floor(this.height * dpr);
    const px = Math.floor((x - left) * dpr), py = Math.floor((this.height - y) * dpr);
    if (px < 0 || py < 0 || px >= w || py >= h) return -1;
    this.camera.setViewOffset(w, h, px, h - py - 1, 1, 1);
    this.scene.overrideMaterial = this.pickMaterial;
    this.renderer.setRenderTarget(this.pickTarget);
    this.renderer.setViewport(0, 0, 1 / dpr, 1 / dpr);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickPixel);
    this.renderer.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    this.camera.clearViewOffset();
    if (this.split) this.usePane('A');
    const id = this.pickPixel[0] + this.pickPixel[1] * 256 - 1;
    return id >= 0 && id < this.parts.length ? id : -1;
  }

  // -------------------------------------------------------------- frame
  onResize() {
    const el = this.renderer.domElement;
    this.width = el.clientWidth || innerWidth;
    this.height = el.clientHeight || innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    // In split view both panes show the same viewpoint at half the width.
    this.camera.aspect = (this.split ? this.width / 2 : this.width) / this.height;
    this.camera.updateProjectionMatrix();
    if (this.sceneTarget) this.resizePost();
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + (dt * 1000) / tw.duration);
      const k = easeInOut(tw.t);
      this.camera.position.lerpVectors(tw.from, tw.to, k);
      if (tw.targetTo) this.controls.target.lerpVectors(tw.targetFrom, tw.targetTo, k);
      if (tw.t >= 1) this.tween = null;
    } else if (this.autoFrame && this.targetDistance) {
      this.applyDistance(1 - Math.pow(0.001, dt));
    }
    this.controls.update();
    this.clampTarget();

    // Viewport and scissor take logical pixels: the renderer scales them by the
    // pixel ratio itself, so passing device pixels doubles them on retina.
    this.renderer.setRenderTarget(this.sceneTarget);
    if (!this.split) {
      this.usePane('A');
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.width, this.height);
      this.renderer.render(this.scene, this.camera);
    } else {
      const half = this.width / 2;
      this.renderer.setScissorTest(true);
      for (const [pane, x] of [['A', 0], ['B', half]]) {
        this.usePane(pane);
        this.renderer.setViewport(x, 0, half, this.height);
        this.renderer.setScissor(x, 0, half, this.height);
        this.renderer.render(this.scene, this.camera);
      }
      this.renderer.setScissorTest(false);
      this.usePane('A');
    }
    this.runPost();
  }
}

function makeDataTexture(data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function materialTypeForPart(part) {
  const name = part.n.toLowerCase();
  if (part.s === 'muscles' && !/\b(tendon|tendinous|aponeuros|fascia|raphe|linea alba)\b/.test(name)) return 1;
  if (part.s === 'skeleton' || part.s === 'teeth') return 0.5;
  return 0;
}

function displayColorForPart(part) {
  const name = part.n.toLowerCase();
  let color = ANATOMICAL_COLORS[part.s] ?? '#a7a09a';

  // Structures grouped into the same source system do not share the same
  // material in real anatomy. These restrained overrides restore the most
  // important visual cues without requiring UV textures.
  if (part.s === 'muscles') {
    if (/\b(tendon|tendinous|aponeuros|fascia|raphe|linea alba)\b/.test(name)) color = '#d8cebb';
  } else if (part.s === 'sensory') {
    if (/\b(sclera|eyeball|eye proper|cornea|lens|vitreous|aqueous)\b/.test(name)) color = '#ddd8cc';
    else if (/\biris\b/.test(name)) color = '#786956';
    else if (/\b(retina|choroid)\b/.test(name)) color = '#9a514b';
  } else if (part.s === 'respiratory') {
    if (/\b(lung|pulmonary)\b/.test(name)) color = '#c9828d';
    else if (/\b(trachea|bronch|larynx)\b/.test(name)) color = '#d5a09d';
  } else if (part.s === 'digestive') {
    if (/\bliver|hepatic\b/.test(name)) color = '#87503d';
    else if (/\b(gallbladder|bile)\b/.test(name)) color = '#718548';
    else if (/\bpancrea\b/.test(name)) color = '#d4a66d';
    else if (/\b(intestine|colon|cecum|caecum|rectum)\b/.test(name)) color = '#b98165';
  } else if (part.s === 'skeleton') {
    if (/\b(cartilage|cartilaginous|disk|meniscus|labrum)\b/.test(name)) color = '#c4ccd0';
    else if (/\b(ligament|capsule)\b/.test(name)) color = '#d6ccb8';
  } else if (part.s === 'urinary') {
    if (/\b(kidney|renal)\b/.test(name)) color = '#92564b';
    else if (/\b(bladder|ureter|urethra)\b/.test(name)) color = '#c89b72';
  }

  return new THREE.Color(color);
}

const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
