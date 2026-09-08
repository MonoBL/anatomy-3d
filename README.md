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
   (deepest node of the is-a tree that owns the fewest meshes), then classified into a
   system by matching ordered patterns against its own name and every ancestor class
   name (`tools/systems.mjs`). The counts fall out close to the published atlas:
   639 arteries, 395 veins, 391 muscles, 260 bones.
3. Meshes are welded (BP3D ships triangle soups), then decimated with
   meshoptimizer under a **power-law triangle budget** — small structures such as
   arterioles keep nearly all their detail, the few huge meshes take the cut —
   landing on ~3.0 M triangles total, down from 6.7 M.
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

Shading is deliberately plain: a wrapped-diffuse studio setup with a light that rides the
camera, so a structure reads the same from any angle. What sells the depth is a **depth-buffer
SSAO pass** — the scene renders into a half-float target with a float depth texture, a
half-resolution pass reconstructs view position and normals from that depth alone (24
hemisphere samples plus a depth-discontinuity crease term), and the composite multiplies it
back over the colour. One geometry pass, contact darkening in every seam, still 60 fps.

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
