# Memory Palace

A browser app for designing houses and palaces, Sims build-mode style, and turning them into
**memory palaces**: ordered journeys of anchors (loci), each holding an idea. There is no
server. A palace lives entirely in its URL and in your browser's local library.

- **Styles with procedural seeds:** condo, family home, mansion/palace, and Frank Lloyd Wright
  Prairie houses.
  - The Prairie style has three variants: *Robie* (long and low), *Fallingwater* (terraces
    cantilevered over a stream and waterfall) and *Usonian* (an L around a pond).
- **Build mode:** a top-down editor.
  - Room tool (drag a rectangle), walls with snapping (endpoints, walls, 45°, grid), doors,
    windows, arches, a furniture catalog, anchors, erase, undo/redo, and multiple floors.
- **Explore:** dollhouse orbit with Sims-style cutaway walls and the journey route drawn in.
- **Walk:** first-person, with collision and stairs. Walk up to an anchor to read it.
- **Tour:** flies stop to stop along the journey, routed through doors and stairs. Recall mode
  hides each note until you reveal it.
- **Suggest a journey:** enters by the front door and keeps turning right, room by room and
  floor by floor (the classic method of loci). It drops loci on each room's most memorable
  furniture.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # codec round-trips, generator determinism + invariants
npm run build      # static site in dist/
```

## Deploy to GitHub Pages

1. Push to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.

`.github/workflows/pages.yml` lints, tests, builds and deploys. Routing is hash-only and
`base: './'`, so it works under any repo name.

## Share links

Every link is `#p=<code>`. The hash is never sent to a server. The codec picks the shortest of
three forms:

| Form | Example | When |
|---|---|---|
| `r1.<recipe>` | `r1.prairie@1.bear-run.variant=fallingwater` | unedited generated palace (~40 chars) |
| `e1.<recipe>.<delta>` | `e1.family@1.oak-river-42.XY6x…` | generated palace plus edits and anchors (a diff by entity id) |
| `d1.<doc>` | `d1.fZFN…` | hand-drawn palaces (full document) |

How a code is built: JSON tuple arrays (integer cm) → `deflate-raw` → base64url.

## The determinism contract (read before touching `src/gen`)

A recipe link only holds `style@version.seed.params`, so a generator must produce the
*bit-identical* palace forever, in every browser.

- **Frozen versions.** `src/gen/<style>/v1` and `src/gen/_lib/v1` are frozen once deployed. To
  change behavior, copy them to `v2`, register `v2` in `src/gen/registry.ts`, and bump `LATEST`.
  Never edit a shipped version.
- **Lint rules for `src/gen/**/v*`:**
  - No `Math.random`, `sin`, `cos`, `pow` or similar. Engines may round these differently, so
    use `_lib/v1/trig.ts` tables.
  - No `Object.keys` iteration.
  - No imports from outside the version folder, `_lib/vN` and `model/schema`.
- **Integer math.** All layout math is integer centimeters. The seeded PRNG is
  cyrb128 → sfc32, with `fork(label)` substreams.
- **Fixtures.** `src/gen/__fixtures__/hashes.json` (144 recipes) and
  `src/share/__fixtures__/links.txt` (real links) fail CI if old palaces change.
  - To record a **new** version's hashes: `UPDATE_GEN_FIXTURES=1 npx vitest run src/gen`.
    Existing entries are never overwritten.

## Layout

```
src/model     PalaceDoc schema (meters rounded to cm), queries, validation, migrations
src/gen       style generators (frozen, versioned) + shared layout lib (treemap, walls, doors, windows, furniture)
src/share     tuple packing, delta, deflate, base64url, link codec
src/geom      data → merged BufferGeometry (walls with openings, floors, roofs, stairs, terrain, water, plants)
src/scene     React Three Fiber scene, cameras (build/explore/walk/tour), build tools
src/editor    zustand store with undo, pure edit commands, snapping, picking
src/journey   room graph, door/stair routing, journey suggestion
src/walk      collision and ground height
src/ui        panels, dialogs, overlays
```

Stack: Vite, React 19, TypeScript, three.js, @react-three/fiber, drei, zustand, immer.
