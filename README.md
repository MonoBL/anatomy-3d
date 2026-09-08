# Human Atlas

An interactive 3D atlas of human anatomy: **2,234 individually modelled structures**,
grouped into 14 anatomical systems, in **English and European Portuguese**. Hover to name a
structure, click to read about it, isolate it, cut the body along any anatomical plane,
compare a structure against its contralateral partner, put two configurations side by side,
or explode the whole body out into a flat inventory wall of every single piece.

The meshes are real anatomy, not stand-ins: they come from
[BodyParts3D 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html),
the anatomical model published by the Database Center for Life Science (DBCLS), Japan.

## Run it

```bash
npm install
npm run fetch:data       # ~145 MB download, unpacks to ~460 MB of OBJ meshes
npm run fetch:wikidata   # FMA -> Wikidata mapping (names in both languages)
npm run fetch:wikipedia  # lead paragraphs, English and Portuguese
npm run build:atlas      # ~40 s: welds, decimates, quantises, packs public/atlas/
npm run dev              # http://localhost:5180
```

The two fetch steps are optional and cached: without them the atlas still builds, and
each structure falls back to a sentence derived from the FMA hierarchy.

`npm run build` produces a static `dist/` that can be served from anywhere.
`data/` is gitignored; `public/atlas/` (14.4 MB) is the only runtime payload.

## Controls

| Action | How |
| --- | --- |
| Orbit / zoom / pan | drag · wheel or pinch · right-drag |
| Inspect a structure | hover for the name, click for the detail panel |
| Frame a structure | double-click it, or pick it from search |
| Isolate | `Isolate structure` in the detail panel, or `i` |
| Solo a system | click a system's name (click again to restore) |
| Explode | the bottom slider: 0-60 % scatters, 60-100 % morphs into the inventory wall |
| Anatomical cut | the *Anatomical cut* panel: click a plane's name to enable it, drag to move it, ⇄ to flip which half stays |
| Compare left/right | `Compare with the other side` in the detail panel, or `c` — bars show the volume of each side |
| Split view | the ◫ button in the right-hand bar: two panes, one camera, independent system visibility |
| Language | `EN` / `PT` next to the search box; the choice is remembered |
| Standard views | `A` anterior · `P` posterior · `S` superior · `R` right, or the right-hand bar |
| Reset the view | the ↺ button in the right-hand bar; a **Reset view** pill also appears whenever the camera drifts off the body |
| Search | `/` then type a structure name |

## How it works

**Build pipeline** (`tools/`, Node, no native deps)

1. `fetch-data.mjs` pulls the BodyParts3D element meshes plus the FMA name and
   hierarchy tables.
2. Each of the 2,234 element meshes is named from its **most specific** FMA concept
   (deepest node of the is-a tree that owns the fewest meshes). The system each mesh
   belongs to comes from `tools/system-map.json`, the taxonomy published by the
   reference implementation: 639 arteries, 404 veins, 402 muscles, 296 skeletal,
   40 connective, and so on across 15 systems.
3. Topology is left untouched — the OBJ files carry authored vertex normals that hold
   the sculpted surface relief, and welding would throw them away. Each mesh is
   decimated with meshoptimizer to 22% of its triangles with the geometric error bounded
   to 0.2% of the part's extent, landing on ~2.4 M triangles total, down from 6.7 M.
   The original normals travel with the surviving vertices.
4. Per structure the build also derives its **volume** (signed tetrahedron sum, in cm³),
   its **principal axis**, and its **contralateral partner**, matched on the name minus its
   side word.
5. Names and paragraphs come from `fetch-wikidata` (FMA id -> Wikidata property P1402 ->
   article titles and labels in both languages) and `fetch-wikipedia` (lead sections).
   A Portuguese name is only used when the source names the same structure — differing by
   side at most, in which case the agreement is applied (*Músculo grácil* → *direito*).
   Structures with no verified Portuguese name keep their anatomical English name, and the
   panel says so rather than inventing a translation.
6. Everything is transformed to a Y-up, metre-scale body, quantised (positions to
   16-bit, normals to 8-bit) and packed into one gzipped binary per system, plus a
   single `index.json` manifest and one small text file per language.

**Renderer** (`src/`, three.js)

2,234 separate meshes would mean 2,234 draw calls. Instead each system is merged into
one geometry carrying a `pid` vertex attribute, and all per-part state — visibility,
centroid, inventory slot — lives in two float textures indexed by part id. The vertex
shader dequantises the position, then decides where the part belongs: assembled,
scattered radially, or morphed into its slot on the wall. Hidden parts are pushed
outside the clip volume.

The result is the whole body in **13 draw calls at 60 fps**, with per-structure
picking done by rendering a 1×1 pixel id-buffer under the cursor.

Shading is physically based and follows the reference: one `MeshStandardMaterial` per system,
lit by a prefiltered `RoomEnvironment` plus a warm key and a cool rim, tone mapped with the
ACES filmic curve, with the figure standing on a turntable so the eye can read its size. The
surface detail is geometric, not procedural — it comes from the authored normals the build
preserves.

The materials' shaders are extended through `onBeforeCompile`, which is what lets the
per-structure logic ride along with three's own lighting: the vertex stage dequantises the
position and moves the part to wherever the current explode and inventory amounts put it, and
the fragment stage discards hidden or cut geometry and tints the selection.

Cuts are a world-space box tested in the fragment shader (the picking pass tests it too, so
you cannot select what you cannot see); back faces switch on with the cut so the exposed
interior reads as solid matter. Split view renders the same scene twice under a scissor,
swapping which visibility texture is bound — one camera, two configurations.

## Licence and credit

Anatomical data: **BodyParts3D, © The Database Center for Life Science**, licensed
under [CC Attribution-Share Alike 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en).
Structure paragraphs and Portuguese names come from **Wikipedia** and **Wikidata**
(CC BY-SA and CC0 respectively). This viewer is distributed under CC BY-SA — see `NOTICE`.
Structure identifiers derive from the Foundational Model of Anatomy (FMA).
