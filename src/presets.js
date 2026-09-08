// The contents screen: which combinations of systems are worth a card, and in
// which order. Mirrors the plates of the reference app — "Muscles and bones",
// "Bones", "Arteries", "Nerves and muscles" — with the systems this atlas has.
//
// A preset is data only: a set of systems to switch on, per region. Which cards
// a region gets is decided at runtime from the atlas index, so a region with no
// lymphatic mesh simply has no lymphatic card.

export const PRESET_GROUPS = [
  { id: 'musculoskeletal', label: 'Musculoskeletal system', labelPt: 'Sistema musculosquelético' },
  { id: 'cardiovascular', label: 'Cardiovascular system', labelPt: 'Sistema cardiovascular' },
  { id: 'nervous', label: 'Nervous system', labelPt: 'Sistema nervoso' },
  { id: 'lymphatic', label: 'Lymphatic system', labelPt: 'Sistema linfático' },
  { id: 'organs', label: 'Internal organs', labelPt: 'Órgãos internos' },
  { id: 'surface', label: 'Surface', labelPt: 'Superfície' },
];

// `systems` is what the card turns on. `key` is the system a card is *about*:
// a region with none of it gets no card, however much context the card adds.
export const PRESETS = [
  {
    id: 'musclesBones', group: 'musculoskeletal', key: 'muscular',
    label: 'Muscles and bones', labelPt: 'Músculos e ossos',
    systems: ['muscular', 'skeletal'],
  },
  {
    id: 'bones', group: 'musculoskeletal', key: 'skeletal',
    label: 'Bones', labelPt: 'Ossos',
    systems: ['skeletal'],
  },
  {
    id: 'ligaments', group: 'musculoskeletal', key: 'connective',
    label: 'Ligaments and bones', labelPt: 'Ligamentos e ossos',
    systems: ['connective', 'skeletal'],
  },
  {
    id: 'vessels', group: 'cardiovascular', key: 'arterial',
    label: 'Arteries and veins', labelPt: 'Artérias e veias',
    systems: ['arterial', 'venous', 'skeletal'],
  },
  {
    id: 'arteries', group: 'cardiovascular', key: 'arterial',
    label: 'Arteries', labelPt: 'Artérias',
    systems: ['arterial', 'skeletal'],
  },
  {
    id: 'veins', group: 'cardiovascular', key: 'venous',
    label: 'Veins', labelPt: 'Veias',
    systems: ['venous', 'skeletal'],
  },
  {
    id: 'heart', group: 'cardiovascular', key: 'cardiac',
    label: 'Heart', labelPt: 'Coração',
    systems: ['cardiac'],
  },
  {
    id: 'nerves', group: 'nervous', key: 'nervous',
    label: 'Nerves', labelPt: 'Nervos',
    systems: ['nervous', 'skeletal'],
  },
  {
    id: 'nervesMuscles', group: 'nervous', key: 'nervous',
    label: 'Nerves and muscles', labelPt: 'Nervos e músculos',
    systems: ['nervous', 'muscular'],
  },
  {
    id: 'lymphatics', group: 'lymphatic', key: 'lymphatic',
    label: 'Lymphatic system', labelPt: 'Sistema linfático',
    systems: ['lymphatic', 'skeletal'],
  },
  {
    id: 'organs', group: 'organs', key: 'digestive',
    label: 'Digestive organs', labelPt: 'Órgãos digestivos',
    systems: ['digestive', 'skeletal'],
  },
  {
    id: 'respiratory', group: 'organs', key: 'respiratory',
    label: 'Respiratory organs', labelPt: 'Órgãos respiratórios',
    systems: ['respiratory', 'skeletal'],
  },
  {
    id: 'urogenital', group: 'organs', key: 'urinary',
    label: 'Urogenital organs', labelPt: 'Órgãos urogenitais',
    systems: ['urinary', 'reproductive', 'skeletal'],
  },
  {
    id: 'endocrine', group: 'organs', key: 'endocrine',
    label: 'Endocrine glands', labelPt: 'Glândulas endócrinas',
    systems: ['endocrine', 'skeletal'],
  },
  {
    id: 'senses', group: 'organs', key: 'sensory',
    label: 'Sense organs', labelPt: 'Órgãos dos sentidos',
    systems: ['sensory', 'skeletal'],
  },
  {
    id: 'skin', group: 'surface', key: 'integumentary',
    label: 'Body surface', labelPt: 'Superfície do corpo',
    systems: ['integumentary'],
  },
];

// A card is worth showing when the region actually holds enough of the system
// it is about. One stray vessel in a foot does not deserve a plate of its own.
const MIN_PARTS = 3;

export function presetsFor(index, regionId) {
  const counts = new Map();
  for (const p of index.parts) {
    if (regionId && p.rg !== regionId && !p.rgw?.[regionId]) continue;
    counts.set(p.s, (counts.get(p.s) ?? 0) + 1);
  }
  return PRESETS
    .map(preset => ({ preset, count: counts.get(preset.key) ?? 0 }))
    .filter(({ count }) => count >= MIN_PARTS);
}

// The plates worth offering one level down: a hand or a pelvis is a plate in
// its own right, the rest of the systems are not.
export const SUBREGION_PRESETS = ['musclesBones', 'bones'];

export function subregionCardsFor(index, regionId) {
  if (!regionId) return [];
  const subs = index.subregions.filter(s => s.region === regionId);
  const out = [];
  for (const sub of subs) {
    for (const id of SUBREGION_PRESETS) {
      const preset = PRESETS.find(p => p.id === id);
      if (!preset) continue;
      const n = presetSize(index, regionId, preset, sub.id);
      if (n >= MIN_PARTS) out.push({ preset, sub, count: n });
    }
  }
  return out;
}

// How many parts a card will actually put on screen, for the card's caption.
export function presetSize(index, regionId, preset, subId = null) {
  const systems = new Set(preset.systems);
  let n = 0;
  for (const p of index.parts) {
    if (!systems.has(p.s)) continue;
    if (regionId && p.rg !== regionId && !p.rgw?.[regionId]) continue;
    if (subId && p.sr !== subId && !p.srw?.[subId]) continue;
    n++;
  }
  return n;
}
