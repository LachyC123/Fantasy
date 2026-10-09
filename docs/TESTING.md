# Testing

> A green build does not prove the game looks good. A beautiful screenshot does not prove
> collision or streaming works. We check both.

## 1. Static checks

```bash
npm run typecheck     # tsc --noEmit, strict mode, no unused locals/params
npm run build         # typecheck + Vite production build
```

## 2. Unit and generation tests (Vitest, Node, no browser)

```bash
npm test
```

| File | What it proves |
| --- | --- |
| `tests/core.test.ts` | Seed canonicalisation; hash stability and spread; namespaced streams are independent; `Rng` is reproducible and uniform; noise is deterministic and bounded |
| `tests/world.test.ts` | The same seed gives an identical plan; another seed gives a different layout under the same anchor composition; every building has its own recipe; adjacent terrain nodes share exact border heights and normals (**no seams**); buildings sit on their pads; the castle summit is flat and the spawn walkable; roads reach the castle gate and the spawn within grade limits; terrain is graded to the road crown; trees, ground cover and grass scatter **identically whatever the chunk size or load order**; no trees on roads or the castle summit; the spawn sightline stays clear; **full spatial validation passes for 8 seeds** |
| `tests/weapons.test.ts` | Weapons are deterministic; rarity matches the odds (±5σ, including the mythic tail); luck shifts the odds both ways; 5,000 of 5,000 shapes are distinct; stats and names are sane for every class; finite meshes for every class; the starter weapon and finds are deterministic per seed |
| `tests/creatures.test.ts` | Creatures are deterministic; tier odds, including a rare mythic tail; danger scales with tier; champions are named; 4,000 of 4,000 forms are distinct; biome and plan constraints hold; only armed plans carry weapons; finite meshes for every plan and tier |
| `tests/controller.test.ts` | Box push-out; walk and sprint speeds; yaw-relative movement; walls block and the player slides along them; step-up onto 0.4 m stones but not 1.1 m blocks; jumping and landing; the steep-slope limit (gentle slopes stay climbable); the reference spawn is grounded and the footpath walkable |

Wider seed sweep (also builds every collider):

```bash
npx vite-node scripts/validate.ts -- 40     # last run: 40/40 seeds valid
```

## 3. Browser tests (Playwright, production build)

```bash
npm run test:e2e
```

The config builds the game, serves it with `vite preview` on port 4173 and runs Chromium. In this
development environment Chromium has **no GPU**: it uses SwiftShader software WebGL at about 1–3
FPS. The browser tests therefore check *behaviour*, not frame rate. Test mode (`?autotest`) skips
the intro and pointer lock and keeps the canvas readable.

| Test | Checks |
| --- | --- |
| `e2e/smoke.spec.ts`: title | The title renders a non-blank frame (mean luminance and colour-count thresholds); Settings change and persist to localStorage; Esc closes panels; Credits opens and closes; no console or page errors |
| `e2e/smoke.spec.ts`: journey | New Journey → Begin reaches gameplay; the real **W** key moves the player; **Space** leaves and regains the ground; a click starts a sword swing; standing at the junction signpost shows the *Read signpost* prompt and **E** shows its text; **Esc** pauses and **Resume** continues; Return to Title works; world validation is clean; no errors |
| `e2e/smoke.spec.ts`: collision | Walking into a hamlet cottage for 4 s never puts the player inside the wall |
| `e2e/gallery.spec.ts` | `?gallery` loads; next, prev, tab and keyboard navigation change the specimen; the frame is not blank; no errors |
| `e2e/streaming.spec.ts` | Autopilot travels the footpath and then the whole Vale Road to the castle gate at a fixed 5 m per frame (deliberate worst case). It asserts world-streaming CPU p95 < 16 ms and max < 120 ms per frame, a bounded geometry count (no leak), arrival at the gate, a non-blank final frame and no errors |

## 4. Visual review

```bash
npm run dev                # in one terminal
npm run screenshots        # captures docs/screenshots/*.png via scripts/views.json
```

`scripts/shoot.mjs` drives the game with the reference seed at 1280×720 and teleports to named
viewpoints: spawn vista, forest edge, hamlet street towards the castle, ruin, farm, dusk, view
model. Each image is reviewed against both references using the checklist in
[ART_DIRECTION.md](ART_DIRECTION.md). Asset close-ups can use the `inspect` view option, which
renders only the view model against a neutral background.

## 5. Performance (honest status)

- **Measured in this environment (software rendering, so not representative):** world-streaming
  CPU cost per frame from the streaming test (see IMPLEMENTATION_STATUS.md for the latest numbers).
  Triangles per frame at the spawn vista are about 3.7 M including the shadow pass, with about 350
  draw calls.
- **Not yet measured:** real FPS on desktop GPUs. Run the game, press **F3** and read *FPS*,
  *frame ms*, *draw calls* and *tris* while walking from the spawn to the hamlet. Please report the
  numbers with your GPU model; they will be added to the status file.
- Budget levers if needed: pixel resolution 180p, shadows off, and the tree LOD distances
  (`VegetationStreamer` options).

## 6. Manual playtest script (Milestone 1)

1. Open the dev URL. The title shows over the living vale.
2. New Journey → Begin. The bell rings, the line fades in, the view wakes under the tree, and the
   region banner appears.
3. Click to explore. Walk the Old Root Path out of the forest, watching the castle silhouette
   framed by trees.
4. Read the waystone (E), then the junction signpost.
5. Enter the ruined watchtower, climb its broken stair and look out over the valley.
6. Follow the Vale Road past the farm to the hamlet (banner, smoke, birds), then on up the
   switchbacks to the castle gate (closed).
7. Esc → Settings: try 180p and Dusk; Resume.
