// Verified Portuguese muscle names, and the key that matches them to a
// BodyParts3D mesh.
//
// The names come from a Portuguese myology table (Estrutura e Função do Sistema
// Músculo-Esquelético) — standard nomenclature, so the names themselves are
// facts and live here in the repo. The table's origin / insertion / action text
// is authored course material and is *not* redistributed: the build picks it up
// from `data/miologia.json` when that file is present locally, the same way it
// picks up the Wikidata and Wikipedia caches.
//
// `key` is a BodyParts3D English name reduced to its core: no side, no "long
// head of", no "set of", no trailing "muscle". The build reduces every muscle
// mesh the same way and looks it up here, so "Long Head of Left Biceps
// Brachii" resolves through `biceps brachii` and comes back out as
// "Cabeça longa do bicípite braquial esquerdo".

export function muscleKey(englishName) {
  let n = englishName.toLowerCase();
  n = n.replace(/\b(left|right)\b/g, ' ');
  n = n.replace(/^\s*set of\s+/, ' ');
  // Leading ordinals number the members of a family (the four lumbricals);
  // they are not part of the muscle's name.
  n = n.replace(/^\s*(first|second|third|fourth|fifth)\s+/, ' ');
  n = n.replace(/^\s*(long|short|medial|lateral|spinal|clavicular|acromial|sternocostal|abdominal|humeral|humeroulnar|ulnar|radial|superficial|deep|oblique|transverse|vertical|straight|ascending|descending|upper|lower|first|second|third|fourth|fifth|anterolateral|posteromedial|septal|anterior|posterior|inferior|superior|intermediate)\s+(head|part|portion|fibers|belly)\s+of\s+(the\s+)?/, ' ');
  n = n.replace(/\bmuscle\b/g, ' ');
  n = n.replace(/\bof the\b/g, 'of');
  n = n.replace(/[.]/g, '');
  return n.replace(/\s+/g, ' ').trim();
}

// The entry that names a mesh: the longest key that appears in the reduced
// English name, so "First Plantar Interosseous of Left Foot" resolves through
// `plantar interosseous of foot` and keeps its ordinal for the derivation.
export function resolveMuscle(englishName) {
  const n = muscleKey(englishName);
  let best = null;
  for (const key of Object.keys(MUSCLES)) {
    if (!n.includes(key)) continue;
    if (!best || key.length > best.length) best = key;
  }
  if (!best) return null;
  const [pt, gender, plural = false] = MUSCLES[best];
  return { key: best, pt, gender, plural };
}

// key -> [Portuguese name, gender, plural?]
export const MUSCLES = {
  // ---------------------------------------------------------- upper limb
  'abductor pollicis brevis': ['abdutor curto do polegar', 'm'],
  'abductor pollicis longus': ['abdutor longo do polegar', 'm'],
  'abductor digiti minimi of hand': ['abdutor do 5.º dedo da mão', 'm'],
  'adductor pollicis': ['adutor do polegar', 'm'],
  anconeus: ['ancóneo', 'm'],
  'biceps brachii': ['bicípite braquial', 'm'],
  brachialis: ['braquial anterior', 'm'],
  brachioradialis: ['braquiorradial', 'm'],
  coracobrachialis: ['coracobraquial', 'm'],
  deltoid: ['deltoide', 'm'],
  'extensor pollicis brevis': ['extensor curto do polegar', 'm'],
  'extensor pollicis longus': ['extensor longo do polegar', 'm'],
  'extensor indicis': ['extensor do 2.º dedo', 'm'],
  'extensor digiti minimi': ['extensor do 5.º dedo', 'm'],
  'extensor digitorum': ['extensor dos dedos', 'm'],
  'extensor carpi radialis brevis': ['extensor radial curto do carpo', 'm'],
  'extensor carpi radialis longus': ['extensor radial longo do carpo', 'm'],
  'extensor carpi ulnaris': ['extensor ulnar do carpo', 'm'],
  'flexor digiti minimi brevis of hand': ['flexor curto do 5.º dedo da mão', 'm'],
  'flexor pollicis brevis': ['flexor curto do polegar', 'm'],
  'flexor pollicis longus': ['flexor longo do polegar', 'm'],
  'flexor digitorum profundus': ['flexor profundo dos dedos', 'm'],
  'flexor digitorum superficialis': ['flexor superficial dos dedos', 'm'],
  'flexor carpi radialis': ['flexor radial do carpo', 'm'],
  'flexor carpi ulnaris': ['flexor ulnar do carpo', 'm'],
  infraspinatus: ['infraespinhal', 'm'],
  'dorsal interossei of hand': ['interósseos dorsais da mão', 'm', true],
  'palmar interossei of hand': ['interósseos palmares da mão', 'm', true],
  'latissimus dorsi': ['latíssimo do dorso', 'm'],
  'levator scapulae': ['levantador da escápula', 'm'],
  'lumbricals of hand': ['lumbricoides da mão', 'm', true],
  'opponens digiti minimi of hand': ['oponente do 5.º dedo da mão', 'm'],
  'opponens pollicis': ['oponente do polegar', 'm'],
  'palmaris brevis': ['palmar curto', 'm'],
  'palmaris longus': ['palmar longo', 'm'],
  'pectoralis major': ['peitoral maior', 'm'],
  'pectoralis minor': ['peitoral menor', 'm'],
  'pronator quadratus': ['pronador quadrado', 'm'],
  'pronator teres': ['pronador redondo', 'm'],
  'teres major': ['redondo maior', 'm'],
  'teres minor': ['redondo menor', 'm'],
  'rhomboid major': ['romboide maior', 'm'],
  'rhomboid minor': ['romboide menor', 'm'],
  'serratus anterior': ['serrátil anterior', 'm'],
  subclavius: ['subclávio', 'm'],
  subscapularis: ['subescapular', 'm'],
  supinator: ['supinador', 'm'],
  supraspinatus: ['supraespinhal', 'm'],
  'triceps brachii': ['tricípite braquial', 'm'],

  // -------------------------------------------------------------- spine
  'scalenus anterior': ['escaleno anterior', 'm'],
  'scalenus medius': ['escaleno médio', 'm'],
  'scalenus posterior': ['escaleno posterior', 'm'],
  spinalis: ['espinhal', 'm'],
  'spinalis thoracis': ['espinhal do tórax', 'm'],
  'splenius capitis': ['esplénio da cabeça', 'm'],
  'splenius cervicis': ['esplénio do pescoço', 'm'],
  sternocleidomastoid: ['esternocleidomastóideo', 'm'],
  'iliocostalis cervicis': ['iliocostal do pescoço', 'm'],
  'iliocostalis lumborum': ['iliocostal dos lombos', 'm'],
  'iliocostalis thoracis': ['iliocostal do tórax', 'm'],
  'interspinalis thoracis': ['interespinhal do tórax', 'm'],
  'interspinales cervicis': ['interespinhais do pescoço', 'm', true],
  'interspinales lumborum': ['interespinhais dos lombos', 'm', true],
  'anterior cervical intertransversarii': ['intertransversais cervicais anteriores', 'm', true],
  'posterior cervical intertransversarii': ['intertransversais cervicais posteriores', 'm', true],
  'lateral lumbar intertransversarius': ['intertransversal lombar lateral', 'm'],
  'medial lumbar intertransversarius': ['intertransversal lombar medial', 'm'],
  'longus capitis': ['longo da cabeça', 'm'],
  'longus colli': ['longo do pescoço', 'm'],
  'longissimus capitis': ['longuíssimo da cabeça', 'm'],
  'longissimus cervicis': ['longuíssimo do pescoço', 'm'],
  'longissimus thoracis': ['longuíssimo do tórax', 'm'],
  'obliquus capitis inferior': ['oblíquo inferior da cabeça', 'm'],
  'obliquus capitis superior': ['oblíquo superior da cabeça', 'm'],
  platysma: ['platisma', 'm'],
  'rectus capitis anterior': ['reto anterior da cabeça', 'm'],
  'rectus capitis lateralis': ['reto lateral da cabeça', 'm'],
  'rectus capitis posterior major': ['reto posterior maior da cabeça', 'm'],
  'rectus capitis posterior minor': ['reto posterior menor da cabeça', 'm'],
  'cervical rotator': ['rotador cervical', 'm'],
  'thoracic rotator': ['rotador torácico', 'm'],
  'lumbar rotator': ['rotador lombar', 'm'],
  'semispinalis capitis': ['semiespinhal da cabeça', 'm'],
  'semispinalis cervicis': ['semiespinhal do pescoço', 'm'],
  'semispinalis thoracis': ['semiespinhal do tórax', 'm'],
  'serratus posterior superior': ['serrátil posterior e superior', 'm'],
  'serratus posterior inferior': ['serrátil posterior e inferior', 'm'],
  trapezius: ['trapézio', 'm'],

  // --------------------------------------------------- abdomen and thorax
  diaphragm: ['diafragma', 'm'],
  'external intercostal': ['intercostal externo', 'm'],
  'internal intercostal': ['intercostal interno', 'm'],
  'innermost intercostal': ['intercostal íntimo', 'm'],
  'levatores costarum breves': ['levantadores curtos das costelas', 'm', true],
  'levatores costarum longi': ['levantadores longos das costelas', 'm', true],
  'external oblique': ['oblíquo externo do abdómen', 'm'],
  'internal oblique': ['oblíquo interno do abdómen', 'm'],
  'quadratus lumborum': ['quadrado lombar', 'm'],
  'rectus abdominis': ['reto abdominal', 'm'],
  'transversus abdominis': ['transverso do abdómen', 'm'],
  'transversus thoracis': ['transverso do tórax', 'm'],

  // ---------------------------------------------------------- lower limb
  'abductor digiti minimi of foot': ['abdutor do 5.º dedo do pé', 'm'],
  'abductor hallucis': ['abdutor do hálux', 'm'],
  'adductor brevis': ['adutor curto', 'm'],
  'adductor hallucis': ['adutor do hálux', 'm'],
  'adductor longus': ['adutor longo', 'm'],
  'adductor magnus': ['adutor magno', 'm'],
  'adductor minimus': ['adutor mínimo', 'm'],
  'biceps femoris': ['bicípite femoral', 'm'],
  'extensor digitorum brevis': ['extensor curto dos dedos', 'm'],
  'extensor digitorum longus': ['extensor longo dos dedos', 'm'],
  'extensor hallucis brevis': ['extensor curto do hálux', 'm'],
  'extensor hallucis longus': ['extensor longo do hálux', 'm'],
  'fibularis brevis': ['fibular curto', 'm'],
  'fibularis longus': ['fibular longo', 'm'],
  'fibularis tertius': ['fibular terceiro', 'm'],
  'flexor digiti minimi brevis of foot': ['flexor do 5.º dedo do pé', 'm'],
  'flexor digitorum brevis': ['flexor curto dos dedos', 'm'],
  'flexor digitorum longus': ['flexor longo dos dedos', 'm'],
  'flexor hallucis brevis': ['flexor curto do hálux', 'm'],
  'flexor hallucis longus': ['flexor longo do hálux', 'm'],
  gastrocnemius: ['gastrocnémio', 'm'],
  'gemellus inferior': ['gémeo inferior', 'm'],
  'gemellus superior': ['gémeo superior', 'm'],
  'gluteus maximus': ['glúteo máximo', 'm'],
  'gluteus medius': ['glúteo médio', 'm'],
  'gluteus minimus': ['glúteo mínimo', 'm'],
  gracilis: ['grácil', 'm'],
  iliacus: ['ilíaco', 'm'],
  'obturator externus': ['obturador externo', 'm'],
  'obturator internus': ['obturador interno', 'm'],
  pectineus: ['pectíneo', 'm'],
  piriformis: ['piriforme', 'm'],
  plantaris: ['plantar', 'm'],
  popliteus: ['poplíteo', 'm'],
  'psoas major': ['psoas maior', 'm'],
  'psoas minor': ['psoas menor', 'm'],
  'quadratus femoris': ['quadrado femoral', 'm'],
  'flexor accessorius': ['quadrado plantar', 'm'],
  'rectus femoris': ['reto femoral', 'm'],
  sartorius: ['sartório', 'm'],
  semimembranosus: ['semimembranoso', 'm'],
  semitendinosus: ['semitendinoso', 'm'],
  soleus: ['sóleo', 'm'],
  'tibialis anterior': ['tibial anterior', 'm'],
  'lumbrical of foot': ['lumbricoide do pé', 'm'],
  'plantar interosseous of foot': ['interósseo plantar do pé', 'm'],
  'dorsal interosseous of foot': ['interósseo dorsal do pé', 'm'],
  'lumbrical of hand': ['lumbricoide da mão', 'm'],
  'tensor fasciae latae': ['tensor da fáscia lata', 'm'],
  coccygeus: ['coccígeo', 'm'],
  'tibialis posterior': ['tibial posterior', 'm'],
  'vastus intermedius': ['vasto intermédio', 'm'],
  'vastus lateralis': ['vasto lateral', 'm'],
  'vastus medialis': ['vasto medial', 'm'],
};
