# Handoff — Human Atlas

State of the project as of 2026-09-08, after the second pass (regions, layers, contents,
tools, deploy). Written so the next session can pick up without re-deriving anything.
Repo <https://github.com/MonoBL/anatomy-3d>, live at <https://anatomia-ochre.vercel.app>
(public, CC BY-SA 2.1 JP).

## What it is

An interactive 3D atlas of human anatomy: 2,234 individually modelled BodyParts3D structures
across 15 systems, in English and European Portuguese. It is a from-scratch build that
deliberately matches the model, palette and lighting of the reference implementation
[ashemag/human-atlas](https://github.com/ashemag/human-atlas) (MIT, the GPT-6 project from the
reel), with our own features layered on top.

Run it:

```bash
npm install
npm run fetch:data       # BodyParts3D source, ~145 MB -> ~460 MB of OBJ
npm run fetch:wikidata   # FMA -> Wikidata (names in both languages)
npm run fetch:wikipedia  # lead paragraphs, EN + PT
npm run build:atlas      # ~60 s -> public/atlas (26 MB)
npm run dev              # http://localhost:5180
```

`data/` is gitignored and re-fetchable. `public/atlas/` is committed, so a clone runs the
viewer without touching the pipeline.

## Layout

| Path | Role |
| --- | --- |
| `tools/fetch-data.mjs` | downloads and unpacks the BodyParts3D OBJ meshes plus FMA tables |
| `tools/fetch-wikidata.mjs` | resolves FMA ids to Wikidata items via property P1402 |
| `tools/fetch-wikipedia.mjs` | pulls EN/PT lead sections for the matched articles |
| `tools/lib-bp3d.mjs` | FMA graph loading (is-a and part-of), ancestors, element maps |
| `tools/obj.mjs` | OBJ parser — **keeps the authored `vn` normals** |
| `tools/systems.mjs` | the 15 systems: ids, labels EN/PT, colours, groups, overviews |
| `tools/regions.mjs` | the 4 regions and 12 sub-regions: bone rules, nearest-bone voting, sides, boxes |
| `tools/layers.mjs` | muscular layers by occlusion (rays + iterative peel), cached samples |
| `tools/landmarks.mjs` | joint landmarks from the closest pair of vertices between two bones |
| `tools/make-icons.mjs` | generates the PWA icons (no image dependency) |
| `tools/check-i18n.mjs` | checks the UI strings (`npm run check:i18n`) |
| `tools/report-regions.mjs` | region/sub-region report (`npm run report:regions [name]`) |
| `tools/system-map.json` | element id -> system, taken from the reference (MIT) |
| `tools/describe.mjs` | assembles per-structure names and paragraphs from the caches |
| `tools/build-atlas.mjs` | the pipeline: decimate, transform, pack `public/atlas/` |
| `tools/verify.mjs` | sanity-checks every packed binary (`npm run verify:atlas`) |
| `src/atlas.js` | fetch + gunzip + parse the binary format |
| `src/viewer.js` | three.js scene, materials, picking, cuts, split view, camera |
| `src/main.js` | all UI wiring, state, search, panels, toolbar, contents, pins |
| `src/presets.js` | the contents cards: which systems each plate turns on |
| `src/thumbs.js` | thumbnail cache (IndexedDB) |
| `src/bookmarks.js` | saved views (localStorage) |
| `src/offline.js` | service-worker registration and the offline atlas download |
| `src/i18n.js` | UI strings EN / PT-PT, language persistence |
| `tools/pt-terms.mjs` | Portuguese anatomical vocabulary: nouns with gender, adjectives, compounds |
| `tools/pt-derive.mjs` | derives a Portuguese name from the English one, mechanically |

## Data pipeline, as it stands

1. Each of the 2,234 `isa` element meshes is named from its **most specific FMA concept**
   (deepest node of the is-a tree that owns the fewest meshes).
2. Its **system** comes from `tools/system-map.json`. Counts match the reference exactly:
   skeletal 296, muscular 402, arterial 639, venous 404, nervous 139, respiratory 119,
   digestive 97, sensory 45, connective 40, cardiac 23, reproductive 12, urinary 6,
   integumentary 5, endocrine 4, lymphatic 3.
3. **Topology is left alone.** Decimation is meshoptimizer to 22% of each part's triangles
   with the error bounded to 0.2% of its extent (6.68 M -> 2.42 M triangles). Positions and
   the original normals travel together through `compactMesh` and `reorderMesh`.
4. Coordinates: mm and Z-up become metres and Y-up via `(x, z + 0.0781112, -y - 0.1)`, the
   reference's transform, so the figure stands on y = 0. Body height 1.73 m.
5. Per structure the build also derives **volume** (signed tetrahedron sum, cm³), the
   **principal axis** and half-extent (PCA power iteration), an **elongation** ratio, and the
   **contralateral partner**, matched on the name minus its side word (433 pairs).
6. Names and paragraphs: Wikidata P1402 gives article titles and labels in both languages;
   Wikipedia gives the lead sections. A verified Portuguese name is only used when the source
   names the same structure, differing by side at most — in which case gender agreement is
   applied (*Músculo grácil* -> *direito*). That covers 790 structures; the other 1,444 get a
   name derived mechanically from the English (`tools/pt-derive.mjs`) and are flagged `dn` in
   the text file so the panel can say the name is unverified. Paragraphs: 1434 EN and 1213 PT
   from Wikipedia, then a sentence derived from the FMA hierarchy, then the system overview.
   Nothing is machine-translated.
7. Output: one gzipped binary per system plus `index.json` and `text-{en,pt}.json.gz`, 26 MB
   total (the reference ships 33 MB).

### Binary format

`ATL1` magic, `uint32` padded JSON header length, header, then 4-byte aligned buffers:
`position` Uint16 (dequantised in the vertex shader from `index.json`'s `quant`), `normal`
Int16 normalized, `pid` Uint16 (global part id), `index` Uint32. The header lists each part's
vertex and index ranges.

## Renderer

One merged geometry per system carrying a per-vertex `pid`. All per-part state lives in float
data textures indexed by that id: `partTex` (centroid + visibility), `slotTex` (inventory wall
slot), `extraTex` (principal axis + half extent). A `MeshStandardMaterial` per system is
extended with `onBeforeCompile`:

- vertex: `#include <begin_vertex>` is replaced by `partPosition()`, which dequantises the
  position and blends between assembled, radially scattered and inventory-wall placement.
- fragment: discards hidden parts and anything outside the cut box, then tints the selection.

Lighting is the reference's: prefiltered `RoomEnvironment`, `HemisphereLight`, a warm key and
a cool rim, ACES filmic tone mapping at exposure 1.12, sRGB output, and a turntable (floor,
platform, two rings) that hides once the explode slider moves. Surface detail is geometric,
from the preserved normals — there is no procedural fibre shading any more.

Result: the whole body in **~15 draw calls at 60 fps**. Picking renders a 1×1 pixel id-buffer
under the cursor with an override material (the stage is hidden for that pass).

## The study tools (second pass, modelled on Anatomy 3D Atlas)

- **Contents screen** — region tabs, then plate cards per system group ("Muscles and bones",
  "Bones", "Arteries", "Nerves and muscles", organs, surface). Cards are data in
  `src/presets.js`; a region only gets a card when it holds at least three parts of that
  system. Thumbnails are rendered by the viewer into a render target, lazily, and cached in
  IndexedDB under a renderer version plus the atlas build.
- **Regions and sub-regions** — 4 regions, 12 sub-regions, plus a side switch. Entering a limb
  picks a side, so the view is a plate of one arm or one leg. Membership uses per-region and
  per-sub-region shares, and the view is trimmed to that area's bone box.
- **Muscular layers** — ten per region, peeled superficial-first with a fade.
- **Toolbar** — layer stepper, views, pins, transparency, centre, isolate, multiselect, hide,
  undo (30 steps), explode, reset, hide interface.
- **Views sheet** — ANT/POS/LAT/MED/SUP/INF, LAT and MED resolved against the active side,
  plus the joints of the region on screen.
- **Transparency** — three steps; with something selected the rest fades, otherwise the whole
  body does. A tap goes through anything under 15% alpha.
- **Pins and saved views** — labels that follow the model, and named states that restore
  region, systems, layers, cuts, selection, pins and camera.
- **Offline** — the service worker keeps the shell, and one button stores the whole atlas.

## Ours, on top of the reference

- **European Portuguese** everywhere: UI, system names and overviews, structure paragraphs,
  verified structure names. Language persists in `localStorage`.
- **Anatomical cuts** on the sagittal, coronal and axial planes: a world-space box tested in
  the fragment shader, with the picking pass testing it too, and back faces switched on so the
  exposed interior reads as solid.
- **Left/right comparison**: selects the contralateral partner, tints it, frames both, and
  charts the two volumes with the difference.
- **Split view**: two panes, one camera, independent system visibility per pane (two
  visibility textures, swapped between two scissored renders).
- **Inventory wall** at the top of the explode slider, **search**, **isolate**, standard views
  that reframe, a **Reset view** pill that appears when the projected bounds leave the screen,
  pan clamped to the content, and a touch layout for tablets.

## Gotchas already paid for

Do not re-learn these:

- **`meshoptimizer` renumbers indices in place.** `compactMesh` and `reorderMesh` both rewrite
  the index array and return `[remap, uniqueCount]` for the *vertex* buffers. Applying the
  remap to indices as well scrambles the mesh.
- **The OBJ files have `vn` lines.** Discarding them and recomputing smooth normals is what
  made every muscle look like plastic.
- **`renderer.setViewport` takes logical pixels** and multiplies by the pixel ratio itself.
  Passing device pixels doubles the viewport on retina — the model looked shoved off screen on
  Nuno's Mac while looking fine at dpr 1.
- **When a render target is bound, three uses `renderTarget.viewport`,** not the renderer's,
  unless `setViewport` is called after `setRenderTarget`.
- **`centroid` and `flat` are reserved words in GLSL**, and a backtick inside a `/* glsl */`
  template literal ends the string.
- The JSON header in each binary is NUL-padded to 4 bytes; strip the padding before parsing.
- Wikipedia's anonymous API rate-limits hard: batch 20 titles, GET, ~1 req/s, back off on 429.
- Tabs are presets that *set* visibility, not filters, and they never switch the body surface
  back on because it would hide everything behind it.
- **A `WebGLRenderTarget` holds linear colour** unless its texture is marked
  `SRGBColorSpace`. Reading pixels back without that gives lurid thumbnails.
- **BP3D's +x is the body's own left**, so a camera at +x shows the left side. The first view
  table had the two lateral directions the wrong way round.
- **`backdrop-filter` on a child escapes an ancestor's scroll clip in iOS Safari.** That is
  what made the rail's panels paint over each other on the iPad; the rail's panels are solid
  now, and it is the only scroll container.
- **One material cannot write depth for some fragments and not others**, which is why
  transparency needs a second mesh per system rather than a flag.
- **`meshoptimizer` samples per vertex, but anatomy is per area.** Vertex-stride sampling let
  the finely tessellated tendon at the wrist speak for a whole muscle; the layer pass samples
  by triangle area instead.
- **Structures must be large to belong to two regions.** In the anatomical position the hands
  hang beside the hips, so nearest-bone voting put small pelvic structures in the arm.

## Where it stands

Live at <https://anatomia-ochre.vercel.app> — Vercel, static, `vercel --prod --yes` from the
repo root (the CLI's project link lives in `.vercel/`, gitignored). Nothing is connected to
GitHub, so a deploy is that one command. The (i) panel credits the work and links both
repositories; the button beside it explains how to put the atlas on an iPad's home screen and
store it for offline use.

Everything planned in `PLAN.md` is done: regions and sub-regions with a side switch, ten
muscular layers peeled by occlusion, the working toolbar with thirty steps of undo, the
contents screen with rendered thumbnails (including a "Closer in" group per sub-region),
the views sheet with joint landmarks, transparency, pins, saved views, hide-interface,
Portuguese for every structure, offline storage, and the deploy.

## Open decisions, and what each needs

These are the ones that need something from outside the repo, so they are written down
rather than half-started.

**1b — verified Portuguese names.** All 2,234 structures now have a Portuguese name: 790
verified against Wikidata/Wikipedia, 1,444 derived mechanically by `tools/pt-derive.mjs` from
the vocabulary in `tools/pt-terms.mjs`, and the panel marks a derived name as unverified. To
promote derived names to verified, the missing ingredient is a source: the Portuguese
Terminologia Anatómica as data (CSV/XLSX), or a faculty glossary. With FMA ids or English
names in one column, the mapping is a small script and the `dn` flag disappears for whatever
it covers. Reviewing the derived names by hand would work too — `npm run report:regions` is
the model for a report that lists them.

**2 — peripheral nerves.** BodyParts3D's 139 nervous meshes are all cranial: there is no
brachial plexus, no sciatic nerve, nothing in the limbs. No pipeline change can conjure them.
The realistic source is [Z-Anatomy](https://github.com/LluisV/Z-Anatomy) (CC BY-SA), which
does model the peripheral nervous system, but it is a Blender project with its own naming, so
it means a second importer: meshes to our binary format, its labels mapped onto FMA where they
overlap, and a decision about whether the two models sit side by side (they are different
bodies and will not align exactly). Veins are similarly trunk-heavy in BP3D, and would benefit
from the same import.

**5 — the female atlas.** Only the male BP3D atlas is built. The reference implementation has
a female path in its converter, so the route is known: fetch the female dataset (~460 MB of
source), run the same pipeline, and ship a second set of binaries. What needs deciding is
whether it becomes a switch inside one deployment (roughly +27 MB, so the offline download
doubles) or a separate build; the regions, layers and landmarks all recompute from geometry,
so nothing else in the pipeline needs to know about it.

## Smaller things left

- The deepest layer of a region is a bucket: muscles walled in by bone are ranked by how much
  covers them rather than peeled in turn.
- Muscle fibres do not fan. Our per-part direction is a single PCA axis; the commercial
  Anatomy 3D Atlas app fans them via real UV textures, which BodyParts3D does not ship.
- Cuts shade their interior as flat mass rather than filling a true cap. Stencil caps were
  measured out: six full-scene passes a frame over 2.4 M triangles is not something an iPad
  can spare.
- Lymphatic has 3 parts and endocrine 4 — the source dataset is thin there, not a bug.
- No tests. `npm run verify:atlas`, `npm run report:regions` and `npm run check:i18n` are the
  current safety net.

## Working preferences captured

Caveman mode, PT conversation. Personal projects commit as
`Nuno Mendes <nunom3ndes2005@gmail.com>` — never the Veesion address. When a visual reference
is named, match it literally rather than inventing detail; fix flatness with lighting and
geometry, not procedural texture.
