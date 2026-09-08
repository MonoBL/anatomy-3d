# Handoff — Human Atlas

State of the project as of 2026-09-08. Written so the next session can pick up without
re-deriving anything. Repo: <https://github.com/MonoBL/anatomy-3d> (public, CC BY-SA 2.1 JP).

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
| `tools/system-map.json` | element id -> system, taken from the reference (MIT) |
| `tools/describe.mjs` | assembles per-structure names and paragraphs from the caches |
| `tools/build-atlas.mjs` | the pipeline: decimate, transform, pack `public/atlas/` |
| `tools/verify.mjs` | sanity-checks every packed binary (`npm run verify:atlas`) |
| `src/atlas.js` | fetch + gunzip + parse the binary format |
| `src/viewer.js` | three.js scene, materials, picking, cuts, split view, camera |
| `src/main.js` | all UI wiring, state, search, panels |
| `src/i18n.js` | UI strings EN / PT-PT, language persistence |

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
   Wikipedia gives the lead sections. A Portuguese name is only used when the source names the
   same structure, differing by side at most — in which case gender agreement is applied
   (*Músculo grácil* -> *direito*). Coverage: 790 PT names, 1434 EN and 1213 PT paragraphs.
   Everything else falls back to a sentence derived from the FMA hierarchy, then to the system
   overview. Nothing is machine-translated.
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

## Known gaps / candidates for next

- **Not deployed.** `npm run build` produces a static `dist/`; Vercel already offered to
  import the repo (it watches the GitHub account, nothing was connected).
- Muscle fibres do not fan. Our per-part direction is a single PCA axis; the commercial
  Anatomy 3D Atlas app fans them via real UV textures, which BodyParts3D does not ship.
- 1,444 structures have no verified Portuguese name and fall back to English, flagged in the
  panel. Raising that needs a curated anatomical dictionary.
- Lymphatic has 3 parts and endocrine 4 — the source dataset is thin there, not a bug.
- No cross-section caps: a cut shows the interior shell, not a filled face. Real caps need a
  stencil pass.
- Only the male BP3D atlas. The reference also has a female HRA path in its converter.
- No tests. `npm run verify:atlas` and `npm run report:systems` are the current safety net.

## Working preferences captured

Caveman mode, PT conversation. Personal projects commit as
`Nuno Mendes <nunom3ndes2005@gmail.com>` — never the Veesion address. When a visual reference
is named, match it literally rather than inventing detail; fix flatness with lighting and
geometry, not procedural texture.
