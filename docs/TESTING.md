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
npm test     # all unit tests, then the streaming benchmark on its own (so parallel load cannot skew it)
```

| File | What it proves |
| --- | --- |
| `tests/core.test.ts` | Seed canonicalisation; hash stability and spread; namespaced streams are independent; `Rng` is reproducible and uniform; noise is deterministic and bounded |
| `tests/world.test.ts` | The same seed gives an identical plan; another seed gives a different layout under the same anchor composition; every building has its own recipe; adjacent terrain nodes share exact border heights and normals (**no seams**); buildings sit on their pads; the castle summit is flat and the spawn walkable; roads reach the castle gate and the spawn within grade limits; terrain is graded to the road crown; trees, ground cover and grass scatter **identically whatever the chunk size or load order**; no trees on roads or the castle summit; the spawn sightline stays clear; **full spatial validation passes for 8 seeds** |
| `tests/weapons.test.ts` | Weapons are deterministic; rarity matches the odds (±5σ, including the mythic tail); luck shifts the odds both ways; 5,000 of 5,000 shapes are distinct; stats and names are sane for every class; finite meshes for every class; the starter weapon and finds are deterministic per seed |
| `tests/creatures.test.ts` | Creatures are deterministic; tier odds, including a rare mythic tail; danger scales with tier; champions are named; 4,000 of 4,000 forms are distinct; biome and plan constraints hold; only armed plans carry weapons; finite meshes for every plan and tier |
| `tests/streaming.test.ts` | **Streaming benchmark.** The real terrain and vegetation streamers walk the footpath and the whole Vale Road (328 steps of 6 m, far faster than a player moves). Generation runs inline and is excluded from the timing; in the browser it runs in workers. It asserts main-thread cost per step (replans, uploads, batch rebuilds) of p95 < 12 ms and max < 40 ms (headroom for CPU contention when test files run in parallel). The last run measured p50 3.1 ms, p95 7.2 ms, max 15.8 ms. |
| `tests/openworld.test.ts` | **Open world:**<ul><li>a region plans identically whatever order regions are generated in;</li><li>regions differ between seeds and positions;</li><li>neighbours agree on every border gate (same id, position and opposite normal);</li><li>every gate has a road, and the neighbour's road through it starts at the same point and height;</li><li>spatial validation passes for 32 regions across 3 seeds, with every site kind present;</li><li>region planning median is under 60 ms;</li><li>the vale has ≥ 3 exit roads starting exactly at its gates, and side places;</li><li>terrain is continuous across region borders;</li><li>distant (skeleton) terrain stays within 12 m of the planned surface;</li><li>no trees grow on procedural roads or buildings;</li><li>A* routes go around a hill rather than over it.</li></ul> |
| `tests/interior.test.ts` | The inn: present in the vale hamlet and in procedural villages (with a church); walking in through the doorway puts you inside on its floor; the stair climbs to the loft (> 2.5 m); walls stay solid from inside; the loft chest sits on its floor |
| `tests/villagers.test.ts` | Villagers are planned deterministically with unique ids; the innkeeper stands inside the inn at floor level; street routes never pass through buildings and stay on the road; rumour lines name the place, direction, walking distance and luck |
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
| `e2e/smoke.spec.ts`: worker fallback | With the worker script blocked, the world still loads on the main thread (0 workers, terrain and trees present) without errors |
| `e2e/mobile.spec.ts` | A landscape phone (844×390, touch only, detected rather than forced): the phone quality preset; tap through the menus; the thumbstick walks; a drag turns the view; Jump, Swing, Use (at the signpost), Weapon card and Pause buttons work; Resume returns to play; no errors |
| `e2e/openworld.spec.ts` | **Open world in the browser:**<ul><li>teleport to a procedural village two regions east;</li><li>the region streams in (worker plan, time-sliced build) and the village is discovered (banner);</li><li>**M** opens the Atlas, which lists the village; zoom; **M** closes it;</li><li>at a camp, the chest prompt reads *Open chest*; **E** opens it and shows the weapon card, then *Take* swaps the weapon;</li><li>no errors.</li></ul> |
| `e2e/openworld.spec.ts`: village life | Talk to a hamlet villager: the message quotes a rumour naming a real planned place more than 200 m away; it is listed on the Atlas as a rumour; the inn door opens with **E** |
| `e2e/streaming.spec.ts` | Autopilot walks the footpath and the first 30% of the Vale Road while the workers stream the world. It asserts the vegetation loads, the geometry count stays bounded, the final frame is not blank and there are no errors. It checks correctness only, because headless rendering runs below 1 FPS. |

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

- **Measured (deterministic, Node):** main-thread streaming cost during sustained travel. The
  `tests/streaming.test.ts` benchmark found a 20–30 ms stall per batch rebuild, which led to the
  worker generation pool, time-sliced uploads and integer-indexed rebuilds. Now p50 3.1 ms, p95
  7.2 ms.
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
