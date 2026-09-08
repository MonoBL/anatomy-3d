import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Display palette tuned for anatomical legibility. The source colours remain in
// the atlas metadata, while these slightly richer hues keep adjacent systems
// recognisable under studio lighting.
// Reference palette (ashemag/human-atlas, MIT), one colour per system.
export const ANATOMICAL_COLORS = {
  skeletal: '#e2d9ba',
  muscular: '#a85b50',
  cardiac: '#b96760',
  sensory: '#b0c8ce',
  arterial: '#c05245',
  venous: '#527c9f',
  nervous: '#d8b565',
  respiratory: '#b98991',
  digestive: '#b8916b',
  urinary: '#b47961',
  lymphatic: '#879f7c',
  endocrine: '#c5a09a',
  reproductive: '#bda098',
  connective: '#aec3bb',
  integumentary: '#ba9b7d',
};

// World-space box clip, shared by the colour and picking passes.
// The body surface is always drawn as glass.
const SKIN_ALPHA = 0.1;

const CLIP = /* glsl */`
uniform vec3 uClipMin, uClipMax;
uniform float uClipOn;
bool clipped(vec3 p) {
  return uClipOn > 0.5 && (any(lessThan(p, uClipMin)) || any(greaterThan(p, uClipMax)));
}
`;

// Shared per-part vertex logic, injected into three's standard material so the
// atlas gets real image-based lighting instead of a hand-rolled light model.
const PART_VERT_PRELUDE = /* glsl */`
attribute float pid;
uniform vec3 uQMin, uQScale, uCenter;
uniform sampler2D uPartTex, uSlotTex, uExtraTex, uStateTex;
uniform vec2 uTexSize;
uniform float uExplode, uInventory, uExplodeDist, uSelected, uHovered, uCompare;
varying vec3 vWorld;
varying float vState, vPid, vVisible, vAlpha;

vec2 texUv(float i) {
  float x = mod(i, uTexSize.x);
  float y = floor(i / uTexSize.x);
  return vec2((x + 0.5) / uTexSize.x, (y + 0.5) / uTexSize.y);
}
float hash(float n) { return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }

// Dequantises the position and moves the part to wherever the current explode
// and inventory amounts put it, filling in the varyings the surface needs.
vec3 partPosition() {
  vec2 uv = texUv(pid);
  vec4 d0 = texture2D(uPartTex, uv);   // xyz: centroid, w: visible
  vec4 d1 = texture2D(uSlotTex, uv);   // xyz: inventory slot
  vec4 st = texture2D(uStateTex, uv);  // x: selected, y: opacity, z: layer
  vec3 p = uQMin + position * uQScale;
  vec3 c = d0.xyz;
  vec3 dir = (c - uCenter) * vec3(1.0, 0.45, 1.0);   // fan out sideways
  dir = length(dir) < 1e-4 ? vec3(0.0, 1.0, 0.0) : normalize(dir);
  float seed = hash(pid);
  vec3 scatter = dir * (uExplode * uExplodeDist * (0.5 + 0.95 * seed));
  scatter.y += (seed - 0.5) * uExplode * uExplodeDist * 0.35;
  vec3 wp = mix(p + scatter, p - c + d1.xyz, uInventory);
  vPid = pid;
  vVisible = d0.w;
  vAlpha = st.y;
  vWorld = wp;
  // The primary selection and the rest of a multi-selection tint alike; the
  // compare partner and the hover keep their own colours.
  vState = (abs(pid - uSelected) < 0.5 || st.x > 0.5) ? 2.0
         : abs(pid - uCompare) < 0.5 ? 3.0
         : abs(pid - uHovered) < 0.5 ? 1.0 : 0.0;
  return wp;
}
`;

const PART_FRAG_PRELUDE = CLIP + /* glsl */`
varying vec3 vWorld;
varying float vState, vVisible, vAlpha;
`;

// Structures grouped into one system share a material, as they do upstream;
// the only per-fragment work left is the selection tint.
const PART_FRAG_ALBEDO = /* glsl */`
  if (vState > 2.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.55, 0.15), 0.55);
  else if (vState > 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.85, 0.78), 0.75);
  else if (vState > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.22);
`;

// A part is either solid or faded, and each pass throws away the other's
// fragments: one mesh cannot depth-write for some fragments and not others.
const OPAQUE_DISCARD = 'if (vAlpha < 0.999) discard;';
const GHOST_DISCARD = 'if (vAlpha >= 0.999) discard;';

const PICK_VERT = PART_VERT_PRELUDE + /* glsl */`
void main() {
  gl_Position = projectionMatrix * viewMatrix * vec4(partPosition(), 1.0);
}
`;

const PICK_FRAG = CLIP + /* glsl */`
varying float vPid, vVisible, vAlpha;
varying vec3 vWorld;
void main() {
  // Barely-there structures are not pickable, so a tap goes through a ghosted
  // body surface to the muscle underneath.
  if (vVisible < 0.5 || vAlpha < 0.15 || clipped(vWorld)) discard;
  float id = vPid + 1.0;               // 0 is reserved for "nothing"
  gl_FragColor = vec4(mod(id, 256.0) / 255.0, floor(id / 256.0) / 255.0, 0.0, 1.0);
}
`;





// Camera directions, in the anatomical sense: BP3D is +z anterior and +x is
// the body's own left, so a camera at +x looks at the left side of the body.
const VIEWS = {
  A: [0, 0, 1], P: [0, 0, -1],
  S: [0, 1, 0.0001], I: [0, -1, 0.0001],
  L: [1, 0, 0], R: [-1, 0, 0],
};

export const VIEW_KEYS = Object.keys(VIEWS);

export class Viewer {
  constructor(canvas, index) {
    this.index = index;
    this.parts = index.parts;
    this.byId = new Map(index.parts.map(p => [p.i, p]));
    this.meshes = new Map();
    this.ghostMeshes = new Map();
    this.hovered = -1;
    this.selected = -1;
    this.isolated = false;
    // Parts the user hid by hand, independent of which systems are on.
    this.hiddenParts = new Set();
    // Everything currently selected; `selected` is the primary one of these.
    this.selection = new Set();
    this.region = null;
    this.sub = null;
    this.side = null;
    this.regionParts = null;
    // How many muscular layers have been peeled away, superficial first.
    this.peel = 0;
    // Fade everything that is not selected, so a structure can be read in
    // place. 0 is off; the value is the opacity the rest drops to.
    this.ghostLevel = 0;
    this.systemVisible = new Map(index.systems.map(s => [s.id, true]));

    const bmin = index.bounds.min, bmax = index.bounds.max;
    this.boxHalf = bmax.map((v, i) => (v - bmin[i]) / 2);
    this.bodyRadius = Math.hypot(...this.boxHalf);
    this.center = new THREE.Vector3(...bmax.map((v, i) => (v + bmin[i]) / 2));

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.background = new THREE.Color(0xf2f3f3);
    this.renderer.setClearColor(this.background, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.initLighting();
    this.initStage();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.005, 100);
    this.camera.position.set(1.05, 0.12, 4.8);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.minDistance = 0.07;
    this.controls.maxDistance = 40;
    this.controls.autoRotateSpeed = 0.65;
    this.controls.maxPolarAngle = Math.PI * 0.96;
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
    for (const p of this.parts) {
      const o = p.i * 4;
      const a = p.a ?? [0, 1, 0];
      this.extraData[o] = a[0]; this.extraData[o + 1] = a[1]; this.extraData[o + 2] = a[2];
      this.extraData[o + 3] = p.h ?? 0;
    }
    // x: selected, y: opacity (used from the transparency work on), z: layer.
    this.stateData = new Float32Array(w * h * 4);
    for (const p of this.parts) this.stateData[p.i * 4 + 1] = p.s === 'integumentary' ? SKIN_ALPHA : 1;
    this.stateTex = makeDataTexture(this.stateData, w, h);
    this.partTex = makeDataTexture(this.partData, w, h);
    this.slotTex = makeDataTexture(this.slotData, w, h);
    this.extraTex = makeDataTexture(this.extraData, w, h);
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
      uStateTex: { value: this.stateTex },
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
      vertexShader: PICK_VERT, fragmentShader: PICK_FRAG,
    });
    this.pickTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.pickPixel = new Uint8Array(4);

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

    // The body surface is a reference shell: it is permanently faded, which
    // means it lives in the ghost pass and never draws in the solid one.
    const material = this.partMaterial(system, {
      opacity: 1, transparent: false, ghost: false,
    });
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;
    mesh.name = system.id;
    this.scene.add(mesh);
    this.meshes.set(system.id, mesh);

    // A second mesh over the same geometry draws whatever is currently faded:
    // it blends without writing depth, and each pass discards the other's
    // fragments, so a solid selection stays solid inside a ghosted body.
    const ghostMesh = new THREE.Mesh(g, this.partMaterial(system, {
      opacity: 1, transparent: true, ghost: true,
    }));
    ghostMesh.frustumCulled = false;
    ghostMesh.name = `${system.id}:ghost`;
    ghostMesh.renderOrder = 2;
    ghostMesh.visible = false;
    this.scene.add(ghostMesh);
    this.ghostMeshes.set(system.id, ghostMesh);

    this.applyVisibility();
  }

  // One material per system per pass. `ghost` keeps the faded fragments and
  // blends them; the other keeps the solid ones and writes depth.
  partMaterial(system, { opacity, transparent, ghost }) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(ANATOMICAL_COLORS[system.id] ?? system.color),
      metalness: 0.08,
      roughness: 0.53,
      side: THREE.DoubleSide,
      transparent,
      opacity,
      depthWrite: !ghost,
    });
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = PART_VERT_PRELUDE + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>', 'vec3 transformed = partPosition();');
      shader.fragmentShader = PART_FRAG_PRELUDE + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vVisible < 0.5 || clipped(vWorld)) discard;
        ${ghost ? GHOST_DISCARD : OPAQUE_DISCARD}`);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${PART_FRAG_ALBEDO}${ghost ? '\n  diffuseColor.a *= vAlpha;' : ''}`);
    };
    // Every system shares a program per pass; three keys on the material.
    material.customProgramCacheKey = () => (ghost ? 'atlas-ghost' : 'atlas-part');
    return material;
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

  // Region views. A part belongs to a region when that region owns it, or when
  // enough of it lies there: the build stores the share for the structures that
  // straddle a boundary, so the femoral artery shows in the trunk and the thigh.
  // The same holds one level down, for "the arm" or "the hand", and a side
  // filter narrows it to one limb.
  setFilter({ region = this.region, sub = this.sub, side = this.side } = {}) {
    this.region = region ?? null;
    this.sub = sub ?? null;
    this.side = side ?? null;
    this.regionParts = this.filterSet(this);
    this.applyVisibility();
  }

  // The ids a region / sub-region / side filter admits, or null for all of it.
  filterSet({ region = null, sub = null, side = null }) {
    if (!region && !sub && !side) return null;
    const set = new Set();
    for (const p of this.parts) {
      const inRegion = !region || p.rg === region || p.rgw?.[region];
      const inSub = !sub || p.sr === sub || p.srw?.[sub];
      // A midline structure has no side and stays in either one.
      const onSide = !side || !p.sd || p.sd === side;
      if (inRegion && inSub && onSide) set.add(p.i);
    }
    return set;
  }

  setRegionFilter(regionId) {
    this.setFilter({ region: regionId ?? null, sub: null, side: this.side });
  }

  inRegion(p) {
    return !this.regionParts || this.regionParts.has(p.i);
  }

  // Layers are ranked per region, so peeling the whole body takes the
  // superficial layer off every region at once.
  peeled(p) {
    return this.peel > 0 && p.ly !== undefined && p.ly < this.peel;
  }

  setPeel(n) {
    const max = this.maxPeel();
    this.peel = Math.max(0, Math.min(max, n));
    this.applyVisibility();
    return this.peel;
  }

  // One less than the layer count: peeling everything away would leave the
  // region empty, which is never what the button is for.
  maxPeel() {
    const regions = this.region
      ? this.index.regions.filter(r => r.id === this.region)
      : this.index.regions;
    return Math.max(0, Math.max(...regions.map(r => (r.layers ?? 1))) - 1);
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
        const on = (isolate ? p.i === sel : vis.get(p.s) !== false)
          && this.inRegion(p) && !this.hiddenParts.has(p.i) && !this.peeled(p);
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
    this.applyGhostPass();
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
      for (const mesh of this.ghostMeshes.values()) mesh.material.side = side;
      this.pickMaterial.side = side;
    }
  }

  setSelected(id) {
    this.selected = id;
    this.uniforms.uSelected.value = id;
    this.selection = id < 0 ? new Set() : new Set([id]);
    if (id < 0) this.isolated = false;
    this.writeSelection();
    this.applyVisibility();
  }

  // Multi-select: adds or removes one part, keeping the last added as primary.
  toggleSelected(id) {
    if (this.selection.has(id)) {
      this.selection.delete(id);
      if (this.selected === id) this.selected = [...this.selection].pop() ?? -1;
    } else {
      this.selection.add(id);
      this.selected = id;
    }
    this.uniforms.uSelected.value = this.selected;
    if (this.selected < 0) this.isolated = false;
    this.writeSelection();
    this.applyVisibility();
    return this.selected;
  }

  writeSelection() {
    const fade = this.ghostLevel;
    for (const p of this.parts) {
      const selected = this.selection.has(p.i);
      this.stateData[p.i * 4] = selected ? 1 : 0;
      // With something selected, transparency fades everything else; with
      // nothing selected it fades the lot, which is how the reference app
      // behaves — a look inside rather than a highlight. The body surface
      // stays glass either way, unless it is what was picked.
      const skin = p.s === 'integumentary';
      this.stateData[p.i * 4 + 1] = selected ? 1
        : skin ? SKIN_ALPHA
        : (fade || 1);
    }
    this.stateTex.needsUpdate = true;
    this.applyGhostPass();
  }

  // The ghost pass only has to run for systems that actually have faded parts.
  applyGhostPass() {
    for (const [id, mesh] of this.ghostMeshes) {
      const solid = this.meshes.get(id);
      const needed = this.ghostLevel > 0 || id === 'integumentary';
      mesh.visible = needed && !!solid?.visible;
    }
  }

  setTransparency(level) {
    this.ghostLevel = level > 0 ? level : 0;
    this.writeSelection();
  }

  // Hiding is per part and survives switching systems on and off, which is
  // what makes it useful for peeling a dissection by hand.
  hideParts(ids) {
    for (const id of ids) this.hiddenParts.add(id);
    if (this.selection.size && [...this.selection].every(id => this.hiddenParts.has(id))) {
      this.setSelected(-1);
      return;
    }
    this.applyVisibility();
  }

  showAllParts() {
    if (!this.hiddenParts.size) return;
    this.hiddenParts.clear();
    this.applyVisibility();
  }

  // Frame whatever is selected, however many parts that is.
  focusSelection(duration = 620) {
    const parts = [...this.selection].map(id => this.byId.get(id)).filter(Boolean);
    if (!parts.length) return;
    if (parts.length === 1) return this.focusPart(parts[0], duration);
    const inventory = this.uniforms.uInventory.value > 0.01;
    const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const p of parts) {
      const c = inventory ? p.g : p.c;
      for (let a = 0; a < 3; a++) {
        box.min[a] = Math.min(box.min[a], c[a] - p.r);
        box.max[a] = Math.max(box.max[a], c[a] + p.r);
      }
    }
    this.focusBox(box, duration);
  }

  // Everything the undo stack has to put back.
  snapshot() {
    return {
      systemVisible: new Map(this.systemVisible),
      systemVisibleB: new Map(this.systemVisibleB),
      hiddenParts: new Set(this.hiddenParts),
      selection: new Set(this.selection),
      selected: this.selected,
      isolated: this.isolated,
      region: this.region,
      sub: this.sub,
      side: this.side,
      peel: this.peel,
      ghostLevel: this.ghostLevel,
    };
  }

  restore(s) {
    this.systemVisible = new Map(s.systemVisible);
    this.systemVisibleB = new Map(s.systemVisibleB);
    this.hiddenParts = new Set(s.hiddenParts);
    this.selection = new Set(s.selection);
    this.selected = s.selected;
    this.isolated = s.isolated;
    this.uniforms.uSelected.value = s.selected;
    this.peel = s.peel ?? 0;
    this.ghostLevel = s.ghostLevel ?? 0;
    this.setFilter({ region: s.region, sub: s.sub ?? null, side: s.side ?? null });
    this.writeSelection();
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
    if (this.stage) this.stage.visible = t < 0.12;
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
    const dist = Math.max((hy * 1.26) / Math.tan(vFov / 2), hx / Math.tan(hFov / 2)) * 1.06 + hz;
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
  // `box` frames a region rather than the whole body: asking for "lateral"
  // while the upper limb is on screen should not pull the camera back to see
  // a body that is not being drawn.
  goToView(key, duration = 620, box = null) {
    const v = VIEWS[key];
    if (!v) return;
    const part = this.selected >= 0 ? this.byId.get(this.selected) : null;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    let target, dist;
    if (part) {
      target = new THREE.Vector3(...(this.uniforms.uInventory.value > 0.01 ? part.g : part.c));
      dist = Math.max(part.r / Math.tan(vFov / 2) * 1.6, 0.1);
    } else if (box && this.uniforms.uInventory.value < 0.01) {
      target = new THREE.Vector3(...[0, 1, 2].map(a => (box.min[a] + box.max[a]) / 2));
      const half = [0, 1, 2].map(a => (box.max[a] - box.min[a]) / 2);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
      // Which extents face the camera, and which way up they land on screen:
      // the up vector is +y unless the camera looks along y.
      const axis = v[0] ? 0 : v[1] ? 1 : 2;
      const [vert, horiz] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [1, 0];
      dist = Math.max(half[vert] * 1.18 / Math.tan(vFov / 2),
        half[horiz] * 1.12 / Math.tan(hFov / 2)) + half[axis];
      this.targetDistance = THREE.MathUtils.clamp(dist, this.controls.minDistance, this.controls.maxDistance);
      dist = this.targetDistance;
    } else {
      target = this.stageTarget();
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

  // ------------------------------------------------------- thumbnails
  // Renders one card image for the contents screen: a given set of systems,
  // trimmed and framed to a box, on the page's own background. Everything it
  // touches is restored, so it can run between two normal frames.
  renderThumbnail({ systems, box, filter = null, size = 256, dir = [0.34, 0.06, 1] }) {
    if (!this.meshes.size) return null;
    if (!this.thumbTarget || this.thumbTarget.width !== size) {
      this.thumbTarget?.dispose();
      this.thumbTarget = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
      // A render target holds linear values unless told otherwise; without
      // this the thumbnails come out of readRenderTargetPixels unconverted
      // and every colour reads far too saturated.
      this.thumbTarget.texture.colorSpace = THREE.SRGBColorSpace;
      this.thumbPixels = new Uint8Array(size * size * 4);
      this.thumbCamera = new THREE.PerspectiveCamera(30, 1, 0.005, 100);
    }
    const wanted = new Set(systems);
    const savedVis = this.partData.slice();
    const savedState = this.stateData.slice();
    const savedMesh = new Map([...this.meshes].map(([id, m]) => [id, m.visible]));
    const savedGhost = new Map([...this.ghostMeshes].map(([id, m]) => [id, m.visible]));
    const savedClip = {
      on: this.uniforms.uClipOn.value,
      min: this.uniforms.uClipMin.value.clone(),
      max: this.uniforms.uClipMax.value.clone(),
    };
    const stageWasVisible = this.stage ? this.stage.visible : false;

    // Only the parts this card is about, inside the box it frames.
    const allowed = filter ? this.filterSet(filter) : this.regionParts;
    for (const p of this.parts) {
      const on = wanted.has(p.s) && (!allowed || allowed.has(p.i));
      this.partData[p.i * 4 + 3] = on ? 1 : 0;
    }
    this.partTex.needsUpdate = true;
    this.uniforms.uPartTex.value = this.partTex;
    // A card is a plate, not a state of the app: no selection tint, nothing
    // faded, the skin excepted since that is what it is.
    for (const p of this.parts) {
      this.stateData[p.i * 4] = 0;
      this.stateData[p.i * 4 + 1] = 1;
    }
    this.stateTex.needsUpdate = true;
    for (const [id, mesh] of this.meshes) mesh.visible = wanted.has(id);
    for (const mesh of this.ghostMeshes.values()) mesh.visible = false;
    if (this.stage) this.stage.visible = false;
    if (box) this.setClip(box);

    // Frame what is actually on the card, not the region box: a limb box is
    // padded and much wider than the limb, which left the card mostly empty.
    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const p of this.parts) {
      if (this.partData[p.i * 4 + 3] < 0.5) continue;
      for (let a = 0; a < 3; a++) {
        bounds.min[a] = Math.min(bounds.min[a], p.c[a] - p.r);
        bounds.max[a] = Math.max(bounds.max[a], p.c[a] + p.r);
      }
    }
    if (box) {
      for (let a = 0; a < 3; a++) {
        bounds.min[a] = Math.max(bounds.min[a], box.min[a]);
        bounds.max[a] = Math.min(bounds.max[a], box.max[a]);
      }
    }
    const fit = Number.isFinite(bounds.min[0]) && bounds.max[0] > bounds.min[0]
      ? bounds
      : (box ?? { min: this.index.bounds.min, max: this.index.bounds.max });

    const cam = this.thumbCamera;
    const target = new THREE.Vector3(...[0, 1, 2].map(a => (fit.min[a] + fit.max[a]) / 2));
    const half = [0, 1, 2].map(a => (fit.max[a] - fit.min[a]) / 2);
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const dist = Math.max(half[1], half[0]) * 1.04 / Math.tan(vFov / 2) + half[2];
    cam.position.copy(target).add(new THREE.Vector3(...dir).setLength(dist));
    cam.lookAt(target);
    cam.updateProjectionMatrix();

    this.renderer.setScissorTest(false);
    this.renderer.setRenderTarget(this.thumbTarget);
    // A bound target uses its own viewport unless one is set after binding.
    this.renderer.setViewport(0, 0, size / this.renderer.getPixelRatio(), size / this.renderer.getPixelRatio());
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
    this.renderer.readRenderTargetPixels(this.thumbTarget, 0, 0, size, size, this.thumbPixels);
    this.renderer.setRenderTarget(null);

    // Restore everything.
    this.partData.set(savedVis);
    this.stateData.set(savedState);
    this.partTex.needsUpdate = true;
    this.stateTex.needsUpdate = true;
    for (const [id, mesh] of this.meshes) mesh.visible = savedMesh.get(id) !== false;
    for (const [id, mesh] of this.ghostMeshes) mesh.visible = savedGhost.get(id) !== false;
    if (this.stage) this.stage.visible = stageWasVisible;
    this.uniforms.uClipOn.value = savedClip.on;
    this.uniforms.uClipMin.value.copy(savedClip.min);
    this.uniforms.uClipMax.value.copy(savedClip.max);
    this.usePane('A');
    this.onResize();

    // WebGL reads bottom-up; the canvas wants top-down.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      img.data.set(this.thumbPixels.subarray(src, src + size * 4), y * size * 4);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  // A joint landmark: frame the bone ends around it, not the gap itself.
  focusJoint(joint, duration = 640) {
    const r = (joint.r ?? 0.05) * 2.1;
    this.focusBox({
      min: joint.p.map(v => v - r),
      max: joint.p.map(v => v + r),
    }, duration);
  }

  // Frame an axis-aligned world box, used by the region views.
  focusBox(box, duration = 700) {
    const target = new THREE.Vector3(...[0, 1, 2].map(a => (box.min[a] + box.max[a]) / 2));
    const half = [0, 1, 2].map(a => (box.max[a] - box.min[a]) / 2);
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist = Math.max(half[1] * 1.18 / Math.tan(vFov / 2), half[0] * 1.12 / Math.tan(hFov / 2)) + half[2];
    this.targetDistance = THREE.MathUtils.clamp(dist, this.controls.minDistance, this.controls.maxDistance);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.tween = {
      from: this.camera.position.clone(),
      to: target.clone().add(dir.multiplyScalar(this.targetDistance)),
      targetFrom: this.controls.target.clone(), targetTo: target,
      t: 0, duration,
    };
  }

  resetCamera() {
    this.controls.target.copy(this.stageTarget());
    this.frameCurrent();
    this.tween = {
      from: this.camera.position.clone(),
      // A restrained three-quarter view reveals the depth of the rib cage,
      // pelvis and limbs. The A button still provides a strict anterior view.
      to: new THREE.Vector3(0.22, 0.035, 1).setLength(this.targetDistance).add(this.center),
      targetFrom: this.controls.target.clone(), targetTo: this.stageTarget(),
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
      const c = this.stageTarget()[axis];
      const min = c - limit, max = c + limit;
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



  // Look slightly below centre so the figure sits high enough for its turntable
  // to stay clear of the controls docked at the bottom.
  stageTarget() {
    const t = this.center.clone();
    t.y -= this.boxHalf[1] * 0.07;
    return t;
  }

  // ------------------------------------------------------------- lighting
  // A prefiltered room environment does most of the work: soft, believable
  // light from every direction, which is what separates a real render from a
  // shaded silhouette. Two directionals then give it a direction to read.
  initLighting() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envRT = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envRT.texture;
    room.dispose();
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa7acb2, 1.0));
    const key = new THREE.DirectionalLight(0xfffaf4, 2.1);
    key.position.set(-2, 4, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe9f0ff, 1.6);
    rim.position.set(2, 2, -3);
    this.scene.add(rim);
  }

  // A floor and a turntable: the body needs something to stand on, otherwise it
  // floats in a void and the eye has no sense of its size.
  initStage() {
    const floorY = this.index.bounds.min[1];
    this.stage = new THREE.Group();
    this.stage.position.y = floorY;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 96),
      new THREE.MeshStandardMaterial({ color: 0xd5d9dc, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.019;
    this.stage.add(ground);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.7, 0.028, 100),
      new THREE.MeshStandardMaterial({ color: 0xeeeeec, metalness: 0.12, roughness: 0.67 }));
    platform.position.y = -0.016;
    this.stage.add(platform);

    for (const [inner, outer, opacity] of [[0.63, 0.632, 0.4], [0.55, 0.551, 0.16]]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 128),
        new THREE.MeshBasicMaterial({ color: 0x8c969f, transparent: true, opacity, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.001;
      this.stage.add(ring);
    }
    this.scene.add(this.stage);
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
    const stageWasVisible = this.stage ? this.stage.visible : false;
    if (this.stage) this.stage.visible = false;
    // Both passes share the geometry, so the ghost mesh would only draw the
    // same ids twice.
    const ghostWasVisible = new Map([...this.ghostMeshes].map(([id, m]) => [id, m.visible]));
    for (const mesh of this.ghostMeshes.values()) mesh.visible = false;
    this.scene.overrideMaterial = this.pickMaterial;
    this.renderer.setRenderTarget(this.pickTarget);
    this.renderer.setViewport(0, 0, 1 / dpr, 1 / dpr);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickPixel);
    this.renderer.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    if (this.stage) this.stage.visible = stageWasVisible;
    for (const [id, mesh] of this.ghostMeshes) mesh.visible = ghostWasVisible.get(id) !== false;
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
    if (!this.split) {
      this.usePane('A');
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.width, this.height);
      this.renderer.render(this.scene, this.camera);
      return;
    }
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
}

function makeDataTexture(data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}



const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
