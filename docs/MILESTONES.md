# Milestones

The development plan from the brief (Section 60), tracked honestly. Status values:
**complete**, **in progress**, **planned**, **blocked**.

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Beautiful playable first valley | **complete**, awaiting review (see the acceptance table) |
| 2 | Medieval village + castle approach | planned (next) |
| 3 | Deterministic procedural landscape | planned; foundations exist (seeds, world-space terrain, streaming, LOD, validation) |
| 4 | Hollow Atlas and discoveries | planned |
| 5 | Combat vertical slice | planned (sword swing animation only, no hit detection or enemies) |
| 6 | First usable dungeon generator | planned |
| 7 | Inhabited world | planned |
| 8 | RPG and exploration abilities | planned |
| 9 | Regional mysteries and content expansion | planned |
| 10 | Full polish and reliability | planned |

## Milestone 1: Beautiful playable first valley

**Scope (brief):** Vite + TS + Three scene; pixelated renderer; first-person controller with robust
collisions; painterly sky and fog; contiguous low-poly rolling valley; dense but performant foliage;
stone and dirt winding road; coherent small farm and cottages; distant Gothic castle silhouette;
attractive first-person hands and sword; audio; pause and basic settings.

| Item | Result |
| --- | --- |
| Vite + strict TS + Three.js project with documented scripts | ✅ `dev`, `build`, `preview`, `typecheck`, `test`, `test:e2e`, `screenshots` |
| Low-res pixel pipeline (180/270/360p, nearest upscale, dither, grade) | ✅ |
| First-person controller (pointer lock, walk, run, jump, slopes, step-up, collisions) | ✅ unit-tested; browser test confirms the player cannot walk through a cottage wall |
| Painterly sky, clouds, sun, aerial perspective, valley mist, sun shafts | ✅ four light presets |
| Contiguous rolling valley, seamless terrain streaming with LOD | ✅ seam test passes |
| Dense, performant, varied foliage | ✅ 7 tree species × 3 variants × 3 LODs, plus 10 ground-cover kinds |
| Winding road (dirt, cobbled through the hamlet) graded into the terrain | ✅ |
| Coherent farm and cottages | ✅ farmstead with yard and fields; 9-house hamlet; lone cottages with tracks |
| Distant Gothic castle silhouette | ✅ walls, towers, keep, cathedral with a 215–245 m spire; collidable; gate closed |
| First-person hands and sword, walk sway, attack pose | ✅ |
| Audio | ✅ synthesised placeholders (wind, rustle, birds, bell, footsteps, whoosh, UI) |
| Pause and basic settings | ✅ all controls functional and persisted |
| **Acceptance:** walk out of dark trees into a sunlit valley as in reference B | ✅ see `docs/screenshots/01-spawn-vista.png` and `02-forest-edge.png` |
| **Acceptance:** no runtime errors in the browser build | ✅ the browser tests assert an empty error list |
| **Acceptance:** no floating props, no camera clipping | ✅ validation checks pads and footprints; the view model renders in its own pass, so it never clips into walls |
| **Acceptance:** real screenshots | ✅ `docs/screenshots/` |

The scene also includes a few items beyond the M1 scope, kept small: a walkable ruined watchtower
with a climbable broken stair, readable signposts and waystone (E), place-name banners, bird
flocks, chimney smoke and drifting motes and leaves.

## Added at the user's request: procedural arsenal and bestiary foundation

| Item | Result |
| --- | --- |
| Shared heavy-tailed luck model (rarity + condition, luck bias) | ✅ tested against the target odds |
| Weapon genome: 12 classes, continuous shapes, materials, boons/banes, stats, names, lore | ✅ |
| Parametric weapon meshes; equipped in the view model with per-family poses | ✅ |
| Weapon finds in the vale (E to take/swap, I for the weapon card) | ✅ session-only until saves (M4) |
| Creature genome: 8 body plans, mutations, moves, temperament, stats, tiers, carried weapons | ✅ |
| Parametric creature meshes; developer gallery (`?gallery`) | ✅ |
| Creatures in the world, AI and combat | planned (Milestone 5) |

## Milestone 2: Medieval village + castle approach (next)

- A semantic village street and plot system with street-specific dressing: lanterns, signs,
  barrels, ivy, steps.
- Gothic arches and a church with a bell tower.
- One real enterable inn: interior fitted to its exterior footprint, door with hinge animation,
  stairs.
- First residents with simple idle and walk animations, chosen from the character kit.
- Castle approach: gatehouse dressing, a town-street view framing the castle (reference A).
- **Acceptance:** walking down an actual cobbled street looks recognisably like reference A;
  doors, steps and paths have working collisions; at least one inhabited interior.

## Milestones 3–10 (summary)

3. **Deterministic procedural landscape:**
   - region and chunk index, 3 polished biomes, rivers and lakes, regional road graph;
   - worker-based chunk generation, more POI archetypes, validation at region scale.
4. **Hollow Atlas and discoveries:**
   - the Atlas UI, fog-of-war map, surveying from the watchtower;
   - the altar pickup, chest, note, rumours, journal;
   - IndexedDB saves.
5. **Combat:**
   - sword hit detection, block, dodge and stamina;
   - Briarling and one more enemy; impact VFX and SFX.
6. **Dungeons:** a crypt or mine room graph, a puzzle, a secret, and solvability tests.
7. **Inhabited world:** persistent NPC identities, schedules, dialogue, trade, wildlife, road
   encounters.
8. **RPG and exploration:** inventory and equipment visuals, spells including Echo Sight,
   crafting, progression.
9. **Mysteries and content:** more biomes and POIs, multi-site mystery graphs, the Bell-Worn
   Knight.
10. **Full polish and reliability:** animation, art, audio, accessibility, performance and
    browser support.
