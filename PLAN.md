# Plan — Anatomy 3D Atlas parity, iPad first

Goal: turn the viewer into a study tool usable daily on an iPad, with the same working
model as the commercial *Anatomy 3D Atlas* app in the screenshots: pick a **region**, pick a
**preset** (muscles and bones / bones / arteries / nerves ...), then peel **layers**, hide,
isolate, pin and reframe with one hand.

Scope: **every region and every limb** — head, neck, trunk (thorax, abdomen, pelvis),
upper limb (arm, forearm, hand), lower limb (thigh, leg, foot) — both sides.

Primary device: iPad Safari, landscape and portrait, touch only, often offline.
Desktop keeps working but is no longer the design target.

---

## 1. Feature map (reference app -> us)

| Reference feature | Today | Work needed |
| --- | --- | --- |
| Region tabs (Head / Trunk / Upper limb / Lower limb) | none | **new data: region per part** + region views |
| Contents grid of preset cards with thumbnails | system tabs only | **new UI + thumbnail generator** |
| `MUSCULAR LAYERS` up/down stepper | none | **new data: depth layer per muscle** + stepper |
| `VIEWS` panel: ANT POS LAT MED SUP INF + joint shortcuts | 5 views, no MED/LAT-by-side, no joints | extend `VIEWS`, add **joint landmarks** |
| `TRANSPARENCY` | none | second transparent pass, per-part alpha |
| `CENTER` (recentre on selection) | partial (view reframes) | explicit centre-on-selection button |
| `ISOLATE` | yes | keep, move into the new toolbar |
| `HIDE` (hide the selected part) | no | per-part hide + hidden list |
| `MULTISELECT` | no | selection set instead of a single id |
| `UNDO` | no | undo stack over visibility/selection ops |
| `RESET` | partial (reset view) | reset = view + visibility + layers + cuts |
| `PINS` (labels in 3D) | no | projected HTML labels with leader lines |
| Bookmark / save state | no | localStorage slots |
| `HIDE INTERFACE` | no | one toggle, chrome fades out |
| Search | yes | keep, make it region-aware |
| Filter (by system) | tabs | fold into the region + preset model |
| Cross-sections | ours, better | keep |
| Left/right compare, split view, explode, inventory wall | ours | keep, demote in the toolbar |

---

## 2. Data work (build pipeline)

### 2.1 Region per part — the blocker for everything else
Checked: `partof_element_parts.txt` covers only **1258 / 2234** parts, and its limb concepts
are useless (`FMA7184 lower limb` = 3 elements, no `upper limb` concept at all). Head 143,
neck 13, trunk 577, thorax 537, abdomen 24, pelvis 8. So region cannot come from the
part-of graph alone.

Approach, in this order:
1. **Bone atlas by rule.** The 296 skeletal parts get a region from their FMA name
   (humerus/radius/ulna/carpal/metacarpal/phalanx-of-hand -> upper limb; femur/patella/
   tibia/fibula/tarsal/metatarsal/phalanx-of-foot -> lower limb; cervical vertebrae -> neck;
   rib/sternum/thoracic+lumbar vertebrae/sacrum/hip bone/clavicle/scapula -> trunk;
   cranial bones/mandible/hyoid -> head). Hand-verify all 296 once, store as a checked-in
   table (`tools/regions.json`) — small enough to be authoritative.
2. **Nearest-bone vote for everything else.** Sample each part's vertices, query a k-d tree
   over labelled bone vertices, vote the region. Muscles, vessels and nerves inherit the
   region of the skeleton they run along, which is what the reference app does visually.
3. **Multi-region membership.** A part whose votes split (aorta, spinal cord, sciatic nerve)
   is a member of every region above a threshold, with per-region vote share stored.
4. **Region clip box** per region, from the member parts' bounds plus the labelled bones.
   Region views then reuse the existing cut-box uniform to trim a long vessel at the
   region boundary instead of showing it running off into the body.
5. Also derive **sub-regions** (arm, forearm, hand, thigh, leg, foot, thorax, abdomen,
   pelvis) the same way; they feed the joint shortcuts and the finer preset cards.

Output: `region` (primary), `regions[]` (with weights), `subregion` per part in `index.json`.
Validation: a `npm run report:regions` table, every region non-empty, no part unassigned.

### 2.2 Layer depth per muscle — done, `tools/layers.mjs`
`MUSCULAR LAYERS` needed an integer depth per muscle, per region. What shipped:
- A uniform grid over 1.5 M triangles: the 402 muscles as peelable owners, plus 642
  **blockers** (bones, cartilage, organs — never peeled, but they hide what is behind them).
  Leaving the bones out was the first wrong answer: the deep forearm flexors looked exposed
  because their rays escaped straight through the radius.
- 110 rays per muscle, from points spread over the surface **by area** (vertex-stride
  sampling let the subcutaneous tendon at the wrist speak for the whole muscle), each ray
  recording *which* muscles it crosses.
- Layers then come from iterative peeling, the definition an atlas plate uses: a muscle with
  25% of its surface able to see out is in the current layer; remove that layer and see what
  became visible. Because each ray remembers its occluders, the rounds are set arithmetic,
  not new ray casts. Muscles walled in by bone are ranked by how much covers them.
- Ranked per region: peeling the arm does not peel the back. Result: upper limb 3 layers,
  lower limb 3, trunk 6, head 6. Spot-checked — deltoid, biceps, brachioradialis and flexor
  carpi radialis at layer 1; brachialis, supraspinatus, soleus, vastus intermedius at 2;
  flexor digitorum profundus and gluteus minimus at 3.
- The ray pass costs ~35 s, so the samples are cached in `data/layer-samples.json` (gitignored,
  keyed by a signature of the geometry) and the thresholds can be retuned in seconds.
- Still to do: the same treatment for `skeletal` vs `connective` ("ligaments and bones"),
  and a deep/superficial split for vessels.

### 2.3 Landmarks for the joint shortcuts — done, `tools/landmarks.mjs`
Fourteen definitions, each a pair of bone-name patterns, resolved at build time into 25
landmarks (both sides where it applies): shoulder, elbow, wrist, hand, hip, knee, ankle,
foot, jaw, skull base, cervical spine, sternoclavicular, lumbar spine, sacroiliac. A joint
is where two bones almost touch, so that is how the point is found — the closest pair of
sampled vertices between the two bones, and the midpoint between them. No hand-placed
coordinates to drift out of date, and a missing bone reports itself in the build log.

The views sheet holds ANT / POS / LAT / MED / SUP / INF plus the joints of whichever region
is on screen. LAT and MED resolve against the active side, or the selected structure's side.
A standard view frames the region box rather than the whole body, and the four direction
buttons left the right-hand rail, which now only carries auto-rotate, split and home.

One thing that needed fixing: BP3D is +x to the body's own left, so a camera at +x shows the
left side. The old view table had the two lateral directions the wrong way round.

### 2.4 Presets — done, `src/presets.js`
A declarative list (client-side, no atlas rebuild needed): id, group, label EN/PT, the systems
the card turns on, and the system it is *about*. Which cards a region gets is decided at
runtime from the index, so a region with fewer than three parts of a system has no card for
it. Sixteen presets across musculoskeletal, cardiovascular, nervous, lymphatic, organ and
surface groups.

Worth knowing about the source data: BodyParts3D's 139 nervous meshes are all cranial, so
the limbs have no nerve cards — there are no peripheral nerve meshes to show. Veins are
likewise almost all trunk. This is the dataset, not the pipeline.

Thumbnails are rendered by the viewer itself into a render target and cached in IndexedDB,
keyed by a renderer version plus the atlas build, so nothing is shipped and nothing goes
stale. Two things were wrong first time: a render target holds linear colour unless its
texture is marked sRGB (every card came out lurid), and framing on the region box left the
cards mostly empty — they frame the visible content instead.

---

## 3. Renderer work

- **Transparency.** Add a per-part alpha channel to the part texture. Transparent parts draw
  in a second pass with `depthWrite: false`, sorted back-to-front by system; the picking pass
  ignores parts below an alpha threshold so you can tap through a ghosted skin.
- **Region clip.** Reuse `setClip`, driven by the active region box; allow the anatomical cut
  box to intersect it rather than replace it.
- **Selection set.** `selected: number` -> `Set<number>`, with a `selectionTex` lookup
  instead of the single `uSelected` compare. Primary selection keeps the stronger tint.
- **Hidden set.** Per-part hide independent of system visibility, folded into
  `applyVisibility`.
- **Layer peel.** Visibility filter `layer <= cap` for the active region, animated (fade the
  outgoing layer over ~200 ms rather than popping).
- **Pins.** For each pinned part project its centroid, place an absolutely positioned label
  with an SVG leader line, cull when the centroid is behind geometry (one extra id-buffer
  read per pin per frame, batched into a single small render target).
- **Thumbnails.** Render each preset offscreen once (256x256, framed on its region, plain
  background), cache as a blob in IndexedDB keyed by preset id + atlas version. No headless
  render dependency, no repo bloat.

---

## 4. UI work (iPad first)

- **Contents screen** as the entry point: region strip along the top (4-6 circular icons),
  preset cards grouped by system below, `BUY`-slot replaced by nothing. Tapping a card enters
  the viewer with that state.
- **Bottom toolbar**, thumb reachable, 64 px targets: layer stepper on the left; then Views,
  Transparency, Centre, Isolate, Multiselect, Hide, Undo, Reset; `HIDE INTERFACE` bottom-left.
- **Views sheet** as in the screenshot: ANT POS LAT MED SUP INF row, joint shortcuts below
  (region-aware: shoulder/elbow/wrist for the upper limb, hip/knee/ankle for the lower).
  LAT/MED resolve against the selected part's side.
- **Left rail**: search, filter, settings, bookmark, help.
- **Info panel** stays, becomes a bottom sheet in portrait.
- **Gestures**: one finger rotate, two fingers pan, pinch zoom, tap select, double tap
  centre, long press = context menu (hide / isolate / pin / compare). No hover-dependent UI
  anywhere.
- **Layout**: `env(safe-area-inset-*)`, both orientations, no page scroll, no 300 ms tap
  delay, `touch-action: none` on the canvas.
- Everything labelled EN + PT-PT through `src/i18n.js`.

---

## 5. Delivery

- **Deploy to Vercel** (static `dist/`) early, not at the end — the iPad is the test device,
  so it needs a URL from day one.
- **PWA**: manifest, standalone display, service worker precaching `public/atlas` (26 MB) so
  it works in a lecture with no wifi. Add an in-app "download for offline" button rather
  than precaching on first paint.
- Keep `npm run verify:atlas`; add `report:regions` and `report:layers` as the safety net.

---

## 6. Phases

| # | Phase | Contents | Ship criterion |
| --- | --- | --- | --- |
| 0 | PWA shell | manifest, icons, service worker, offline download, headers | **done**; deploy deferred to the end |
| 1 | Regions | 2.1 + region views + region strip in the UI | **done** — 4 regions, 12 sub-regions, region clip box |
| 2 | Toolbar | new bottom toolbar, hide/multiselect/undo/reset/centre | **done** — plus a 30-step undo stack |
| 3 | Layers | 2.2 + layer stepper | **done** — peel by occlusion; fade still to do |
| 4 | Presets | 2.4 + contents screen + thumbnails | **done** — cards per region, thumbnails cached in IndexedDB |
| 5 | Views | 2.3 + views sheet + joint shortcuts | **done** — 6 directions, LAT/MED by side, 25 joint landmarks |
| 6 | Transparency | second pass + pick-through | ghosted bones with muscles visible |
| 7 | Pins & bookmarks | labels, leader lines, saved states | a labelled screenshot for revision |
| 8 | Polish & deploy | hide interface, PT audit, Vercel | usable for a whole study session, on a URL |

Phases 1 and 3 are the data-heavy ones and carry the risk; 2, 4-8 are mostly UI.

---

## 7. Decisions taken (2026-09-08)

- **Regions**: 4 tabs, as the reference — Head / Trunk / Upper limb / Lower limb. Neck folds
  into Head-and-neck, pelvis into Trunk; both stay available as sub-regions.
- **Theme**: stays light. The screenshots are dark, the look does not change.
- **Deploy**: not now. Phase 0 built the PWA plumbing (manifest, icons, service worker,
  offline atlas download, Vercel headers); the actual deploy happens at the end.

## 7b. Still open

1. **Layer count**: fixed 5 per region, or per-region max from the data? Default: per-region.
2. **Bone table review**: the 296-row region table is best hand-checked once. Worth an hour
   from someone reading the anatomy, or accept rule + spot-check?
3. **PT names**: 1,444 still fall back to English. Does she need PT everywhere before this is
   useful, or is EN acceptable for the rare structures? Curating needs a dictionary source.
4. **Offline size**: 26 MB precache is fine on an iPad; keep the full atlas or ship a
   "study set" (skeletal + muscular + nervous) to cut it to ~15 MB?

## 8. Not doing

- Fanned muscle fibres (needs UVs BodyParts3D does not ship).
- Filled cross-section caps (stencil pass) — already noted, still out of scope.
- Female atlas.
- Quiz / flashcard mode. Tempting for faculty use, but only after the atlas itself is solid.
