# Architecture

TypeScript (strict) + Three.js 0.180 + Vite 7. No physics engine: a tested custom capsule
controller over analytic terrain plus oriented-box and cylinder colliders. Vitest covers the pure
modules and Playwright drives the built game in Chromium.

## Module map (`src/`)

```
main.ts                     bootstrap, WebGL2 check, test-hook export
app/
  game.ts                   Game: renderer, lighting, state machine, frame loop, test API
  worldRuntime.ts           WorldRuntime: owns one generated world and its scene graph
  input.ts                  keyboard/mouse, deliberate pointer lock, consumable presses, analog stick axis
  touch.ts                  touch controls (floating stick, drag look, buttons) feeding Input
  device.ts                 touch-device detection (?touch forces it)
  settings.ts               Settings type, defaults, localStorage load/save
  guidance.ts               control hints that advance on performance; place banners
core/
  rng.ts                    seed canonicalisation, hashing, namespaced streams, Rng
  noise.ts                  seeded simplex 2D, fBm, ridged multifractal
  math.ts                   clamp/lerp/smoothstep/damp, segment distance, Catmull-Rom
world/                      (pure data + generation; no WebGL needed)
  types.ts                  WorldPlan, RoadPlan, BuildingPlan, CastlePlan, RuinPlan, Pad…
  macro.ts                  MacroField: anchor valley + wilderness height function
  castle.ts                 planCastle (logical layout)
  roads.ts                  densify, grade (pinned), RoadIndex spatial grid
  plan.ts                   generateWorldPlan, createTerrain
  terrain.ts                Terrain: final height = macro → pads → roads → pads
  geometry2d.ts             oriented-rectangle helpers (SAT overlap, sampling)
  ecology.ts                forest density, species, deterministic scatter
  validation.ts             spatial validation report
  terrainColor.ts           painterly terrain classification → vertex colour
  terrainStreamer.ts        quadtree LOD terrain, skirts, budgeted build queue
  vegetationStreamer.ts     chunked scatter → shared InstancedMesh batches, LODs, colliders
  structures.ts             buildings, ruin, castle, props, fences, road ribbons, ancient tree
  names.ts                  place-name grammars
assets/
  geo.ts                    MeshBuilder: metre-UV boxes, cylinders, tris, per-material batches
  trees.ts                  species grammars → near/mid/far LOD geometry
  plants.ts                 grass, crops, bushes, ferns, flowers, rocks, boulders, logs, mushrooms, stumps
  buildings.ts              building grammar + colliders
  castle.ts                 Gothic castle construction + colliders
rendering/
  atmosphere.ts             lighting presets, shared uniforms, material patch (fog + wind)
  sky.ts                    painterly sky dome with banded dithered clouds
  textures.ts               deterministic pixel-art texture library
  materials.ts              MaterialLibrary (one material per surface family)
  pipeline.ts               PixelPipeline: low-res target, sun shafts, grade/dither/outline pass
player/
  collision.ts              CollisionWorld (grid-indexed boxes/circles + streamed trunks)
  controller.ts             CharacterController (capsule, slopes, step-up, jump)
  viewModel.ts              first-person sword + hands geometry and procedural animation
gameplay/
  luck.ts                   shared rarity/condition model with heavy tails
  weapons.ts                weapon genome (shape, material, affixes, stats, names)
  creatures.ts              creature genome (body plan, mutations, moves, stats, names)
  loot.ts                   starter weapon, weapon finds in the world, swap-on-take
world/ (generation in workers)
  genCore.ts                everything needed to generate data for a seed (no scene objects)
  genWorker.ts              Web Worker answering terrain/vegetation jobs with typed arrays
  genPool.ts                worker pool with priority queue, cancellation, inline fallback (also if workers fail to start)
  vegPack.ts                per-chunk vegetation jobs and instance packing
assets/ (procedural meshes)
  weaponMesh.ts             parametric weapon meshes
  creatureMesh.ts           parametric creature meshes
app/
  gallery.ts                developer gallery of creatures and weapons (?gallery)
ambient/
  birds.ts                  instanced flocks orbiting landmarks
  particles.ts              chimney smoke and ambient motes/leaves (pooled points)
audio/
  audio.ts                  Web Audio synthesised soundscape (placeholders)
ui/
  ui.ts, styles.css         DOM front end (title, panels, HUD, pause, debug)
```

Dependency direction: `core` ← `world` ← `assets`/`rendering` ← `player`/`ambient` ← `app`.
`world/*` generation modules contain no Three.js scene objects (`structures.ts`,
`terrainStreamer.ts` and `vegetationStreamer.ts` are the render-side builders), so plans can be
generated and validated in Node or a worker.

## Frame loop (`Game.frame`)

1. **Time and wind:** update the shared uniforms (`uTime`, `uWind`).
2. **State update:** title drift, intro timeline, or player update. The player update covers mouse
   look, movement through the controller, guidance, footsteps, interaction prompt and the E
   action.
3. **Camera:** eye height with step-up smoothing, head bob and landing dip.
4. **World streaming** (`WorldRuntime.update`), time-budgeted at 5 ms while playing: terrain
   quadtree, vegetation chunks, trunk colliders, birds, smoke, motes. CPU time is recorded for the
   overlay and tests.
5. **Shadows and view model:** the shadow frustum (140 m) follows the camera, snapped to texels.
   The view model takes the sun direction in view space.
6. **Pixel pipeline:**
   - the world renders to a half-float low-res target;
   - depth is cleared and the view model renders into the same target;
   - the sun-shaft pass runs;
   - the final grade/dither/outline pass upscales to the canvas with nearest-neighbour filtering.

## State machine

`boot → title → loading → intro → capture → playing ⇄ paused`, plus `→ title`.

- The reference world is built behind the title screen as a live backdrop.
- **Begin** reuses it if the seed matches, otherwise rebuilds with a progress bar.
- Losing pointer lock, or the window losing focus, pauses the game. Gameplay input is disabled
  under every menu. Esc closes the top panel.

## Streaming lifecycle

- **Terrain:** desired leaves are recomputed when the camera moves more than 12 m. Missing nodes
  are queued nearest-first and smallest-first, and built within the frame budget. The displayed set
  switches only when every node of the new set is ready, so there are never holes. Nodes outside
  the set are evicted once the cache passes twice the working set.
- **Vegetation:**
  - Chunks (64 m) are computed lazily and cached as packed `Float32Array` matrices and colours (a
    full set plus two thinned sets).
  - Whenever the camera enters a new 16 m cell or chunk work completes, the active chunks are
    concatenated into the shared instanced meshes. That is one batch per species × variant × LOD ×
    material, so draw calls stay flat.
  - The chunk cache is bounded at 2,600 chunks.
- **Static structures:** batched per material at load (about 25 draw calls). The castle is always
  present as the long-range landmark.
- **Generation runs in Web Workers** (`GenPool`; one fewer worker than CPU cores, between 1 and 4).
  - Each worker rebuilds the deterministic `GenCore` from the seed and answers jobs (terrain
    nodes, tree, ground and grass chunks) with transferable typed arrays.
  - The main thread only wraps the arrays in geometry and uploads them.
  - Jobs are ranked by size and distance; stale ones are dropped when the camera moves.
  - Without worker support, the same jobs run inline under a time budget.
- Vegetation batches are re-uploaded only when the set of chunks feeding them changes. Each batch
  has a signature, so the upload covers only the used instance range.

## Collision

`CollisionWorld` holds:

- the analytic terrain height;
- static boxes (buildings, walls, fences, ruin segments and steps, props, castle parts) and
  cylinders (towers, the well, haystacks, the ancient tree) in a 16 m grid;
- a replaceable set of streamed trunk cylinders.

`groundAt` returns the highest walkable surface under the capsule within step height, which lets
the player climb the ruin's broken stair. `resolve` pushes the capsule out of obstacles that
overlap its vertical span.

The controller moves in substeps of 0.2 m or less. It slides along walls by removing the velocity
component into the obstacle, refuses terrain steeper than 0.9 rise/run, steps up 0.48 m and snaps
down on descents.

## Test hooks

`window.__hollowAtlas` exposes, among others: state, plan, player, teleport, look, attack,
setSettings, validation, stats, perf, autopilot, frameStats and inspectViewModel. These are used
only by automated tests and the screenshot script; normal gameplay never calls them.
