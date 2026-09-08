// UI strings. Anatomical names and paragraphs are not here: those come from the
// atlas text files, which are sourced from Wikidata and Wikipedia.
export const STRINGS = {
  en: {
    'app.eyebrow': 'Interactive anatomy',
    'app.title': 'Human Atlas',
    'app.sub': 'modeled pieces',
    'search.placeholder': 'Find a structure',
    'search.empty': 'No structure matches that name.',
    'info.title': 'About this atlas',
    'systems.title': 'Systems',
    'systems.all': 'All',
    'systems.skeleton': 'Skeleton',
    'systems.muscles': 'Muscles',
    'systems.organs': 'Organs',
    'systems.hideAll': 'Hide all',
    'systems.showAll': 'Show all',
    'systems.visible': 'pieces visible',
    'systems.visibleOne': 'piece visible',
    'explode.title': 'Explode anatomy',
    'explode.assembled': 'Assembled',
    'explode.every': 'Every piece',
    'explode.reset': 'Reset',
    'stage.body': 'Adult human · male',
    'stage.separated': 'Separated structures',
    'stage.inventory': 'Anatomical inventory',
    'cut.title': 'Anatomical cut',
    'cut.sagittal': 'Sagittal',
    'cut.coronal': 'Coronal',
    'cut.axial': 'Axial',
    'cut.flip': 'Flip side',
    'cut.off': 'Clear cuts',
    'detail.note': 'Structure identified from the source anatomy',
    'detail.ref': 'Atlas reference',
    'detail.pieces': 'Selected pieces',
    'detail.volume': 'Volume',
    'detail.triangles': 'Triangles',
    'detail.source': 'View anatomical source ↗',
    'detail.isolate': 'Isolate structure',
    'detail.clear': 'Clear selection',
    'detail.compare': 'Compare with the other side',
    'detail.compareOff': 'Stop comparing',
    'detail.noPt': '',
    'compare.title': 'Left / right comparison',
    'compare.left': 'Left',
    'compare.right': 'Right',
    'compare.difference': 'difference in volume',
    'compare.equal': 'volumes match',
    'split.title': 'Split view',
    'split.paneA': 'Pane A',
    'split.paneB': 'Pane B',
    'split.editing': 'editing',
    'hints': 'Drag to orbit · Pinch to zoom · Tap to inspect',
    'credits': 'Source & credits ↗',
    'loading': 'Loading',
    'ready': 'Ready',
    'lang': 'Language',
    'view.A': 'Anterior', 'view.P': 'Posterior', 'view.S': 'Superior', 'view.R': 'Right lateral',
    'view.spin': 'Auto-rotate', 'view.home': 'Reset camera', 'view.split': 'Split view',
    'view.reset': 'Reset view',
    'src.wikipedia': 'Wikipedia',
    'src.about': 'about',
    'src.derived': 'BodyParts3D · FMA hierarchy',
  },
  pt: {
    'app.eyebrow': 'Anatomia interactiva',
    'app.title': 'Atlas Humano',
    'app.sub': 'peças modeladas',
    'search.placeholder': 'Procurar uma estrutura',
    'search.empty': 'Nenhuma estrutura corresponde a esse nome.',
    'info.title': 'Sobre este atlas',
    'systems.title': 'Sistemas',
    'systems.all': 'Todos',
    'systems.skeleton': 'Esqueleto',
    'systems.muscles': 'Músculos',
    'systems.organs': 'Órgãos',
    'systems.hideAll': 'Esconder tudo',
    'systems.showAll': 'Mostrar tudo',
    'systems.visible': 'peças visíveis',
    'systems.visibleOne': 'peça visível',
    'explode.title': 'Separar anatomia',
    'explode.assembled': 'Montado',
    'explode.every': 'Todas as peças',
    'explode.reset': 'Reiniciar',
    'stage.body': 'Humano adulto · masculino',
    'stage.separated': 'Estruturas separadas',
    'stage.inventory': 'Inventário anatómico',
    'cut.title': 'Corte anatómico',
    'cut.sagittal': 'Sagital',
    'cut.coronal': 'Coronal',
    'cut.axial': 'Axial',
    'cut.flip': 'Inverter lado',
    'cut.off': 'Remover cortes',
    'detail.note': 'Estrutura identificada a partir da anatomia de origem',
    'detail.ref': 'Referência do atlas',
    'detail.pieces': 'Peças selecionadas',
    'detail.volume': 'Volume',
    'detail.triangles': 'Triângulos',
    'detail.source': 'Ver a fonte anatómica ↗',
    'detail.isolate': 'Isolar estrutura',
    'detail.clear': 'Limpar seleção',
    'detail.compare': 'Comparar com o outro lado',
    'detail.compareOff': 'Parar de comparar',
    'detail.noPt': 'Nome em inglês: sem tradução verificada',
    'compare.title': 'Comparação esquerda / direita',
    'compare.left': 'Esquerda',
    'compare.right': 'Direita',
    'compare.difference': 'de diferença no volume',
    'compare.equal': 'volumes iguais',
    'split.title': 'Vista dividida',
    'split.paneA': 'Painel A',
    'split.paneB': 'Painel B',
    'split.editing': 'a editar',
    'hints': 'Arrastar para rodar · Pinça para zoom · Toque para inspecionar',
    'credits': 'Fonte e créditos ↗',
    'loading': 'A carregar',
    'ready': 'Pronto',
    'lang': 'Idioma',
    'view.A': 'Anterior', 'view.P': 'Posterior', 'view.S': 'Superior', 'view.R': 'Lateral direita',
    'view.spin': 'Rotação automática', 'view.home': 'Reiniciar câmara', 'view.split': 'Vista dividida',
    'view.reset': 'Reiniciar vista',
    'src.wikipedia': 'Wikipédia',
    'src.about': 'sobre',
    'src.derived': 'BodyParts3D · hierarquia FMA',
  },
};

export const LANGS = ['en', 'pt'];
const KEY = 'humanatlas.lang';

export function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.includes(saved)) return saved;
  } catch { /* private mode */ }
  return (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export function rememberLang(lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
}

export function makeT(lang) {
  const table = STRINGS[lang] ?? STRINGS.en;
  return key => table[key] ?? STRINGS.en[key] ?? key;
}

// Applies the current language to every element tagged in the markup.
export function applyStatic(t) {
  document.documentElement.lang = t === STRINGS.pt ? 'pt' : document.documentElement.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}

// Locale-aware numbers, so Portuguese gets 2 234 rather than 2,234.
export const numberFormat = lang => new Intl.NumberFormat(lang === 'pt' ? 'pt-PT' : 'en-US');
