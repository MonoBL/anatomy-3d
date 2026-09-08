import { loadIndex, loadSystem, loadText } from './atlas.js';
import { Viewer, ANATOMICAL_COLORS } from './viewer.js';
import { makeT, applyStatic, initialLang, rememberLang, numberFormat, LANGS } from './i18n.js';
import { registerServiceWorker } from './offline.js';
import { PRESETS, PRESET_GROUPS, presetsFor, presetSize } from './presets.js';
import { getThumb, putThumb, pruneThumbs } from './thumbs.js';
import { loadBookmarks, addBookmark, removeBookmark } from './bookmarks.js';

const $ = sel => document.querySelector(sel);
const FMA_URL = id => `https://bioportal.bioontology.org/ontologies/FMA?p=classes&conceptid=http%3A%2F%2Fpurl.org%2Fsig%2Font%2Ffma%2F${id.toLowerCase()}`;
const WIKI_URL = (lang, title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

// Which systems each preset tab turns on.
const TAB_GROUPS = { all: null, skeleton: ['skeleton'], muscles: ['muscles'], organs: ['organs'] };
// Skin hides everything underneath, so the atlas opens on the muscle body.
const DEFAULT_OFF = new Set(['integumentary']);
// Big structures first so something recognisable shows up early.
const LOAD_ORDER = ['skeletal', 'muscular', 'arterial', 'venous', 'nervous', 'respiratory',
  'digestive', 'cardiac', 'sensory', 'connective', 'urinary', 'reproductive', 'endocrine',
  'lymphatic', 'integumentary'];
// The three cardinal cut planes, each mapped to a world axis.
const CUTS = [
  { id: 'sagittal', axis: 0, label: 'cut.sagittal' },
  { id: 'coronal', axis: 2, label: 'cut.coronal' },
  { id: 'axial', axis: 1, label: 'cut.axial' },
];

const state = {
  index: null, viewer: null, systems: new Map(), loaded: new Set(),
  tab: 'all', pane: 'A', cursor: 0, results: [],
  region: null, sub: null, side: null,
  multiselect: false, undo: [],
  contentsRegion: null, preset: null,
  pins: [],
  // The rail starts out of the way on a tablet, open on a desktop.
  rail: matchMedia('(min-width: 1100px)').matches && !matchMedia('(hover: none)').matches,
  lang: initialLang(), t: null, nf: null, text: {},
  cuts: new Map(CUTS.map(c => [c.id, { on: false, at: 0.5, flip: false }])),
  compare: false, touch: matchMedia('(hover: none)').matches,
};

// Presets never switch the skin back on: it would hide everything they select.
const tabWants = (tab, s) => !DEFAULT_OFF.has(s.id) &&
  (TAB_GROUPS[tab] ? TAB_GROUPS[tab].includes(s.group) : true);

const label = s => (state.lang === 'pt' && s.labelPt ? s.labelPt : s.label);
const partName = p => state.text[state.lang]?.[p.i]?.n ?? p.n;
const partText = p => state.text[state.lang]?.[p.i] ?? {};

registerServiceWorker();

init().catch(err => {
  console.error(err);
  $('#loaderTxt').textContent = err.message;
});

async function init() {
  const index = await loadIndex();
  for (const system of index.systems) {
    system.color = ANATOMICAL_COLORS[system.id] ?? system.color;
  }
  state.index = index;
  state.systems = new Map(index.systems.map(s => [s.id, s]));
  setLang(state.lang, { initial: true });

  const viewer = new Viewer($('#stage'), index);
  state.viewer = viewer;
  viewer.frameCurrent(true);
  viewer.resetCamera();
  if (import.meta.env?.DEV) window.__atlas = state;

  buildSystemList();
  buildRegionBar();
  buildSubBar();
  buildCutRows();
  buildMarkList();
  bindUI();
  bindToolbar();
  let rail = state.rail;
  try {
    const saved = localStorage.getItem('atlas.rail');
    if (saved !== null) rail = saved === '1';
  } catch { /* private mode */ }
  setRail(rail);
  tick();
  state.text[state.lang] = await loadText(state.lang);
  await loadAll();
  // Cards opened mid-load have placeholders for systems that were not there
  // yet; now that everything is in, draw them.
  if (!$('#contents').hidden) buildContents();
  pruneThumbs(`${THUMB_VERSION}|${state.index.generated}`);
  // First visit opens on the contents, as the reference app does; after that
  // the atlas opens where it is quicker to work.
  try {
    if (!localStorage.getItem('atlas.seenContents')) openContents(true);
  } catch { /* private mode */ }
}

// --------------------------------------------------------------- language
async function setLang(lang, { initial = false } = {}) {
  state.lang = LANGS.includes(lang) ? lang : 'en';
  state.t = makeT(state.lang);
  state.nf = numberFormat(state.lang);
  rememberLang(state.lang);
  document.documentElement.lang = state.lang === 'pt' ? 'pt-PT' : 'en';
  applyStatic(state.t);
  for (const b of document.querySelectorAll('#langSwitch button')) {
    b.classList.toggle('is-active', b.dataset.lang === state.lang);
  }
  $('#pieceTotal').textContent = state.nf.format(state.index.parts.length);
  $('#systemCount').textContent = state.index.systems.length;
  renderAbout();
  if (initial) return;
  if (!state.text[state.lang]) state.text[state.lang] = await loadText(state.lang);
  buildSystemList();
  buildRegionBar();
  buildSubBar();
  buildCutRows();
  buildMarkList();
  renderPins();
  if (!$('#contents').hidden) buildContents();
  updateVisibleCount();
  if (state.viewer.selected >= 0) selectPart(state.viewer.selected);
  if (state.results.length) runSearch();
}

function renderAbout() {
  const t = state.t, n = state.nf, cov = state.index.coverage ?? {};
  const total = state.index.parts.length;
  const en = `
    <p>Every structure here is a real mesh from <strong>BodyParts3D 4.0</strong>, the anatomical
    model released by the Database Center for Life Science (DBCLS), Japan. The atlas loads
    <strong>${n.format(total)}</strong> individual pieces, grouped into anatomical systems and
    rendered as a single GPU batch per system.</p>
    <p>Names and identifiers come from the Foundational Model of Anatomy (FMA). Structure
    paragraphs are the lead sections of the matching Wikipedia articles, reached through the
    Wikidata FMA mapping: ${n.format(cov.wikiEn ?? 0)} structures in English and
    ${n.format(cov.wikiPt ?? 0)} in Portuguese. ${n.format(cov.ptNames ?? 0)} pieces carry a
    verified Portuguese name; the rest keep their anatomical English name rather than a
    machine translation.</p>
    <p class="lic">Atlas data built ${state.index.generated?.slice(0, 16).replace('T', ' ')} UTC.<br />
    BodyParts3D, © The Database Center for Life Science, licensed under
    <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noopener">CC BY-SA 2.1 Japan</a>.
    Text from Wikipedia under CC BY-SA. This viewer is shared under the same licence.</p>`;
  const pt = `
    <p>Cada estrutura aqui é uma malha real do <strong>BodyParts3D 4.0</strong>, o modelo
    anatómico publicado pelo Database Center for Life Science (DBCLS), Japão. O atlas carrega
    <strong>${n.format(total)}</strong> peças individuais, agrupadas por sistemas e desenhadas
    num único lote de GPU por sistema.</p>
    <p>Os nomes e identificadores vêm do Foundational Model of Anatomy (FMA). Os parágrafos de
    cada estrutura são a introdução do artigo correspondente da Wikipédia, encontrado através
    do mapeamento FMA da Wikidata: ${n.format(cov.wikiEn ?? 0)} estruturas em inglês e
    ${n.format(cov.wikiPt ?? 0)} em português. ${n.format(cov.ptNames ?? 0)} peças têm nome
    português verificado; as restantes mantêm o nome anatómico inglês em vez de uma tradução
    automática.</p>
    <p class="lic">Dados do atlas gerados a ${state.index.generated?.slice(0, 16).replace('T', ' ')} UTC.<br />
    BodyParts3D, © The Database Center for Life Science, sob licença
    <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noopener">CC BY-SA 2.1 Japão</a>.
    Textos da Wikipédia sob CC BY-SA. Este visualizador é partilhado sob a mesma licença.</p>`;
  $('#aboutBody').innerHTML = state.lang === 'pt' ? pt : en;
  $('#infoBtn').title = t('info.title');
}

// --------------------------------------------------------------- loading
async function loadAll() {
  const order = [...state.index.systems].sort(
    (a, b) => LOAD_ORDER.indexOf(a.id) - LOAD_ORDER.indexOf(b.id));
  const total = order.reduce((a, s) => a + s.bytes, 0);
  let done = 0;
  for (const sys of order) {
    const row = document.querySelector(`.sysrow[data-id="${sys.id}"]`);
    row?.classList.add('is-loading');
    const data = await loadSystem(sys, '/atlas', got => setProgress((done + got) / total, sys));
    state.viewer.addSystem(sys, data);
    state.loaded.add(sys.id);
    row?.classList.remove('is-loading');
    done += sys.bytes;
    setProgress(done / total, sys);
    updateVisibleCount();
    if (state.loaded.size === 1) hideLoader();
  }
  setProgress(1);
  hideLoader();
}

function setProgress(frac, sys) {
  // Hosts that send Content-Encoding: gzip report compressed lengths, so clamp.
  frac = Math.max(0, Math.min(1, frac));
  $('#loaderBar').style.width = `${Math.round(frac * 100)}%`;
  $('#loaderTxt').textContent = frac >= 1
    ? state.t('ready')
    : `${state.t('loading')} ${label(sys).toLowerCase()}…`;
}

let loaderHidden = false;
function hideLoader() {
  if (loaderHidden) return;
  loaderHidden = true;
  const el = $('#loader');
  el.classList.add('is-done');
  setTimeout(() => { el.hidden = true; }, 600);
}

// ------------------------------------------------------------ system list
function buildSystemList() {
  const list = $('#sysList');
  list.innerHTML = '';
  for (const s of state.index.systems) {
    const on = state.viewer ? state.viewer.visibilityMap(state.pane).get(s.id) !== false : !DEFAULT_OFF.has(s.id);
    const row = document.createElement('div');
    row.className = 'sysrow';
    row.dataset.id = s.id;
    row.innerHTML = `
      <span class="dot" style="background:${s.color}"></span>
      <span class="nm" title="${label(s)}">${label(s)}</span>
      <span class="ct">${state.nf.format(s.count)}</span>
      <button class="toggle${on ? ' is-on' : ''}" aria-label="${label(s)}"></button>`;
    row.querySelector('.toggle').addEventListener('click', () => {
      setSystem(s.id, state.viewer.visibilityMap(state.pane).get(s.id) === false);
      state.tab = null;
      syncTabs();
    });
    row.querySelector('.nm').addEventListener('click', () => soloSystem(s.id));
    list.appendChild(row);
    if (!state.viewer && DEFAULT_OFF.has(s.id)) row.querySelector('.toggle').classList.remove('is-on');
  }
  if (state.viewer) {
    for (const s of state.index.systems) {
      if (DEFAULT_OFF.has(s.id) && state.viewer.visibilityMap('A').get(s.id) !== false && state.pane === 'A') {
        setSystem(s.id, false);
      }
    }
  }
  updateVisibleCount();
}

// ------------------------------------------------------------- contents
const THUMB_VERSION = 'v5';
function openContents(on = true) {
  $('#contents').hidden = !on;
  if (!on) return;
  state.contentsRegion = state.region;
  buildContents();
  try { localStorage.setItem('atlas.seenContents', '1'); } catch { /* private mode */ }
}

function buildContents() {
  const name = s => (state.lang === 'pt' && s.labelPt ? s.labelPt : s.label);
  const regions = $('#contentsRegions');
  regions.innerHTML = [
    { id: '', label: state.t('region.all') },
    ...state.index.regions.map(r => ({ id: r.id, label: name(r) })),
  ].map(r => `<button data-region="${r.id}" class="${(state.contentsRegion ?? '') === r.id ? 'is-active' : ''}">${r.label}</button>`).join('');
  regions.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    state.contentsRegion = b.dataset.region || null;
    buildContents();
  }));

  const region = state.contentsRegion;
  const available = presetsFor(state.index, region);
  const body = $('#contentsBody');
  body.innerHTML = PRESET_GROUPS.map(group => {
    const cards = available.filter(({ preset }) => preset.group === group.id);
    if (!cards.length) return '';
    return `<div class="contents-group"><h3>${name(group)}</h3><div class="cardgrid">
      ${cards.map(({ preset }) => {
        const n = presetSize(state.index, region, preset);
        return `<button class="card" data-preset="${preset.id}">
          <span class="thumb is-empty" data-thumb="${preset.id}">${state.t('contents.rendering')}</span>
          <span class="cap"><b>${name(preset)}</b><span>${state.nf.format(n)} ${state.t('contents.parts')}</span></span>
        </button>`;
      }).join('')}
    </div></div>`;
  }).join('');

  body.querySelectorAll('.card').forEach(card => card.addEventListener('click', () => {
    const preset = PRESETS.find(p => p.id === card.dataset.preset);
    if (preset) applyPreset(preset, region);
  }));
  queueThumbs(region);
}

// Thumbnails are rendered by the viewer on demand, cached in IndexedDB, and
// only for the cards actually on screen: a full grid costs a couple of frames.
function queueThumbs(region) {
  const pending = [...$('#contentsBody').querySelectorAll('[data-thumb]')];
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      showThumb(entry.target, region);
    }
  }, { root: $('#contentsBody'), rootMargin: '200px' });
  for (const el of pending) io.observe(el);
  state.thumbObserver?.disconnect();
  state.thumbObserver = io;
}

async function showThumb(el, region) {
  const preset = PRESETS.find(p => p.id === el.dataset.thumb);
  if (!preset || !state.loaded.size) return;
  const side = defaultSide(region, state.side) ?? 'both';
  // The key carries a renderer version as well as the atlas build: a change to
  // how thumbnails are drawn has to invalidate the ones already stored.
  const key = `${THUMB_VERSION}|${state.index.generated}|${region ?? 'all'}|${side}|${preset.id}`;
  let blob = await getThumb(key);
  if (!blob) {
    // The viewer needs the systems loaded before it can draw them.
    if (!preset.systems.every(id => state.loaded.has(id))) return;
    const cardSide = defaultSide(region, state.side);
    const box = boxFor(region, null, cardSide);
    const canvas = state.viewer.renderThumbnail({
      systems: preset.systems, box, filter: { region, side: cardSide },
    });
    if (!canvas) return;
    blob = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.9));
    if (blob) putThumb(key, blob);
  }
  if (!blob || el.dataset.thumb !== preset.id) return;
  const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = '';
  img.src = URL.createObjectURL(blob);
  img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
  el.replaceWith(img);
}

function applyPreset(preset, region) {
  pushUndo();
  state.preset = preset.id;
  state.region = region;
  state.sub = null;
  state.side = defaultSide(region, state.side);
  const wanted = new Set(preset.systems);
  for (const s of state.index.systems) setSystem(s.id, wanted.has(s.id));
  state.tab = null;
  syncTabs();
  state.viewer.setPeel(0);
  applyFilter({ frame: true });
  openContents(false);
}

// ------------------------------------------------------------------ pins
// Labels that stay on a structure while the model turns. Pinning the current
// selection is the point: it is how a screenshot becomes a revision sheet.
function togglePins() {
  const viewer = state.viewer;
  const ids = [...viewer.selection];
  if (!ids.length) {
    if (state.pins.length) { state.pins = []; renderPins(); syncToolbar(); }
    return;
  }
  const already = ids.every(id => state.pins.includes(id));
  state.pins = already
    ? state.pins.filter(id => !ids.includes(id))
    : [...new Set([...state.pins, ...ids])];
  renderPins();
  syncToolbar();
}

function renderPins() {
  const layer = $('#pinLayer');
  layer.hidden = !state.pins.length;
  const labels = $('#pinLabels');
  labels.innerHTML = state.pins.map((id, i) => {
    const p = state.viewer.byId.get(id);
    if (!p) return '';
    return `<div class="pin" data-pin="${id}" style="left:0;top:0">
      <span class="pname">${partName(p)}</span>
      <button class="pdrop" title="${state.t('tool.pinOff')}" aria-label="${state.t('tool.pinOff')}">×</button>
    </div>`;
  }).join('');
  labels.querySelectorAll('.pin').forEach(el => {
    const id = Number(el.dataset.pin);
    el.addEventListener('click', e => {
      if (e.target.closest('.pdrop')) {
        state.pins = state.pins.filter(x => x !== id);
        renderPins();
        syncToolbar();
        return;
      }
      selectPart(id, { focus: false });
    });
  });
  $('#pinLines').innerHTML = state.pins.map(() =>
    '<line x1="0" y1="0" x2="0" y2="0" /><circle cx="0" cy="0" r="2.5" />').join('');
  positionPins();
}

// Called every frame the camera moves: labels are stacked in a column to the
// right of the body so the leader lines stay readable.
const pinPoint = {};
function positionPins() {
  if (!state.pins.length) return;
  const viewer = state.viewer;
  const labels = $('#pinLabels').children;
  const lines = $('#pinLines').children;
  const w = viewer.split ? viewer.width / 2 : viewer.width;
  for (let i = 0; i < state.pins.length; i++) {
    const el = labels[i];
    const line = lines[i * 2];
    const dot = lines[i * 2 + 1];
    const p = viewer.byId.get(state.pins[i]);
    if (!el || !p) continue;
    viewer.project(...viewer.partAnchor(p), pinPoint);
    const visible = pinPoint.onScreen && viewer.partVisible(p.i);
    el.style.display = visible ? '' : 'none';
    line.style.display = dot.style.display = visible ? '' : 'none';
    if (!visible) continue;
    // Labels to the right of the anchor, or to the left near the edge.
    const flip = pinPoint.x > w - 240;
    const lx = flip ? Math.max(12, pinPoint.x - 210) : Math.min(w - 12, pinPoint.x + 54);
    const ly = pinPoint.y;
    el.style.left = `${lx}px`;
    el.style.top = `${ly}px`;
    el.classList.toggle('is-selected', viewer.selection.has(p.i));
    line.setAttribute('x1', pinPoint.x);
    line.setAttribute('y1', pinPoint.y);
    line.setAttribute('x2', flip ? lx + (el.offsetWidth || 0) : lx);
    line.setAttribute('y2', ly);
    dot.setAttribute('cx', pinPoint.x);
    dot.setAttribute('cy', pinPoint.y);
  }
}

// ------------------------------------------------------------ saved views
function buildMarkList() {
  const list = loadBookmarks();
  const wrap = $('#markList');
  if (!list.length) {
    wrap.innerHTML = `<p class="marks-empty">${state.t('marks.empty')}</p>`;
    return;
  }
  wrap.innerHTML = list.map(b => `
    <div class="markrow" data-mark="${b.id}">
      <button class="mname" title="${b.name}">${b.name}</button>
      <span class="mmeta">${b.count ?? ''}</span>
      <button class="mdel" title="${state.t('marks.delete')}">×</button>
    </div>`).join('');
  wrap.querySelectorAll('.markrow').forEach(row => {
    const id = row.dataset.mark;
    row.querySelector('.mname').addEventListener('click', () => applyBookmark(list.find(b => b.id === id)));
    row.querySelector('.mdel').addEventListener('click', () => { removeBookmark(id); buildMarkList(); });
  });
}

// The name writes itself from what is on screen: region, side, and either the
// preset or the selected structure.
function bookmarkName() {
  const bits = [];
  const region = state.index.regions.find(r => r.id === state.region);
  const sub = state.index.subregions.find(s => s.id === state.sub);
  const name = s => (state.lang === 'pt' && s.labelPt ? s.labelPt : s.label);
  if (sub) bits.push(name(sub));
  else if (region) bits.push(name(region));
  else bits.push(state.t('region.all'));
  if (state.side) bits.push(state.t(state.side === 'l' ? 'region.leftShort' : 'region.rightShort'));
  const preset = PRESETS.find(p => p.id === state.preset);
  const selected = state.viewer.selected >= 0 ? state.viewer.byId.get(state.viewer.selected) : null;
  if (selected) bits.push(partName(selected));
  else if (preset) bits.push(name(preset));
  return bits.join(' · ');
}

function saveBookmark() {
  const viewer = state.viewer;
  const entry = {
    name: bookmarkName(),
    count: state.nf.format(viewer.visibleCount('A')),
    region: state.region, sub: state.sub, side: state.side,
    preset: state.preset,
    systems: state.index.systems.filter(s => viewer.visibilityMap('A').get(s.id) !== false).map(s => s.id),
    hidden: [...viewer.hiddenParts],
    selection: [...viewer.selection],
    pins: [...state.pins],
    peel: viewer.peel,
    ghost: viewer.ghostLevel,
    spread: viewer.spread,
    cuts: [...state.cuts].map(([id, c]) => [id, { ...c }]),
    camera: viewer.cameraState(),
  };
  if (!addBookmark(entry)) {
    $('#markList').innerHTML = `<p class="marks-empty">${state.t('marks.full')}</p>`;
    return;
  }
  buildMarkList();
}

function applyBookmark(b) {
  if (!b) return;
  const viewer = state.viewer;
  pushUndo();
  state.region = b.region ?? null;
  state.sub = b.sub ?? null;
  state.side = b.side ?? null;
  state.preset = b.preset ?? null;
  const on = new Set(b.systems ?? []);
  for (const s of state.index.systems) setSystem(s.id, on.has(s.id));
  state.tab = null;
  syncTabs();
  viewer.hiddenParts = new Set(b.hidden ?? []);
  viewer.selection = new Set(b.selection ?? []);
  viewer.selected = b.selection?.length ? b.selection[b.selection.length - 1] : -1;
  viewer.uniforms.uSelected.value = viewer.selected;
  viewer.peel = b.peel ?? 0;
  viewer.setTransparency(b.ghost ?? 0);
  state.pins = (b.pins ?? []).filter(id => viewer.byId.has(id));
  state.cuts = new Map((b.cuts ?? []).map(([id, c]) => [id, { ...c }]));
  if (!state.cuts.size) state.cuts = new Map(CUTS.map(c => [c.id, { on: false, at: 0.5, flip: false }]));
  $('#explode').value = (b.spread ?? 0) * 100;
  viewer.setSpread(b.spread ?? 0);
  toggleExplodePanel((b.spread ?? 0) > 0);
  buildCutRows();
  applyFilter();
  selectPart(viewer.selected, { keepSelection: true });
  renderPins();
  // The camera goes last: applyFilter would otherwise reframe over it.
  viewer.setCameraState(b.camera);
  syncToolbar();
}

// ----------------------------------------------------------------- views
function toggleViewSheet(on = $('#viewSheet').hidden) {
  $('#viewSheet').hidden = !on;
  document.querySelector('.toolbar button[data-tool="views"]')?.classList.toggle('is-active', on);
  if (on) buildJointChips();
}

// Which side "lateral" and "medial" mean: the side filter if there is one,
// otherwise the side of whatever is selected, and failing that the left.
function currentSide() {
  if (state.side) return state.side;
  const p = state.viewer.selected >= 0 ? state.viewer.byId.get(state.viewer.selected) : null;
  return p?.sd ?? 'l';
}

function goToDir(dir) {
  const side = currentSide();
  // A camera at +x looks at the body's left, so lateral for a left structure
  // is the left view and medial is the right one.
  const key = dir === 'lateral' ? (side === 'l' ? 'L' : 'R')
    : dir === 'medial' ? (side === 'l' ? 'R' : 'L')
    : dir;
  state.viewer.goToView(key, 620, filterBox());
  state.markView?.(key);
}

function buildJointChips() {
  const row = $('#viewJointsRow');
  const wrap = $('#viewJoints');
  const side = currentSide();
  const name = j => (state.lang === 'pt' && j.labelPt ? j.labelPt : j.label);
  // One chip per joint, not per joint and side: the side comes from the view.
  const seen = new Set();
  const joints = (state.index.joints ?? []).filter(j => {
    if (state.region && j.region !== state.region) return false;
    if (j.side && j.side !== side) return false;
    if (seen.has(j.id)) return false;
    seen.add(j.id);
    return true;
  });
  row.hidden = !joints.length;
  wrap.innerHTML = joints.map(j =>
    `<button class="joint" data-joint="${j.id}">${name(j)}</button>`).join('');
  wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const joint = joints.find(j => j.id === b.dataset.joint);
    if (joint) {
      state.viewer.focusJoint(joint);
      state.markView?.(null);
    }
  }));
}

// ---------------------------------------------------------------- tools
const UNDO_DEPTH = 30;

// Snapshot before anything that changes what is on screen, so a wrong tap on a
// tablet costs one Undo instead of a rebuild of the whole view.
function pushUndo() {
  state.undo.push({
    viewer: state.viewer.snapshot(),
    cuts: new Map([...state.cuts].map(([k, v]) => [k, { ...v }])),
    region: state.region, sub: state.sub, side: state.side,
    pins: [...state.pins],
  });
  if (state.undo.length > UNDO_DEPTH) state.undo.shift();
  syncToolbar();
}

function undo() {
  const s = state.undo.pop();
  if (!s) return;
  state.cuts = s.cuts;
  state.region = s.region;
  state.sub = s.sub;
  state.side = s.side;
  state.pins = s.pins ?? [];
  state.viewer.restore(s.viewer);
  renderPins();
  buildCutRows();
  buildRegionBar();
  buildSubBar();
  applyCuts();
  syncToggles();
  selectPart(state.viewer.selected, { keepSelection: true });
  updateVisibleCount();
  syncToolbar();
}

function toggleIsolate() {
  const viewer = state.viewer;
  if (viewer.selected < 0) return;
  pushUndo();
  viewer.setIsolated(!viewer.isolated);
  if (viewer.isolated) viewer.focusSelection();
  syncToolbar();
  updateVisibleCount();
}

function hideSelection() {
  const viewer = state.viewer;
  if (!viewer.selection.size) return;
  pushUndo();
  viewer.hideParts([...viewer.selection]);
  syncToolbar();
  updateVisibleCount();
}

// The layer stepper. Peeling is undoable in one step per press, which is what
// makes it safe to explore with.
function setPeel(n) {
  const before = state.viewer.peel;
  const after = state.viewer.setPeel(n);
  if (after !== before) {
    updateVisibleCount();
    syncToolbar();
  }
}

// Transparency steps rather than toggles: a light fade to read a structure in
// place, a heavy one to see through the whole body, then off.
// The deep step stays above the pick threshold: a faded structure still has
// to be tappable, or the tool would fight the study it is meant to help.
const GHOST_STEPS = [0, 0.34, 0.18];

function stepTransparency() {
  const viewer = state.viewer;
  const i = GHOST_STEPS.indexOf(viewer.ghostLevel);
  viewer.setTransparency(GHOST_STEPS[(i + 1) % GHOST_STEPS.length]);
  syncToolbar();
}

function setMultiselect(on) {
  state.multiselect = on;
  syncToolbar();
}

// Reset puts the atlas back to how it opens: no selection, nothing hidden,
// every system at its default, no cut, no region, camera home.
function resetAll() {
  const viewer = state.viewer;
  pushUndo();
  selectPart(-1);          // closes the detail panel too
  viewer.showAllParts();
  viewer.setPeel(0);
  viewer.setTransparency(0);
  state.pins = [];
  renderPins();
  viewer.setIsolated(false);
  setCompare(false);
  setMultiselect(false);
  state.region = null;
  state.sub = null;
  state.side = null;
  viewer.setFilter({ region: null, sub: null, side: null });
  buildSubBar();          // the strip only exists while a region is active
  for (const st of state.cuts.values()) { st.on = false; st.flip = false; st.at = 0.5; }
  toggleExplodePanel(false);
  toggleViewSheet(false);
  $('#explode').value = 0;
  viewer.setSpread(0);
  applyTab('all');
  buildCutRows();
  buildRegionBar();
  applyCuts();
  viewer.frameCurrent();
  viewer.resetCamera();
  updateVisibleCount();
  syncToolbar();
}

function setRail(open) {
  state.rail = open;
  $('#app').classList.toggle('rail-closed', !open);
  $('#railToggle').setAttribute('aria-expanded', String(open));
  try { localStorage.setItem('atlas.rail', open ? '1' : '0'); } catch { /* private mode */ }
}

function toggleExplodePanel(on = $('#explodePanel').hidden) {
  $('#explodePanel').hidden = !on;
  document.querySelector('.toolbar button[data-tool="explode"]')?.classList.toggle('is-active', on);
  // Leaving the panel means leaving the exploded view: a slider you cannot see
  // is not a state anyone can get out of.
  if (!on && state.viewer.spread > 0) {
    $('#explode').value = 0;
    state.viewer.setSpread(0);
    if (state.region) applyCuts();
    state.viewer.frameCurrent();
  }
}

function syncToolbar() {
  const viewer = state.viewer;
  if (!viewer) return;
  const has = viewer.selection.size > 0;
  const set = (tool, { on, disabled } = {}) => {
    const b = document.querySelector(`.toolbar button[data-tool="${tool}"]`);
    if (!b) return;
    b.disabled = !!disabled;
    b.classList.toggle('is-active', !!on);
  };
  set('center', { disabled: !has });
  set('isolate', { on: viewer.isolated, disabled: !has });
  set('multi', { on: state.multiselect });
  set('ghost', { on: viewer.ghostLevel > 0 });
  const pinnable = has || state.pins.length > 0;
  set('pin', {
    on: has && [...viewer.selection].every(id => state.pins.includes(id)),
    disabled: !pinnable,
  });
  set('hide', { disabled: !has });
  set('undo', { disabled: !state.undo.length });
  set('explode', { on: !$('#explodePanel').hidden });
  set('views', { on: !$('#viewSheet').hidden });
  set('reset');
  const max = viewer.maxPeel();
  $('#layerVal').textContent = `${viewer.peel + 1} / ${max + 1}`;
  $('#layerStep').querySelector('[data-layer="up"]').disabled = viewer.peel <= 0;
  $('#layerStep').querySelector('[data-layer="down"]').disabled = viewer.peel >= max;
  $('#isolateBtn')?.classList.toggle('is-on', viewer.isolated);
}

function bindToolbar() {
  const viewer = state.viewer;
  const actions = {
    center: () => viewer.focusSelection(),
    isolate: toggleIsolate,
    ghost: stepTransparency,
    pin: togglePins,
    multi: () => setMultiselect(!state.multiselect),
    hide: hideSelection,
    undo,
    explode: () => toggleExplodePanel(),
    views: () => toggleViewSheet(),
    reset: resetAll,
  };
  document.querySelectorAll('.toolbar button[data-tool]').forEach(b =>
    b.addEventListener('click', () => actions[b.dataset.tool]?.()));
  $('#layerStep').querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => {
      pushUndo();
      setPeel(viewer.peel + (b.dataset.layer === 'down' ? 1 : -1));
    }));
  syncToolbar();
}

// ---------------------------------------------------------------- regions
// The limbs come in pairs, and a plate of one arm is what an atlas shows, so
// entering a limb region picks a side. Both sides stay one tap away.
const PAIRED_REGIONS = new Set(['upperLimb', 'lowerLimb']);

function defaultSide(region, current) {
  if (!PAIRED_REGIONS.has(region)) return current;
  return current ?? 'l';
}
function buildRegionBar() {
  const bar = $('#regionBar');
  const counts = new Map();
  for (const p of state.index.parts) {
    for (const rid of Object.keys(p.rgw ?? { [p.rg]: 1 })) {
      counts.set(rid, (counts.get(rid) ?? 0) + 1);
    }
  }
  const entries = [
    { id: '', name: state.t('region.all'), count: state.index.parts.length },
    ...state.index.regions.map(r => ({
      id: r.id,
      name: state.lang === 'pt' && r.labelPt ? r.labelPt : r.label,
      count: counts.get(r.id) ?? 0,
    })),
  ];
  bar.innerHTML = entries.map(e => `
    <button data-region="${e.id}" class="${(state.region ?? '') === e.id ? 'is-active' : ''}">
      ${e.name}<span class="rcount">${state.nf.format(e.count)}</span></button>`).join('');
  bar.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => setRegion(b.dataset.region || null)));
}

function setRegion(id, { record = true } = {}) {
  if (record && id !== state.region) pushUndo();
  state.region = id;
  state.sub = null;                      // a new region starts on the whole of it
  state.side = defaultSide(id, state.side);
  applyFilter({ frame: true });
}

// The sub-region strip: which part of the region, and which side of the body.
function buildSubBar() {
  const bar = $('#subBar');
  bar.hidden = !state.region;
  if (!state.region) { bar.innerHTML = ''; return; }
  const name = s => (state.lang === 'pt' && s.labelPt ? s.labelPt : s.label);
  const subs = state.index.subregions.filter(s => s.region === state.region);
  const active = (a, b) => (a === b ? ' is-active' : '');
  bar.innerHTML = `
    <button data-sub="" class="${active(state.sub, null).trim()}">${state.t('region.whole')}</button>
    ${subs.map(s => `<button data-sub="${s.id}" class="${active(state.sub, s.id).trim()}">${name(s)}</button>`).join('')}
    <span class="sep"></span>
    <button data-side="" class="side${active(state.side, null)}" title="${state.t('region.both')}">⇄</button>
    <button data-side="l" class="side${active(state.side, 'l')}" title="${state.t('region.left')}">${state.t('region.leftShort')}</button>
    <button data-side="r" class="side${active(state.side, 'r')}" title="${state.t('region.right')}">${state.t('region.rightShort')}</button>`;
  bar.querySelectorAll('[data-sub]').forEach(b =>
    b.addEventListener('click', () => setSub(b.dataset.sub || null)));
  bar.querySelectorAll('[data-side]').forEach(b =>
    b.addEventListener('click', () => setSide(b.dataset.side || null)));
}

function setSub(id) {
  if (id === state.sub) return;
  pushUndo();
  state.sub = id;
  applyFilter({ frame: true });
}

function setSide(side) {
  if (side === state.side) return;
  pushUndo();
  state.side = side;
  applyFilter({ frame: true });
}

// One place that pushes region, sub-region and side into the viewer, reframes
// and refreshes the bars, so the three controls can never disagree.
function applyFilter({ frame = false } = {}) {
  const viewer = state.viewer;
  viewer.setFilter({ region: state.region, sub: state.sub, side: state.side });
  document.querySelectorAll('#regionBar button').forEach(b =>
    b.classList.toggle('is-active', (b.dataset.region || null) === state.region));
  buildSubBar();
  viewer.setPeel(viewer.peel);           // each region has its own depth
  applyCuts();
  if (frame) {
    const box = filterBox();
    if (box) viewer.focusBox(box); else viewer.resetCamera();
  }
  updateVisibleCount();
  if (!$('#viewSheet').hidden) buildJointChips();
  syncToolbar();
}

// The box a filter should trim and frame to: the sub-region if one is chosen,
// otherwise the whole region, on one side if a side is chosen.
function boxFor(region, sub, side) {
  const source = sub
    ? state.index.subregions.find(s => s.id === sub)
    : state.index.regions.find(r => r.id === region);
  if (!source) return null;
  return (side && source.boxSide?.[side]) || source.box || null;
}

const filterBox = () => boxFor(state.region, state.sub, state.side);

// The region a part is shown in, for the detail panel.
function regionLabel(p) {
  const r = state.index.regions.find(x => x.id === p.rg);
  if (!r) return null;
  const sub = state.index.subregions.find(x => x.id === p.sr);
  const name = s => (state.lang === 'pt' && s.labelPt ? s.labelPt : s.label);
  return sub && sub.region === r.id ? `${name(r)} · ${name(sub)}` : name(r);
}

function setSystem(id, on) {
  state.viewer.setSystemVisible(id, on, state.pane);
  document.querySelector(`.sysrow[data-id="${id}"] .toggle`)?.classList.toggle('is-on', on);
  updateVisibleCount();
}

function syncToggles() {
  for (const s of state.index.systems) {
    const on = state.viewer.visibilityMap(state.pane).get(s.id) !== false;
    document.querySelector(`.sysrow[data-id="${s.id}"] .toggle`)?.classList.toggle('is-on', on);
  }
  updateVisibleCount();
}

function soloSystem(id) {
  pushUndo();
  const vis = state.viewer.visibilityMap(state.pane);
  const only = state.index.systems.every(s => (vis.get(s.id) !== false) === (s.id === id));
  for (const s of state.index.systems) setSystem(s.id, only ? !DEFAULT_OFF.has(s.id) : s.id === id);
  state.tab = only ? 'all' : null;
  syncTabs();
}

function applyTab(tab, { record = false } = {}) {
  if (record) pushUndo();
  state.tab = tab;
  for (const s of state.index.systems) setSystem(s.id, tabWants(tab, s));
  syncTabs();
}

function syncTabs() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.group === state.tab));
}

function updateVisibleCount() {
  if (!state.viewer) return;
  const n = state.viewer.visibleCount(state.pane);
  const word = state.t(n === 1 ? 'systems.visibleOne' : 'systems.visible');
  const hidden = state.viewer.hiddenParts.size;
  const el = $('#visibleCount');
  el.textContent = `${state.nf.format(n)} ${word}`;
  if (hidden) {
    const btn = document.createElement('button');
    btn.className = 'linkbtn';
    btn.textContent = ` · ${state.nf.format(hidden)} ${state.t('tool.hidden')}`;
    btn.title = state.t('tool.showHidden');
    btn.addEventListener('click', () => {
      pushUndo();
      state.viewer.showAllParts();
      updateVisibleCount();
    });
    el.appendChild(btn);
  }
  const anyOn = state.index.systems.some(s => state.viewer.visibilityMap(state.pane).get(s.id) !== false);
  $('#hideAll').textContent = state.t(anyOn ? 'systems.hideAll' : 'systems.showAll');
}

// ------------------------------------------------------------------- cuts
function buildCutRows() {
  const wrap = $('#cutRows');
  wrap.innerHTML = '';
  for (const cut of CUTS) {
    const st = state.cuts.get(cut.id);
    const row = document.createElement('div');
    row.className = `cutrow${st.on ? ' is-on' : ''}`;
    row.dataset.id = cut.id;
    row.innerHTML = `
      <button class="cutname">${state.t(cut.label)}</button>
      <input class="slider cutslider" type="range" min="0" max="100" step="0.5" value="${st.at * 100}" />
      <button class="cutflip" title="${state.t('cut.flip')}">⇄</button>`;
    row.querySelector('.cutname').addEventListener('click', () => {
      st.on = !st.on;
      row.classList.toggle('is-on', st.on);
      applyCuts();
    });
    row.querySelector('.cutslider').addEventListener('input', e => {
      st.at = Number(e.target.value) / 100;
      if (!st.on) { st.on = true; row.classList.add('is-on'); }
      applyCuts();
    });
    row.querySelector('.cutflip').addEventListener('click', () => {
      st.flip = !st.flip;
      if (!st.on) { st.on = true; row.classList.add('is-on'); }
      applyCuts();
    });
    wrap.appendChild(row);
  }
}

function applyCuts() {
  const { min, max } = state.index.bounds;
  const lo = [...min], hi = [...max];
  // Trimming to the region only makes sense while the body is assembled: the
  // explode slider throws parts far outside any region box.
  const regionBox = state.viewer.spread > 0.01 ? null : filterBox();
  let any = !!regionBox;
  if (regionBox) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.max(lo[a], regionBox.min[a]);
      hi[a] = Math.min(hi[a], regionBox.max[a]);
    }
  }
  for (const cut of CUTS) {
    const st = state.cuts.get(cut.id);
    if (!st.on) continue;
    any = true;
    const a = cut.axis;
    // Cuts follow the exploded positions too, so leave room around the bounds.
    const span = max[a] - min[a];
    const at = min[a] + span * st.at;
    if (st.flip) hi[a] = at; else lo[a] = at;
  }
  const pad = 40;
  state.viewer.setClip(any
    ? { min: lo.map((v, i) => (v === min[i] ? v - pad : v)), max: hi.map((v, i) => (v === max[i] ? v + pad : v)) }
    : null);
  $('#cutPanel').classList.toggle('is-active', any);
}

function clearCuts() {
  for (const st of state.cuts.values()) { st.on = false; st.flip = false; st.at = 0.5; }
  buildCutRows();
  applyCuts();
}

// -------------------------------------------------------------- selection
// `keepSelection` refreshes the panel for an existing selection, which is what
// Undo needs: it has already put the whole selection set back.
function selectPart(id, { focus = false, keepSelection = false } = {}) {
  const viewer = state.viewer;
  if (!keepSelection) viewer.setSelected(id);
  if (id < 0) {
    setCompare(false);
    $('#detail').hidden = true;
    updateVisibleCount();
    syncToolbar();
    return;
  }
  const p = viewer.byId.get(id);
  const sys = state.systems.get(p.s);
  const txt = partText(p);
  if (viewer.visibilityMap('A').get(p.s) === false && state.pane === 'A') setSystem(p.s, true);
  // A structure the region filter hides cannot be inspected, so step out of it.
  if (!viewer.inRegion(p)) setRegion(null, { record: false });

  const rl = regionLabel(p);
  $('#detailSystem').textContent = rl ? `${label(sys)} · ${rl}` : label(sys);
  $('#detailTitle').textContent = viewer.selection.size > 1
    ? `${partName(p)} +${viewer.selection.size - 1}`
    : partName(p);
  const noPt = state.lang === 'pt' && !txt.n;
  $('#detailAlt').textContent = noPt ? state.t('detail.noPt') : '';
  $('#detailAlt').hidden = !noPt;
  $('#detailDesc').textContent = txt.d ?? sys.info?.[state.lang] ?? '';
  $('#detailNote').textContent = txt.s
    ? `${state.t('src.wikipedia')} · ${txt.s}`
    : state.t('src.derived');
  $('#detailFma').textContent = p.f;
  $('#detailVolume').textContent = formatVolume(p.v);
  $('#detailCount').textContent = state.nf.format(
    state.compare && p.p !== undefined ? 2 : Math.max(1, state.viewer.selection.size));
  $('#detailSource').href = txt.s ? WIKI_URL(state.lang, txt.s) : FMA_URL(p.f);
  $('#isolateBtn').classList.toggle('is-on', viewer.isolated);
  $('#detail').hidden = false;

  const hasPair = p.p !== undefined;
  $('#compareBtn').hidden = !hasPair;
  $('#compareBtnLabel').textContent = state.t(state.compare ? 'detail.compareOff' : 'detail.compare');
  if (state.compare && hasPair) renderCompare(p); else $('#compareBox').hidden = true;
  viewer.uniforms.uCompare.value = state.compare && hasPair ? p.p : -1;

  if (focus) viewer.focusPart(p);
  updateVisibleCount();
  syncToolbar();
}

function formatVolume(cm3) {
  if (cm3 === undefined) return '—';
  if (cm3 >= 1000) return `${state.nf.format(Math.round(cm3 / 10) / 100)} L`;
  if (cm3 >= 10) return `${state.nf.format(Math.round(cm3))} cm³`;
  if (cm3 >= 1) return `${state.nf.format(Math.round(cm3 * 10) / 10)} cm³`;
  return `${state.nf.format(Math.round(cm3 * 1000))} mm³`;
}

function setCompare(on) {
  state.compare = on;
  if (state.viewer.selected >= 0) selectPart(state.viewer.selected);
  else state.viewer.uniforms.uCompare.value = -1;
}

function renderCompare(p) {
  const other = state.viewer.byId.get(p.p);
  const isLeft = /^left\s/i.test(p.n);
  const left = isLeft ? p : other;
  const right = isLeft ? other : p;
  const maxV = Math.max(left.v, right.v) || 1;
  const rows = [
    [state.t('compare.left'), left, '#3d6ce0'],
    [state.t('compare.right'), right, '#e08a3d'],
  ];
  $('#compareBars').innerHTML = rows.map(([name, part, color]) => `
    <div class="cbar">
      <span class="cbar-k">${name}</span>
      <span class="cbar-track"><i style="width:${(part.v / maxV) * 100}%;background:${color}"></i></span>
      <span class="cbar-v">${formatVolume(part.v)}</span>
    </div>`).join('');
  const diff = Math.abs(left.v - right.v) / maxV * 100;
  $('#compareNote').textContent = diff < 0.5
    ? state.t('compare.equal')
    : `${state.nf.format(Math.round(diff * 10) / 10)} % ${state.t('compare.difference')}`;
  $('#compareBox').hidden = false;
}

// --------------------------------------------------------------- controls
function bindUI() {
  const viewer = state.viewer;
  const canvas = $('#stage');
  const tooltip = $('#tooltip');

  for (const b of document.querySelectorAll('#langSwitch button')) {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  }
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => applyTab(t.dataset.group, { record: true })));
  document.querySelectorAll('.panetab').forEach(t =>
    t.addEventListener('click', () => {
      state.pane = t.dataset.pane;
      document.querySelectorAll('.panetab').forEach(x => x.classList.toggle('is-active', x === t));
      syncToggles();
      syncTabs();
    }));

  $('#hideAll').addEventListener('click', () => {
    pushUndo();
    const vis = viewer.visibilityMap(state.pane);
    const anyOn = state.index.systems.some(s => vis.get(s.id) !== false);
    for (const s of state.index.systems) setSystem(s.id, !anyOn);
    state.tab = anyOn ? null : 'all';
    syncTabs();
  });
  $('#railToggle').addEventListener('click', () => setRail(!state.rail));
  document.querySelectorAll('#viewSheet [data-dir]').forEach(b =>
    b.addEventListener('click', () => goToDir(b.dataset.dir)));
  $('#markAdd').addEventListener('click', saveBookmark);
  $('#contentsBtn').addEventListener('click', () => openContents(true));
  $('#contentsClose').addEventListener('click', () => openContents(false));
  $('#cutClear').addEventListener('click', clearCuts);
  $('#resetView').addEventListener('click', resetView);

  // explode ------------------------------------------------------------
  const slider = $('#explode');
  const onSlide = () => {
    const v = Number(slider.value);
    viewer.setSpread(v / 100);
    $('#explodeVal').textContent = `${Math.round(v)} %`;
    if (state.region) applyCuts();
    viewer.frameCurrent();
  };
  state.onSlide = onSlide;
  slider.addEventListener('input', () => { viewer.autoFrame = true; viewer.tween = null; onSlide(); });
  slider.addEventListener('pointerup', () => { viewer.autoFrame = false; });
  slider.addEventListener('change', () => { viewer.autoFrame = false; });
  $('#resetExplode').addEventListener('click', () => {
    animateSlider(Number(slider.value), 0, v => { slider.value = v; onSlide(); });
  });

  // view bar -----------------------------------------------------------
  const markView = v => document.querySelectorAll('.viewbar button[data-view]').forEach(b => {
    if (!['spin', 'home', 'split'].includes(b.dataset.view)) b.classList.toggle('is-active', b.dataset.view === v);
  });
  state.markView = markView;
  document.querySelectorAll('.viewbar button').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'spin') {
      viewer.controls.autoRotate = !viewer.controls.autoRotate;
      b.classList.toggle('is-active', viewer.controls.autoRotate);
      return;
    }
    if (v === 'split') {
      const on = !viewer.split;
      viewer.setSplit(on);
      b.classList.toggle('is-active', on);
      $('#paneTabs').hidden = !on;
      $('#paneLabels').hidden = !on;
      if (!on) {
        state.pane = 'A';
        document.querySelectorAll('.panetab').forEach(x => x.classList.toggle('is-active', x.dataset.pane === 'A'));
        syncToggles();
      }
      viewer.frameCurrent();
      return;
    }
    if (v === 'home') { resetView(); return; }
    viewer.goToView(v);
    markView(v);
  }));

  // pointer ------------------------------------------------------------
  let pending = null, down = null, moved = 0;
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;   // touch reports moves while orbiting
    pending = { x: e.clientX, y: e.clientY };
    if (down) moved = Math.max(moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
  });
  canvas.addEventListener('pointerleave', () => { pending = null; viewer.setHovered(-1); tooltip.hidden = true; });
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; });
  canvas.addEventListener('pointerup', e => {
    if (!down) return;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const slow = performance.now() - down.t > 600;
    down = null;
    if (dist > (e.pointerType === 'mouse' ? 5 : 12) || slow) return;
    const id = viewer.pickAt(e.clientX, e.clientY);
    if (id < 0) {
      if (!state.multiselect) { selectPart(-1); state.markView(null); }
      return;
    }
    if (state.multiselect) {
      const primary = viewer.toggleSelected(id);
      selectPart(primary, { keepSelection: true });
    } else {
      selectPart(id, { focus: e.detail > 1 });
    }
    syncToolbar();
    if (e.pointerType !== 'mouse') showTooltip(id, e.clientX, e.clientY, 1600);
  });

  let tooltipTimer = 0;
  function showTooltip(id, x, y, hideAfter = 0) {
    const p = viewer.byId.get(id);
    tooltip.innerHTML = `<span class="tsys">${label(state.systems.get(p.s))}</span>${partName(p)}`;
    tooltip.hidden = false;
    const r = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(Math.max(8, x + 14), innerWidth - r.width - 10)}px`;
    tooltip.style.top = `${Math.min(Math.max(8, y + 16), innerHeight - r.height - 10)}px`;
    clearTimeout(tooltipTimer);
    if (hideAfter) tooltipTimer = setTimeout(() => { tooltip.hidden = true; }, hideAfter);
  }

  state.hoverTask = () => {
    if (!pending || !state.loaded.size) return;
    const { x, y } = pending;
    pending = null;
    const id = viewer.pickAt(x, y);
    viewer.setHovered(id);
    if (id < 0) { tooltip.hidden = true; return; }
    showTooltip(id, x, y);
  };

  // detail -------------------------------------------------------------
  $('#detailClose').addEventListener('click', () => selectPart(-1));
  $('#clearSel').addEventListener('click', () => selectPart(-1));
  $('#isolateBtn').addEventListener('click', toggleIsolate);
  $('#compareBtn').addEventListener('click', () => {
    setCompare(!state.compare);
    if (state.compare) {
      const p = viewer.byId.get(viewer.selected);
      viewer.focusPair(p, viewer.byId.get(p.p));
    }
  });

  // search -------------------------------------------------------------
  const input = $('#search'), results = $('#results');
  input.addEventListener('input', runSearch);
  input.addEventListener('focus', () => { if (input.value.trim()) runSearch(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      state.cursor = Math.max(0, Math.min(state.results.length - 1, state.cursor + (e.key === 'ArrowDown' ? 1 : -1)));
      renderResults();
    } else if (e.key === 'Enter') chooseResult(state.cursor);
    else if (e.key === 'Escape') { input.value = ''; results.hidden = true; input.blur(); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.topright')) results.hidden = true;
  });

  // about --------------------------------------------------------------
  $('#infoBtn').addEventListener('click', () => { $('#aboutModal').hidden = false; });
  $('#aboutClose').addEventListener('click', () => { $('#aboutModal').hidden = true; });
  $('#aboutModal').addEventListener('click', e => {
    if (e.target.id === 'aboutModal') $('#aboutModal').hidden = true;
  });

  // keyboard -----------------------------------------------------------
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '/') { e.preventDefault(); input.focus(); }
    else if (e.key === 'Escape') {
      if (!$('#contents').hidden) openContents(false);
      else { selectPart(-1); $('#aboutModal').hidden = true; }
    }
    else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); }
    else if (e.key === 'h' && viewer.selection.size) hideSelection();
    else if (e.key === 'm') setMultiselect(!state.multiselect);
    else if (e.key === 't') { pushUndo(); stepTransparency(); }
    else if (e.key === ']') { pushUndo(); setPeel(viewer.peel + 1); }
    else if (e.key === '[') { pushUndo(); setPeel(viewer.peel - 1); }
    else if (e.key === 'i' && viewer.selected >= 0) $('#isolateBtn').click();
    else if (e.key === 'c' && viewer.selected >= 0) $('#compareBtn').click();
    else if (VIEW_KEYS[e.key.toLowerCase()]) goToDir(VIEW_KEYS[e.key.toLowerCase()]);
  });

  // Some tablets do not report `hover: none` until they are actually touched.
  const markTouch = () => { state.touch = true; document.body.classList.add('is-touch'); };
  if (state.touch) markTouch();
  addEventListener('touchstart', markTouch, { once: true, passive: true });
}

function resetView() {
  state.viewer.resetCamera();
  state.markView?.(null);
  $('#resetView').hidden = true;
}


// Keyboard shortcuts for the standard views; the sheet has the buttons.
const VIEW_KEYS = { a: 'A', p: 'P', s: 'S', l: 'L', r: 'R', f: 'I' };

// ----------------------------------------------------------------- search
function runSearch() {
  const input = $('#search'), results = $('#results');
  const q = input.value.trim().toLowerCase();
  if (!q) { results.hidden = true; state.results = []; return; }
  const hits = [];
  for (const p of state.index.parts) {
    if (state.region && !state.viewer.inRegion(p)) continue;
    const name = partName(p).toLowerCase();
    const at = name.indexOf(q);
    if (at >= 0) hits.push({ p, score: at + (name.length - q.length) * 0.02 });
    if (hits.length > 400) break;
  }
  hits.sort((a, b) => a.score - b.score);
  state.results = hits.slice(0, 40).map(h => h.p);
  state.cursor = 0;
  renderResults();
}

function renderResults() {
  const results = $('#results');
  if (!state.results.length) {
    results.innerHTML = `<div class="empty">${state.t('search.empty')}</div>`;
    results.hidden = false;
    return;
  }
  results.innerHTML = state.results.map((p, i) => {
    const s = state.systems.get(p.s);
    return `<button data-i="${i}" class="${i === state.cursor ? 'is-cursor' : ''}">
      <span class="rdot" style="background:${s.color}"></span>
      <span class="rname">${partName(p)}</span><span class="rsys">${label(s)}</span></button>`;
  }).join('');
  results.hidden = false;
  results.querySelectorAll('button').forEach(b =>
    b.addEventListener('click', () => chooseResult(Number(b.dataset.i))));
}

function chooseResult(i) {
  const p = state.results[i];
  if (!p) return;
  $('#results').hidden = true;
  $('#search').blur();
  selectPart(p.i, { focus: true });
}

function animateSlider(from, to, apply) {
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / 520);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    apply(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let frame = 0;
function tick() {
  requestAnimationFrame(tick);
  if (state.hoverTask && (frame++ & 1) === 0) state.hoverTask();
  state.viewer.render();
  if (state.pins.length) positionPins();
  // Offer a way back whenever the view has drifted off the body.
  if ((frame & 15) === 0 && state.loaded.size) {
    const drifted = !state.viewer.tween && state.viewer.needsReset();
    if (drifted !== !$('#resetView').hidden) $('#resetView').hidden = !drifted;
  }
}
