# Implementation Status

What actually works today, what is a prototype and what is only planned. Every number below
comes from a run in the development container. Nothing here is estimated or invented.

**Build:** 0.6.0 (Milestone 1, the procedural arsenal and bestiary, touch play on phones, the open procedural world, living villages with enterable inns, and journey saves).
**Reference seed:** `reference-valley`.
**Generator version:** 1.

## Status by system

| System | Status | Notes |
| --- | --- | --- |
| Project, scripts, strict TypeScript, production build | **implemented** | `npm run build` is clean |
| Deterministic seeds (namespaced streams, generator version) | **implemented** | unit-tested |
| World plan: valley, castle crag, roads, farm, hamlet, ruin, cottages, walls, props | **implemented** | the opening vale, with exits and side places |
| Per-seed vale layout (heading, mirroring, proportions, castle offset, hamlet/farm placement and size, cottage count, name, starting weapon) | **implemented** | `reference-valley` keeps the authored layout |
| Open procedural world: endless 1 km regions, gates, A* road network, 8 site kinds, fortune | **implemented** | determinism, gates and validation unit-tested; browser-tested |
| Countryside terrain beyond the vale (lowlands, uplands, ranges with passes), regional forests | **implemented** | no distinct biomes (fen, marches) or water yet |
| Villages (church, inn, houses, lanterns, well), hill keeps, standing stones, shrines, camps | **implemented** | exteriors only |
| Region streaming (worker planning, time-sliced building, per-region colliders and finds, castle landmarks) | **implemented** | browser-tested |
| Discovery banners, region names, the Hollow Atlas map (fog of war), compass | **implemented** | journey-only (no saves) |
| Chests (open, reveal, take) | **implemented** | journey-only |
| Enterable inns (doorway, hinged door, taproom, stairs, loft, interior light) | **implemented** | unit-tested walk-in and stair climb; browser-tested door |
| Villagers (innkeeper, priest, strollers, farmers; looks; walk/idle animation) | **implemented** | no collider, schedules or trade yet |
| Talk and rumours of real undiscovered places (Atlas and compass marks) | **implemented** | unit- and browser-tested |
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
| Other interiors (houses, churches, castles), NPC schedules, dialogue trees, trade, animals | **planned** | M7 and later |
| Atlas story entries, notes, survey viewpoints, inventory, quests | **planned** | M4 |
| Combat (hit detection, block, dodge, enemies in the world) | **planned** | M5 |
| Dungeons, caves, crypts | **planned** | M6 |
| Rivers and lakes; distinct biomes | **planned** | M3 |
| Journey saves (autosave, Continue Journey) | **implemented** | one slot, `localStorage`; browser-tested reload and continue |

## Test results (latest runs)

| Suite | Command | Result |
| --- | --- | --- |
| Typecheck and build | `npm run build` | clean |
| Unit and generation tests | `npm test` | **69 / 69 passed** (9 files; the streaming benchmark runs last, on its own: p50 3.0 ms, p95 7.4 ms, max 10.6 ms) |
| World validation sweep | `npx vite-node scripts/validate.ts -- 40` | **40 / 40 seeds valid** |
| Browser tests (Chromium, SwiftShader) | `npm run test:e2e` | **10 / 10 passed** in 11.2 min |

Browser test durations (latest full run):

| Test | Time |
| --- | --- |
| Gallery | 24 s |
| Phone (touch controls) | 1.2 min |
| Open world (village, Atlas, chest) | 56 s |
| Village life (rumour, Atlas, inn door) | 52 s |
| Saves (reload and continue) | 57 s |
| Title and menus | 1.1 min |
| Journey | 1.1 min |
| Wall collision | 22 s |
| Worker scripts blocked (fallback) | 21 s |
| Streaming travel | 3.4 min |

During the streaming travel test the geometry count went from 339 to 730 (bounded), with 27,696
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
| `17-inn-door.png` | The vale hamlet's inn with its door open |
| `18-inn-taproom.png` | Inside the taproom: hearth, counter and the innkeeper turning to greet you |
| `19-inn-loft.png` | The loft: beds, the chimney stack, the roof timbers |
| `20-villager.png` | A villager strolling the hamlet's cobbled street towards the castle |
| `21-seed-gloam-vista.png` | Seed `gloam`: the vale turned to face west, an axe as the starting weapon |
| `22-seed-3-vista.png` | Seed `seed-3`: the vale turned and mirrored to face east, a curved blade to start |

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
| 11. Living hamlet with smoke, an animal and named NPCs | ⚠️ **partial**: varied houses, smoke, birds and named villagers with walk/idle animation; no animals yet (M7) |
| 12. NPC conversation, rumour, trade | ⚠️ **partial**: talk to villagers for geographically valid rumours (real places, direction, walking distance) that mark the Atlas; no trade yet (M7) |
| 13. Enterable cottage or inn | ✅ inns: doorway with a hinged door, taproom, stairs to a loft, working collisions (unit- and browser-tested) |
| 14. Cobbled street towards enormous Gothic towers (reference A) | ⚠️ **partial**: the hamlet street is cobbled and frames the spires (`03-hamlet-street-castle.png`); the dense town street is M2 |
| 15. Side ruin, cave or crypt with rooms and a secret | ⏳ pending (M6) |
| 16. Reward, puzzle or quest, Atlas update | ⚠️ **partial**: rewards (finds, chests) and Atlas updates on discovery; puzzles and quests are M4/M9 |
| 17. Save, reload, persistence | ✅ autosave and Continue Journey restore position, weapon (inventory), swapped finds, opened chests, open doors, discoveries, rumours and explored map; villagers are the same people (deterministic). There are no quests yet to persist |
| 18. Further procedural terrain with continuity | ✅ endless regions with continuous terrain and roads (tested across borders) and new places to discover; distinct biomes and water are still to come (M3) |

The full vertical slice is therefore **not complete**. Milestone 1 is complete; the open world
(much of M3) and the Atlas map (part of M4) arrived early at the user's request.

## Known blockers

None for Milestone 2. Open issues and limitations are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
