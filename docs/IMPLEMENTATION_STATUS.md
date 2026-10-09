# Implementation Status

What actually works today, what is a prototype and what is only planned. Every number below
comes from a run in the development container. Nothing here is estimated or invented.

**Build:** 0.4.0 (Milestone 1, the procedural arsenal and bestiary, touch play on phones, and the open procedural world).
**Reference seed:** `reference-valley`.
**Generator version:** 1.

## Status by system

| System | Status | Notes |
| --- | --- | --- |
| Project, scripts, strict TypeScript, production build | **implemented** | `npm run build` is clean |
| Deterministic seeds (namespaced streams, generator version) | **implemented** | unit-tested |
| World plan: valley, castle crag, roads, farm, hamlet, ruin, cottages, walls, props | **implemented** | the opening vale, with exits and side places |
| Open procedural world: endless 1 km regions, gates, A* road network, 8 site kinds, fortune | **implemented** | determinism, gates and validation unit-tested; browser-tested |
| Countryside terrain beyond the vale (lowlands, uplands, ranges with passes), regional forests | **implemented** | no distinct biomes (fen, marches) or water yet |
| Villages (church, inn, houses, lanterns, well), hill keeps, standing stones, shrines, camps | **implemented** | exteriors only |
| Region streaming (worker planning, time-sliced building, per-region colliders and finds, castle landmarks) | **implemented** | browser-tested |
| Discovery banners, region names, the Hollow Atlas map (fog of war), compass | **implemented** | journey-only (no saves) |
| Chests (open, reveal, take) | **implemented** | journey-only |
| Spatial validation (pads, overlaps, roads, doors, spawn, fields, fences, finds, junction heights, area bounds) | **implemented** | 40/40 vales and every tested region pass |
| Terrain streaming (quadtree LOD, skirts, painterly colouring) | **implemented** | the seam test passes |
| Vegetation streaming (7 species × 3 variants × 3 LODs, ground cover, grass, crops) | **implemented** | |
| Web Worker generation pool | **implemented** | falls back to inline generation without workers |
| Pixel pipeline (low-res target, shafts, tone map, grade, ink outlines, dither) | **implemented** | 180/270/360p |
| Sky, clouds, aerial perspective, mist; four light presets | **implemented** | static presets; no day/night cycle yet |
| Buildings, Gothic castle, ruined watchtower, road ribbons, fences, props | **implemented** | exteriors only |
| Character controller and collision world | **implemented** | unit-tested and browser-tested |
| First-person hands and weapon, sway, swing pose | **implemented** | the swing has no hit detection |
| Signs, waystone, place-name banners, interaction prompts | **implemented** | |
| Ambient birds, chimney smoke, motes and leaves | **implemented** | |
| Audio | **prototype** | synthesised placeholder sounds |
| Title, New Journey (seed), loading, intro, pause, settings, credits, F3 debug | **implemented** | no fake buttons; Continue and Load are absent until saves exist |
| Procedural weapons (12 classes, 10 materials, boons/banes, rarity, condition, luck) | **implemented** | stats are generated but not used in combat yet |
| Weapon finds and chests across the world (take/swap, weapon card, place and region luck) | **implemented** | journey-only until saves (M4) |
| Procedural creatures (8 body plans, 16 mutations, 4 tiers, carried weapons) | **prototype** | generator and meshes only, shown in `?gallery`; not in the world, no AI or animation |
| Developer gallery (`?gallery`) | **implemented** | developer tool |
| Phones and tablets (touch controls, lighter preset, mobile metadata) | **implemented** | tested in Chromium phone emulation; not yet tried on a real device |
| Interiors, NPCs, dialogue, trade | **planned** | M2, M7 |
| Atlas story entries, notes, survey viewpoints, inventory, quests | **planned** | M4 |
| Combat (hit detection, block, dodge, enemies in the world) | **planned** | M5 |
| Dungeons, caves, crypts | **planned** | M6 |
| Rivers and lakes; distinct biomes | **planned** | M3 |
| Save and load | **planned** | M4 |

## Test results (latest runs)

| Suite | Command | Result |
| --- | --- | --- |
| Typecheck and build | `npm run build` | clean |
| Unit and generation tests | `npm test` | **59 / 59 passed** (7 files) |
| World validation sweep | `npx vite-node scripts/validate.ts -- 40` | **40 / 40 seeds valid** |
| Browser tests (Chromium, SwiftShader) | `npm run test:e2e` | **8 / 8 passed** in 9.4 min |

Browser test durations:

| Test | Time |
| --- | --- |
| Gallery | 25 s |
| Phone (touch controls) | 1.3 min |
| Open world (village, Atlas, chest) | 1.1 min |
| Title and menus | 1.1 min |
| Journey | 1.2 min |
| Wall collision | 22 s |
| Worker scripts blocked (fallback) | 23 s |
| Streaming travel | 3.5 min |

During the streaming travel test the geometry count went from 350 to 707 (bounded), with 27,710
trees and 1,425 vegetation chunks loaded. No errors were reported.

An earlier version of the streaming browser test walked the whole road and timed out after 8 minutes, because
software rendering runs below 1 FPS. Frame-time measurement moved to the deterministic Node
benchmark, and the browser test now checks correctness only. See [TESTING.md](TESTING.md).

## Performance

| Measure | Value | How measured |
| --- | --- | --- |
| Main-thread streaming cost per travel step | p50 ≈ 3.1 ms, p95 ≈ 7.2–8.0 ms, max ≈ 13–16 ms | `tests/streaming.test.ts`: 328 steps of 6 m along the footpath and the Vale Road. Worker generation time is excluded. |
| Triangles per frame at the spawn vista | ≈ 3.6–3.7 M including the shadow pass | F3 overlay, 1280×720 |
| Draw calls at the spawn vista | ≈ 350 | F3 overlay |
| Region planning (worker or inline) | p50 ≈ 21 ms, p95 ≈ 34 ms, max ≈ 44 ms | 88 regions, reference seed, Node |
| Region structure building (main thread) | 30–90 ms per region, spread over frames at 4 ms per frame | Node measurement; `WorldRuntime.buildBudgetMs` |
| Vale planning at load | ≈ 0.65 s | includes exits and side places |
| Real-GPU frame rate | **not measured** | The container only has software WebGL (about 0.1–3 FPS). Please run on a desktop with F3 and report the numbers. |

## Screenshots

All screenshots are real captures from the production build at 1280×720, made with
`npm run screenshots`. They are in `docs/screenshots/`.

| File | Shows |
| --- | --- |
| `00-title.png` | Title menu over the live vale |
| `01-spawn-vista.png` | Spawn under the ancient tree; valley, road and castle on the horizon |
| `02-forest-edge.png` | Leaving the forest towards the ruined watchtower |
| `03-hamlet-street-castle.png` | Cobbled hamlet street looking towards the castle spires |
| `04-hamlet-cottage.png` | Timber cottage with lit windows and chimney smoke |
| `05-ruined-watchtower.png` | The ruined watchtower |
| `06-farmstead.png` | Farmstead with yard and fields |
| `07-dusk-vista.png` | The spawn vista under the dusk preset |
| `08-view-model.png` | Gloved hand and starter longsword (inspect mode) |
| `09-weapon-find-castle-gate.png` | Blade stuck in the road at the castle gate, with its *Take* prompt |
| `10-weapon-find-waystone.png` | Axe leaning at the waystone, with its *Take* prompt |
| `11-phone-touch-controls.png` | Phone emulation (844×390): stick, Use, Jump, Swing, Weapon and Pause controls with the first touch hint |
| `12-village-street.png` | A procedural village street (cobbles, lanterns, church tower beyond) two regions east of the vale |
| `13-hill-castle.png` | A procedural hill keep on its summit, seen across its cleared slopes |
| `14-standing-stones.png` | A ring of standing stones on a hill |
| `15-camp.png` | An abandoned camp with tents and a traveller's chest |
| `16-atlas.png` | The Hollow Atlas after visiting four places (fog of war, places list) |

In shots 09 and 10 the castle's arrival banner is still on screen. It is the real banner, which
lasts 5 seconds of game time; at software-rendering frame rates it outlasts the capture wait.

## Section 61 acceptance script: step status

| Step | Status |
| --- | --- |
| 1. Title menu | ✅ |
| 2. New Journey, seed entry or randomise | ✅ |
| 3. Finite loading phase without freezes or a blank screen | ✅ progress bar; generation runs in workers |
| 4. Spawn under an ancient tree with hills, road, cottages and the castle in view | ✅ (`01-spawn-vista.png`) |
| 5. Responsive, collision-safe controls; animated gloved hands and sword | ✅ |
| 6. Wooded path with moving foliage, birds and bird sounds | ✅ (synthesised placeholder audio) |
| 7. Emerge into a bright valley resembling reference B | ✅ (`02-forest-edge.png`) |
| 8. Ruined watchtower by road; chest, note, item, survey | ⚠️ **partial**: towers are reachable and climbable, with a weapon or a strongbox; chests open; there is no note or survey yet (M4) |
| 9. Atlas | ⚠️ **partial**: the Atlas map shows explored land and every discovered place; story entries are M4 |
| 10. Creature encounter and combat | ⏳ pending (M5); creatures exist only in the gallery |
| 11. Living hamlet with smoke, an animal and named NPCs | ⚠️ **partial**: varied houses, smoke and birds; no NPCs or animals yet (M2, M7) |
| 12. NPC conversation, rumour, trade | ⏳ pending (M7) |
| 13. Enterable cottage or inn | ⏳ pending (M2) |
| 14. Cobbled street towards enormous Gothic towers (reference A) | ⚠️ **partial**: the hamlet street is cobbled and frames the spires (`03-hamlet-street-castle.png`); the dense town street is M2 |
| 15. Side ruin, cave or crypt with rooms and a secret | ⏳ pending (M6) |
| 16. Reward, puzzle or quest, Atlas update | ⚠️ **partial**: rewards (finds, chests) and Atlas updates on discovery; puzzles and quests are M4/M9 |
| 17. Save, reload, persistence | ⏳ pending (M4) |
| 18. Further procedural terrain with continuity | ✅ endless regions with continuous terrain and roads (tested across borders) and new places to discover; distinct biomes and water are still to come (M3) |

The full vertical slice is therefore **not complete**. Milestone 1 is complete; the open world
(much of M3) and the Atlas map (part of M4) arrived early at the user's request.

## Known blockers

None for Milestone 2. Open issues and limitations are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
