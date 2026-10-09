# Implementation Status

What actually works today, what is a prototype and what is only planned. Every number below
comes from a run in the development container. Nothing here is estimated or invented.

**Build:** 0.3.0 (Milestone 1, the procedural arsenal and bestiary foundation, and touch play on phones).
**Reference seed:** `reference-valley`.
**Generator version:** 1.

## Status by system

| System | Status | Notes |
| --- | --- | --- |
| Project, scripts, strict TypeScript, production build | **implemented** | `npm run build` is clean |
| Deterministic seeds (namespaced streams, generator version) | **implemented** | unit-tested |
| World plan: valley, castle crag, roads, farm, hamlet, ruin, cottages, walls, props | **implemented** | the first valley only |
| Spatial validation (pads, overlaps, roads, doors, spawn, fields, fences, finds) | **implemented** | 40/40 seeds pass |
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
| Weapon finds in the vale (take/swap, weapon card) | **implemented** | session-only until saves (M4) |
| Procedural creatures (8 body plans, 16 mutations, 4 tiers, carried weapons) | **prototype** | generator and meshes only, shown in `?gallery`; not in the world, no AI or animation |
| Developer gallery (`?gallery`) | **implemented** | developer tool |
| Phones and tablets (touch controls, lighter preset, mobile metadata) | **implemented** | tested in Chromium phone emulation; not yet tried on a real device |
| Interiors, NPCs, dialogue, trade | **planned** | M2, M7 |
| Atlas, chests, notes, inventory, quests | **planned** | M4 |
| Combat (hit detection, block, dodge, enemies in the world) | **planned** | M5 |
| Dungeons, caves, crypts | **planned** | M6 |
| Rivers and lakes; regional world beyond the vale | **planned** | M3 |
| Save and load | **planned** | M4 |

## Test results (latest runs)

| Suite | Command | Result |
| --- | --- | --- |
| Typecheck and build | `npm run build` | clean |
| Unit and generation tests | `npm test` | **47 / 47 passed** (6 files) |
| World validation sweep | `npx vite-node scripts/validate.ts -- 40` | **40 / 40 seeds valid** |
| Browser tests (Chromium, SwiftShader) | `npm run test:e2e` | **7 / 7 passed** in 8.2 min |

Browser test durations:

| Test | Time |
| --- | --- |
| Gallery | 22 s |
| Phone (touch controls) | 1.2 min |
| Title and menus | 56 s |
| Journey | 57 s |
| Wall collision | 27 s |
| Worker scripts blocked (fallback) | 25 s |
| Streaming travel | 3.9 min |

During the streaming travel test the geometry count went from 288 to 586 (bounded), with 29,244
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
| 8. Ruined watchtower by road; chest, note, item, survey | ⚠️ **partial**: the tower is reachable and climbable, and a weapon find lies there; there is no chest, note or survey yet (M4) |
| 9. Atlas | ⏳ pending (M4) |
| 10. Creature encounter and combat | ⏳ pending (M5); creatures exist only in the gallery |
| 11. Living hamlet with smoke, an animal and named NPCs | ⚠️ **partial**: varied houses, smoke and birds; no NPCs or animals yet (M2, M7) |
| 12. NPC conversation, rumour, trade | ⏳ pending (M7) |
| 13. Enterable cottage or inn | ⏳ pending (M2) |
| 14. Cobbled street towards enormous Gothic towers (reference A) | ⚠️ **partial**: the hamlet street is cobbled and frames the spires (`03-hamlet-street-castle.png`); the dense town street is M2 |
| 15. Side ruin, cave or crypt with rooms and a secret | ⏳ pending (M6) |
| 16. Reward, puzzle or quest, Atlas update | ⏳ pending (M4, M9) |
| 17. Save, reload, persistence | ⏳ pending (M4) |
| 18. Further procedural terrain with continuity | ⚠️ **partial**: terrain and forest continue seamlessly beyond the vale; there are no new sites there yet (M3) |

The full vertical slice is therefore **not complete**. Milestone 1 is complete and awaiting
review.

## Known blockers

None for Milestone 2. Open issues and limitations are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
