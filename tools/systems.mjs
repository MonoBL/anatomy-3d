// Ordered classification rules. The first rule whose pattern hits the part's own
// name or any of its ancestor class names wins, so specific systems come first.
// Patterns are unanchored: BP3D names are phrases like "wall of left atrium".
export const SYSTEMS = [
  { id: 'arteries', label: 'Arteries', color: '#c2392f', group: 'vessels',
    labelPt: 'Artérias',
    info: { en: 'Arteries carry blood away from the heart. Their elastic walls smooth the pulse into steady flow, branching down to the arterioles that meter delivery into each tissue.',
            pt: 'As artérias levam o sangue para fora do coração. A parede elástica transforma a pulsação em fluxo contínuo, ramificando-se até às arteríolas que doseiam a entrega a cada tecido.' },
    re: /\b(artery|arterial|arteriole|aorta|aortic (arch|sinus|bulb)|arteries|truncus arteriosus|brachiocephalic trunk|celiac trunk|pulmonary trunk)/ },


  { id: 'veins', label: 'Veins', color: '#426aa8', group: 'vessels',
    labelPt: 'Veias',
    info: { en: 'Veins return blood to the heart at low pressure. Thin walls, one-way valves and the squeeze of surrounding muscle push the column of blood upward against gravity.',
            pt: 'As veias devolvem o sangue ao coração a baixa pressão. Paredes finas, válvulas de sentido único e a compressão dos músculos à volta empurram a coluna de sangue contra a gravidade.' },
    re: /\b(vein|venous|venule|vena cava|caval|sinus of dura mater|dural venous sinus|portal)/ },


  { id: 'heart', label: 'Heart', color: '#c0554c', group: 'organs',
    labelPt: 'Coração',
    info: { en: 'The heart is a four-chambered pump. Its valves keep blood moving one way while the myocardium contracts as a single coordinated unit, roughly once a second for a lifetime.',
            pt: 'O coração é uma bomba de quatro cavidades. As válvulas mantêm o sangue num só sentido enquanto o miocárdio contrai como uma unidade coordenada, cerca de uma vez por segundo, a vida inteira.' },
    re: /\b(heart|atrium|atrial|ventricle of heart|papillary muscle|chorda tendinea|pericardi|myocardi|endocardi|epicardi|tricuspid|mitral valve|aortic valve|pulmonary valve|interventricular septum|interatrial septum|trabecula carnea|cardiac (chamber|valve|vein|muscle|septum)|coronary sinus|cavity of (left|right) (ventricle|atrium)|wall of (left|right) (ventricle|atrium)|leaflet of|cusp of (tricuspid|mitral|aortic|pulmonary))/ },


  { id: 'sensory', label: 'Sensory organs', color: '#a68cc9', group: 'organs',
    labelPt: 'Órgãos dos sentidos',
    info: { en: 'Sensory organs convert the physical world into nerve impulses: light in the eye, pressure waves in the ear, chemistry in the nose and tongue.',
            pt: 'Os órgãos dos sentidos convertem o mundo físico em impulsos nervosos: a luz no olho, as ondas de pressão no ouvido, a química no nariz e na língua.' },
    re: /\b(eyeball|eye proper|orbital content|visual apparatus|ocular|choroid(?! plexus)|retina|sclera|cornea|lens|iris|ciliary|vitreous|aqueous|eyelid|tarsal plate|lacrimal|nasolacrimal|conjunctiva|extra-ocular|ear|auricle of ear|auditory|cochlea|vestibul|tympan|osseous labyrinth|membranous labyrinth|malleus|incus|stapes|olfactory|taste|vallate papilla|anterior chamber|posterior chamber)/ },


  { id: 'nervous', label: 'Nervous system', color: '#e3c65c', group: 'organs',
    labelPt: 'Sistema nervoso',
    info: { en: 'The nervous system senses, decides and commands. Brain and spinal cord form the central core; peripheral nerves carry signals out to muscle and back from every sensor.',
            pt: 'O sistema nervoso sente, decide e comanda. O encéfalo e a medula espinal formam o núcleo central; os nervos periféricos levam os sinais até ao músculo e trazem-nos de volta de cada sensor.' },
    re: /\b(neuraxis|brain|cerebr|cerebell|thalamus|hypothalamus|epithalamus|subthalamus|pons|medulla oblongata|midbrain|mesencephal|diencephal|telencephal|metencephal|myelencephal|corpus callosum|fornix|amygdala|hippocamp|basal ganglion|caudate nucleus|putamen|globus pallidus|substantia nigra|red nucleus|colliculus|spinal cord|nerve|neural tree|ganglion|plexus of nerves|meninx|dura mater|arachnoid|pia mater|choroid plexus|ventricular system|ventricle of (brain|neuraxis)|lateral ventricle|fourth ventricle|third ventricle|cerebral aqueduct|interpeduncular fossa|interventricular foramen|pituitary stalk|infundibulum of neurohypophysis|olive|pyramid of medulla|internal capsule|optic (nerve|chiasm|tract)|tract of|funiculus|commissure)/ },


  { id: 'respiratory', label: 'Respiratory', color: '#d3a3a6', group: 'organs',
    labelPt: 'Respiratório',
    info: { en: 'The airway carries air down a branching tree to the alveoli, where oxygen crosses into blood and carbon dioxide leaves it. The diaphragm does most of the work of breathing.',
            pt: 'As vias aéreas conduzem o ar por uma árvore ramificada até aos alvéolos, onde o oxigénio passa para o sangue e o dióxido de carbono sai. O diafragma faz a maior parte do trabalho de respirar.' },
    re: /\b(lung|lobe of lung|pulmonary (lobule|segment)|bronch|tracheobronchial|trachea|larynx|laryngeal|vocal|conus elasticus|cricoid|thyroid cartilage|epiglottis|arytenoid|pleura|diaphragm|nasal cavity|paranasal|nasal septum|choana|maxillary sinus|frontal sinus|sphenoidal sinus|ethmoidal sinus|pharyn)/ },


  { id: 'digestive', label: 'Digestive', color: '#c2905c', group: 'organs',
    labelPt: 'Digestivo',
    info: { en: 'The digestive tract breaks food down and absorbs it, assisted by the liver, gallbladder and pancreas, which supply enzymes and bile and process what has been absorbed.',
            pt: 'O tubo digestivo desfaz os alimentos e absorve-os, com a ajuda do fígado, da vesícula biliar e do pâncreas, que fornecem enzimas e bílis e processam o que foi absorvido.' },
    re: /\b(alimentary|oral cavity|mouth|tongue|palate|uvula|esophag|stomach|gastric|pylor|cardia|fundus of stomach|intestine|intestinal|duoden|jejun|ile(um|al)|ileocecal|colon|cecum|caecum|appendix|rectum|rectal|anal|anus|liver|hepatic (lobe|duct|parenchyma)|hepatovenous|lobe of liver|biliary|gallbladder|cystic duct|bile duct|pancrea|spleen|splenic parenchyma|peritoneum|omentum|mesocolon|mesentery|salivary|parotid|submandibular|sublingual|taenia|haustrum|papilla of Vater|sphincter of Oddi)/ },


  { id: 'urinary', label: 'Urinary', color: '#a4685c', group: 'organs',
    labelPt: 'Urinário',
    info: { en: 'The kidneys filter the entire blood volume many times a day, tuning water, salt and acid balance, and send the waste on through ureters, bladder and urethra.',
            pt: 'Os rins filtram todo o volume de sangue muitas vezes por dia, ajustando o equilíbrio de água, sais e ácidos, e enviam os resíduos pelos ureteres, bexiga e uretra.' },
    re: /\b(kidney|renal (pelvis|parenchyma|cortex|medulla|papilla|calix|pyramid|capsule)|ureter|urinary bladder|urethra|urinary|trigone)/ },


  { id: 'reproductive', label: 'Reproductive', color: '#c58aa4', group: 'organs',
    labelPt: 'Reprodutor',
    info: { en: 'The reproductive organs produce gametes and the hormones that shape the body, and provide the ducts and structures involved in fertilisation.',
            pt: 'Os órgãos reprodutores produzem gâmetas e as hormonas que moldam o corpo, e fornecem os canais e estruturas envolvidos na fecundação.' },
    re: /\b(genital|gonad|testis|testicular|epididym|ductus deferens|deferent duct|seminal|prostat|penis|penile|corpus cavernosum|corpus spongiosum|scrotum|ovary|ovarian|uterus|uterine|vagina|vulva|labium (majus|minus)|clitoris|placenta|spermatic)/ },


  { id: 'endocrine', label: 'Endocrine', color: '#d9a83f', group: 'organs',
    labelPt: 'Endócrino',
    info: { en: 'Endocrine glands release hormones directly into the blood, coordinating growth, metabolism, stress response and reproduction across the whole body.',
            pt: 'As glândulas endócrinas libertam hormonas directamente no sangue, coordenando o crescimento, o metabolismo, a resposta ao stress e a reprodução em todo o corpo.' },
    re: /\b(endocrine|thyroid gland|parathyroid|adrenal|suprarenal|hypophysis|pituitary|pineal|thymus|islet)/ },


  { id: 'lymphatic', label: 'Lymphatics', color: '#7fb069', group: 'organs',
    labelPt: 'Linfático',
    info: { en: 'Lymphatic vessels and nodes drain the fluid that leaks out of capillaries, filter it past resident immune cells, and return it to the bloodstream.',
            pt: 'Os vasos e gânglios linfáticos drenam o líquido que escapa dos capilares, filtram-no junto das células imunitárias residentes e devolvem-no à corrente sanguínea.' },
    re: /\b(lymph|lymphatic|thoracic duct|cisterna chyli|tonsil)/ },


  { id: 'muscles', label: 'Muscles', color: '#dba69b', group: 'muscles',
    labelPt: 'Músculos',
    info: { en: 'Skeletal muscles generate movement by pulling on their attachments. Together with tendons, they move joints, stabilize posture, and produce heat.',
            pt: 'Os músculos esqueléticos geram movimento ao puxar pelas suas inserções. Juntamente com os tendões, movem as articulações, estabilizam a postura e produzem calor.' },
    re: /\b(muscle|muscular|musculature|tendon|tendinous|aponeuros|fascia|sphincter|belly of|linea alba|raphe|interosseous membrane|thyrohyoid membrane|rotator|flexor|extensor|abductor|adductor|levator|depressor|pronator|supinator|gracilis|sartorius|soleus|gastrocnemius|deltoid|trapezius|masseter|temporalis|diaphragmatic)/ },


  { id: 'skeleton', label: 'Skeleton', color: '#f0e9db', group: 'skeleton',
    labelPt: 'Esqueleto',
    info: { en: 'Bones, cartilages and the joints between them form the frame that carries load, protects the organs and gives muscles something to pull against. Bone is living tissue: it remodels along the lines of the forces it carries.',
            pt: 'Os ossos, as cartilagens e as articulações entre eles formam a estrutura que suporta carga, protege os órgãos e dá aos músculos algo por onde puxar. O osso é tecido vivo: remodela-se ao longo das linhas de força que suporta.' },
    re: /\b(bone|bony|osseous|cartilage|cartilaginous|joint|articulat|ligament|intervertebral disk|skeletal|vertebra|vertebral|rib|sternum|manubrium|xiphoid|clavicle|scapula|humerus|radius|ulna|carpal|metacarpal|phalanx|femur|patella|tibia|fibula|tarsal|metatarsal|pelvis|ilium|ischium|pubis|sacrum|coccyx|skull|cranium|cranial|mandible|maxilla|zygomatic|frontal bone|parietal|occipital|temporal bone|sphenoid|ethmoid|palatine|lacrimal bone|nasal bone|vomer|hyoid|meniscus|labrum|symphysis|suture|fontanelle|capsule of .* joint|process)/ },


  { id: 'teeth', label: 'Teeth', color: '#f8f3e8', group: 'skeleton',
    labelPt: 'Dentes',
    info: { en: 'Teeth are the hardest structures in the body, anchored in the jaws by periodontal ligament. Enamel over dentine gives them a surface that survives a lifetime of chewing.',
            pt: 'Os dentes são as estruturas mais duras do corpo, fixados aos maxilares pelo ligamento periodontal. O esmalte sobre a dentina dá-lhes uma superfície que aguenta uma vida inteira de mastigação.' },
    re: /\b(tooth|teeth|molar|premolar|canine tooth|incisor|dentine|enamel|dental pulp|gingiva|periodont|cementum)/ },


  { id: 'integument', label: 'Integument', color: '#e8cdb4', group: 'organs',
    labelPt: 'Pele',
    info: { en: 'Skin is the largest organ: a barrier against water loss and infection, a thermostat, and a sensory sheet covering the entire body.',
            pt: 'A pele é o maior órgão: uma barreira contra a perda de água e a infecção, um termóstato e uma folha sensorial que cobre o corpo inteiro.' },
    re: /\b(skin|integument|epidermis|dermis|nail|hair|subcutaneous|mammary|breast|nipple|areola)/ },
];

export const OTHER = {
  id: 'other', label: 'Other structures', color: '#9fa0a2', group: 'organs',
  labelPt: 'Outras estruturas',
  info: { en: 'Connective sheets, cavities, ducts and boundary structures that support and separate the organs around them.',
          pt: 'Lâminas conjuntivas, cavidades, canais e estruturas de fronteira que apoiam e separam os órgãos à sua volta.' },
};
export const ALL_SYSTEMS = [...SYSTEMS, OTHER];

export function classify(ownName, ancestorNames) {
  const hay = [ownName, ...ancestorNames];
  for (const s of SYSTEMS) for (const n of hay) if (s.re.test(n)) return s.id;
  return OTHER.id;
}
