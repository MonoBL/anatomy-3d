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
- Ranked per region: peeling the arm does not peel the back. Each round takes the muscles
  that are *most* exposed among those left, not everything over a fixed bar — a fixed bar
  peeled half a limb in one press, where an atlas turns a page at a time. Ten layers per
  region, which is the granularity of the reference app. Spot-checked on the arm: deltoid and
  brachioradialis at 1, flexor carpi radialis 4, biceps 5, brachialis 6, coracobrachialis 7,
  flexor digitorum superficialis 8, profundus 9, pronator quadratus and supraspinatus 10.
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

- **Transparency.** Done. Per-part alpha lives in the state texture. Every system now has a
  second mesh over the same geometry: the solid pass discards fragments with alpha below 1 and
  writes depth, the ghost pass discards the solid ones and blends without writing depth, so a
  selected structure stays solid inside a faded body. One mesh could not do both — a single
  material cannot write depth for some of its fragments and not others. The button steps
  off → 34% → 18%: with something selected everything else fades, with nothing selected the
  whole body does. The picking pass ignores anything below 15% alpha, which is how a tap goes
  through the body surface (permanently at 10%) to the muscle underneath. The side effect is
  that the skin itself can only be selected from the search, not by tapping it.
- **Region clip.** Reuse `setClip`, driven by the active region box; allow the anatomical cut
  box to intersect it rather than replace it.
- **Selection set.** `selected: number` -> `Set<number>`, with a `selectionTex` lookup
  instead of the single `uSelected` compare. Primary selection keeps the stronger tint.
- **Hidden set.** Per-part hide independent of system visibility, folded into
  `applyVisibility`.
- **Layer peel.** Visibility filter `layer <= cap` for the active region, animated (fade the
  outgoing layer over ~200 ms rather than popping).
- **Pins.** Done. Each pinned part projects its anchor (its centroid, or its wall slot once
  exploded) to screen pixels every frame; an SVG layer draws the dot and the leader line, and
  an HTML label sits at the end of it, flipping to the other side near the screen edge. A pin
  hides itself when its structure is off screen or not currently visible, and tapping one
  selects the structure. Occlusion culling by id-buffer reads was left out: a read per pin per
  frame is not worth it, and a label on a structure behind another still reads correctly with
  its leader line.
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
| 6 | Transparency | second pass + pick-through | **done** — three steps, selection stays solid |
| 7 | Pins & bookmarks | labels, leader lines, saved states | **done** — pins follow the model, saved views restore everything |
| 8 | Polish & deploy | hide interface, layer fade, PT audit, offline, Vercel | **done** |

Phases 1 and 3 are the data-heavy ones and carry the risk; 2, 4-8 are mostly UI.

---

## 9. Phone layout (2026-09-09)

The atlas is built for an iPad and shows it on an iPhone 12 (390 x 844): the title runs under
the search field, the region strip overflows, and the toolbar is a single row that loses a
button off each edge. Everything below is a layout problem, not a feature one — the same
controls, arranged for one hand on a small screen.

| # | Change | Why |
| --- | --- | --- |
| 1 | A `phone` breakpoint (max-width 700px) plus an `is-phone` body class for the JS that has to know | the tablet rules assume ~800px of width |
| 2 | Top bar: the masthead text goes, the search collapses to an icon that expands over the bar, and the row is icons only | the title and the field were fighting for the same 390px |
| 3 | Region and sub-region strips: full width, scrollable, with the counts off | five region names never fit; scrolling with a visible edge is honest |
| 4 | Toolbar: a 5 x 2 grid of icon buttons instead of one row, 56px targets | ten actions cannot sit in a row on a phone |
| 5 | Layer stepper leaves the toolbar for the bottom-left corner, mirroring the explode bar bottom-right | both thumbs, both corners, and the grid keeps its ten cells |
| 6 | Systems / saved views / cuts become a proper drawer with a scrim | a 248px column over a 390px screen has to be modal |
| 7 | The detail panel becomes a bottom sheet, and the views sheet goes full width | a 262px card on a phone is a postage stamp |
| 8 | Hide-interface moves into the drawer | it is for screenshots, not for constant use |
| 9 | Audit at 390x844 and 844x390 with every panel open, as the tablet layout was audited | the only way this stays fixed |

**Done (0.2.1).** Audited clean in both orientations with the detail sheet, the views sheet, the
explode sheet and the drawer each open. Three things were learned on the way: a
backdrop-filtered element is the containing block for a `position: fixed` child, so the layer
stepper could not be lifted out of the toolbar and became a grid cell spanning both rows
instead; a phone in landscape is short rather than narrow, so the phone rules key on
`(max-width: 700px), (max-width: 1000px) and (max-height: 500px)`; and the tablet rules that
cap the detail panel at 320px with an auto margin had to be undone explicitly for the sheet
to fill the width. Two more came out of testing on the phone itself: `flex: 1 1 auto` on a box
with no in-flow content collapses in Safari, which left the explode slider as a pill and a
button with nothing between them, and a cached `matchMedia` result goes stale on rotation, so
the one-panel-at-a-time rule asks the query live.

The explode slider was then made horizontal by default and only rotated on wide screens, so
the phone layout has nothing to override.

The turntable went with it — the floor, platform and rings the reference stands its figure on.
They sit in front of the body whenever you look up from below, which is the angle for the
pelvis and the plantar surface.

## 7. Decisions taken (2026-09-08)

- **One limb at a time**: entering the upper or lower limb selects a side, so the view is a
  plate of one arm or one leg as in the reference app. Both sides stay one tap away, and the
  contents cards render whatever the card will open.
- **Selection colour**: amber, as in the reference. The cool tint sank into the muscle red.
- **Regions**: 4 tabs, as the reference — Head / Trunk / Upper limb / Lower limb. Neck folds
  into Head-and-neck, pelvis into Trunk; both stay available as sub-regions.
- **Theme**: stays light. The screenshots are dark, the look does not change.
- **Deploy**: on Vercel, static, from a push to `main` (the URL stays private — it is a
  personal deployment, not a public site). The binaries are served `immutable`, so a second
  visit costs nothing; the service worker keeps the shell and the Offline button stores the
  27 MB atlas on the device.

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
