// System taxonomy, colours and copy.
//
// The 15 systems, their colours and the English overviews follow the reference
// implementation (ashemag/human-atlas, MIT), so this atlas reads the same way.
// The element -> system mapping itself lives in tools/system-map.json, taken
// from the same source. Portuguese copy is ours.
export const SYSTEMS = [
  {
    id: 'skeletal', label: 'Skeleton', labelPt: 'Esqueleto', color: '#e2d9ba', group: 'skeleton',
    info: {
      en: 'Bones form the supporting framework of the body, protect organs, and provide attachment points for muscles. Their internal tissue also stores minerals and produces blood cells.',
      pt: 'Os ossos formam a estrutura que sustenta o corpo, protegem os órgãos e dão pontos de fixação aos músculos. O tecido interno armazena minerais e produz células do sangue.',
    },
  },
  {
    id: 'muscular', label: 'Muscles', labelPt: 'Músculos', color: '#a85b50', group: 'muscles',
    info: {
      en: 'Skeletal muscles generate movement by pulling on their attachments. Together with tendons, they move joints, stabilize posture, and produce heat.',
      pt: 'Os músculos esqueléticos geram movimento ao puxar pelas suas inserções. Com os tendões, movem as articulações, estabilizam a postura e produzem calor.',
    },
  },
  {
    id: 'cardiac', label: 'Heart', labelPt: 'Coração', color: '#b96760', group: 'organs',
    info: {
      en: 'The heart is a muscular pump with four chambers. Its valves direct blood forward through the pulmonary and systemic circuits.',
      pt: 'O coração é uma bomba muscular de quatro cavidades. As válvulas dirigem o sangue em frente pelos circuitos pulmonar e sistémico.',
    },
  },
  {
    id: 'sensory', label: 'Sensory organs', labelPt: 'Órgãos dos sentidos', color: '#b0c8ce', group: 'organs',
    info: {
      en: 'These structures contribute to special senses, including sight, hearing, and balance. Their specialized tissues detect stimuli and work with the nervous system to convey information.',
      pt: 'Estas estruturas servem os sentidos especiais, incluindo a visão, a audição e o equilíbrio. Os seus tecidos especializados detetam estímulos e trabalham com o sistema nervoso para transmitir informação.',
    },
  },
  {
    id: 'arterial', label: 'Arteries', labelPt: 'Artérias', color: '#c05245', group: 'vessels',
    info: {
      en: 'The heart drives blood through the circulation. Arteries carry blood away from the heart to supply tissues or, in the pulmonary circuit, to the lungs.',
      pt: 'O coração impulsiona o sangue pela circulação. As artérias levam o sangue para fora do coração até aos tecidos ou, no circuito pulmonar, até aos pulmões.',
    },
  },
  {
    id: 'venous', label: 'Veins', labelPt: 'Veias', color: '#527c9f', group: 'vessels',
    info: {
      en: 'Veins return blood toward the heart. Superficial and deep networks collect blood from the tissues; the pulmonary veins bring oxygenated blood back from the lungs.',
      pt: 'As veias devolvem o sangue ao coração. Redes superficiais e profundas recolhem o sangue dos tecidos; as veias pulmonares trazem sangue oxigenado dos pulmões.',
    },
  },
  {
    id: 'nervous', label: 'Nervous system', labelPt: 'Sistema nervoso', color: '#d8b565', group: 'organs',
    info: {
      en: 'The brain, spinal cord, and peripheral nerves carry and process signals. They support sensation, movement, coordination, and automatic regulation of body functions.',
      pt: 'O encéfalo, a medula espinal e os nervos periféricos transportam e processam sinais. Sustentam a sensação, o movimento, a coordenação e a regulação automática das funções do corpo.',
    },
  },
  {
    id: 'respiratory', label: 'Respiratory', labelPt: 'Respiratório', color: '#b98991', group: 'organs',
    info: {
      en: 'The airways conduct air to the lungs, where oxygen and carbon dioxide move between air and blood. Breathing depends on pressure changes produced by respiratory muscles.',
      pt: 'As vias aéreas conduzem o ar até aos pulmões, onde o oxigénio e o dióxido de carbono passam entre o ar e o sangue. Respirar depende das mudanças de pressão produzidas pelos músculos respiratórios.',
    },
  },
  {
    id: 'digestive', label: 'Digestive', labelPt: 'Digestivo', color: '#b8916b', group: 'organs',
    info: {
      en: 'The digestive tract breaks down food, absorbs nutrients and water, and moves waste onward. Accessory organs contribute bile and digestive enzymes.',
      pt: 'O tubo digestivo desfaz os alimentos, absorve nutrientes e água e empurra os resíduos para a frente. Os órgãos acessórios fornecem bílis e enzimas digestivas.',
    },
  },
  {
    id: 'urinary', label: 'Urinary', labelPt: 'Urinário', color: '#b47961', group: 'organs',
    info: {
      en: 'The kidneys filter blood and regulate fluid, electrolyte, and acid-base balance. Urine travels through the ureters to the bladder and exits through the urethra.',
      pt: 'Os rins filtram o sangue e regulam o equilíbrio de líquidos, eletrólitos e ácido-base. A urina segue pelos ureteres até à bexiga e sai pela uretra.',
    },
  },
  {
    id: 'lymphatic', label: 'Lymphatic', labelPt: 'Linfático', color: '#879f7c', group: 'organs',
    info: {
      en: 'Lymphatic vessels return excess tissue fluid to the circulation. Lymph nodes and other lymphoid organs support immune surveillance and responses.',
      pt: 'Os vasos linfáticos devolvem à circulação o excesso de líquido dos tecidos. Os gânglios linfáticos e outros órgãos linfoides sustentam a vigilância e a resposta imunitária.',
    },
  },
  {
    id: 'endocrine', label: 'Endocrine', labelPt: 'Endócrino', color: '#c5a09a', group: 'organs',
    info: {
      en: 'Endocrine organs release hormones into the blood to coordinate processes such as metabolism, growth, stress responses, and reproduction.',
      pt: 'Os órgãos endócrinos libertam hormonas no sangue para coordenar processos como o metabolismo, o crescimento, a resposta ao stress e a reprodução.',
    },
  },
  {
    id: 'reproductive', label: 'Reproductive', labelPt: 'Reprodutor', color: '#bda098', group: 'organs',
    info: {
      en: 'The male reproductive structures represented here contribute to sperm production, maturation, transport, and the production of sex hormones.',
      pt: 'As estruturas reprodutoras masculinas representadas aqui contribuem para a produção, maturação e transporte de espermatozoides e para a produção de hormonas sexuais.',
    },
  },
  {
    id: 'connective', label: 'Connective tissue', labelPt: 'Tecido conjuntivo', color: '#aec3bb', group: 'skeleton',
    info: {
      en: 'Cartilage, ligaments, and other connective tissues support, connect, and separate structures. Their roles include stabilizing joints and distributing mechanical loads.',
      pt: 'A cartilagem, os ligamentos e outros tecidos conjuntivos apoiam, ligam e separam estruturas. Entre outras funções, estabilizam articulações e distribuem cargas mecânicas.',
    },
  },
  {
    id: 'integumentary', label: 'Body surface', labelPt: 'Superfície do corpo', color: '#ba9b7d', group: 'organs',
    info: {
      en: 'The body surface provides an outer anatomical reference. The integumentary system forms a protective barrier and contributes to sensation and temperature regulation.',
      pt: 'A superfície do corpo dá uma referência anatómica exterior. O sistema tegumentar forma uma barreira protetora e contribui para a sensação e a regulação da temperatura.',
    },
  },
];

// Anything the source map leaves unassigned lands here, as it does upstream.
export const OTHER = SYSTEMS.find(s => s.id === 'connective');
export const ALL_SYSTEMS = SYSTEMS;
