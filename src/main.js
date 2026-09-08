import { loadIndex, loadSystem, loadText } from './atlas.js';
import { Viewer, ANATOMICAL_COLORS } from './viewer.js';
import { makeT, applyStatic, initialLang, rememberLang, numberFormat, LANGS } from './i18n.js';

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
  buildCutRows();
  bindUI();
  tick();
  state.text[state.lang] = await loadText(state.lang);
  await loadAll();
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
  buildCutRows();
  updateVisibleCount();
  updateCaption();
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
  const vis = state.viewer.visibilityMap(state.pane);
  const only = state.index.systems.every(s => (vis.get(s.id) !== false) === (s.id === id));
  for (const s of state.index.systems) setSystem(s.id, only ? !DEFAULT_OFF.has(s.id) : s.id === id);
  state.tab = only ? 'all' : null;
  syncTabs();
}

function applyTab(tab) {
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
  $('#visibleCount').textContent = `${state.nf.format(n)} ${word}`;
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
  let any = false;
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
function selectPart(id, { focus = false } = {}) {
  const viewer = state.viewer;
  viewer.setSelected(id);
  if (id < 0) {
    setCompare(false);
    $('#detail').hidden = true;
    updateVisibleCount();
    return;
  }
  const p = viewer.byId.get(id);
  const sys = state.systems.get(p.s);
  const txt = partText(p);
  if (viewer.visibilityMap('A').get(p.s) === false && state.pane === 'A') setSystem(p.s, true);

  $('#detailSystem').textContent = label(sys);
  $('#detailTitle').textContent = partName(p);
  const noPt = state.lang === 'pt' && !txt.n;
  $('#detailAlt').textContent = noPt ? state.t('detail.noPt') : '';
  $('#detailAlt').hidden = !noPt;
  $('#detailDesc').textContent = txt.d ?? sys.info?.[state.lang] ?? '';
  $('#detailNote').textContent = txt.s
    ? `${state.t('src.wikipedia')} · ${txt.s}`
    : state.t('src.derived');
  $('#detailFma').textContent = p.f;
  $('#detailVolume').textContent = formatVolume(p.v);
  $('#detailCount').textContent = state.nf.format(state.compare && p.p !== undefined ? 2 : 1);
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
    t.addEventListener('click', () => applyTab(t.dataset.group)));
  document.querySelectorAll('.panetab').forEach(t =>
    t.addEventListener('click', () => {
      state.pane = t.dataset.pane;
      document.querySelectorAll('.panetab').forEach(x => x.classList.toggle('is-active', x === t));
      syncToggles();
      syncTabs();
    }));

  $('#hideAll').addEventListener('click', () => {
    const vis = viewer.visibilityMap(state.pane);
    const anyOn = state.index.systems.some(s => vis.get(s.id) !== false);
    for (const s of state.index.systems) setSystem(s.id, !anyOn);
    state.tab = anyOn ? null : 'all';
    syncTabs();
  });
  $('#cutClear').addEventListener('click', clearCuts);
  $('#resetView').addEventListener('click', resetView);

  // explode ------------------------------------------------------------
  const slider = $('#explode');
  const onSlide = () => {
    const v = Number(slider.value);
    viewer.setSpread(v / 100);
    $('#explodeVal').textContent = `${Math.round(v)} %`;
    updateCaption();
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
    if (id < 0) { selectPart(-1); state.markView(null); return; }
    selectPart(id, { focus: e.detail > 1 });
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
  $('#isolateBtn').addEventListener('click', () => {
    viewer.setIsolated(!viewer.isolated);
    $('#isolateBtn').classList.toggle('is-on', viewer.isolated);
    if (viewer.isolated) viewer.focusPart(viewer.byId.get(viewer.selected));
    updateVisibleCount();
  });
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
    else if (e.key === 'Escape') { selectPart(-1); $('#aboutModal').hidden = true; }
    else if (e.key === 'i' && viewer.selected >= 0) $('#isolateBtn').click();
    else if (e.key === 'c' && viewer.selected >= 0) $('#compareBtn').click();
    else if (VIEW_KEYS[e.key.toLowerCase()]) {
      viewer.goToView(VIEW_KEYS[e.key.toLowerCase()]);
      state.markView(VIEW_KEYS[e.key.toLowerCase()]);
    }
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

function updateCaption() {
  const v = Number($('#explode').value);
  $('#stageCaption').textContent = state.t(
    v < 1 ? 'stage.body' : v <= 60 ? 'stage.separated' : 'stage.inventory');
}

const VIEW_KEYS = { a: 'A', p: 'P', s: 'S', r: 'R', l: 'L' };

// ----------------------------------------------------------------- search
function runSearch() {
  const input = $('#search'), results = $('#results');
  const q = input.value.trim().toLowerCase();
  if (!q) { results.hidden = true; state.results = []; return; }
  const hits = [];
  for (const p of state.index.parts) {
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
  // Offer a way back whenever the view has drifted off the body.
  if ((frame & 15) === 0 && state.loaded.size) {
    const drifted = !state.viewer.tween && state.viewer.needsReset();
    if (drifted !== !$('#resetView').hidden) $('#resetView').hidden = !drifted;
  }
}
