# Changelog

## 0.5.0: Villages come alive (Milestone 2 progress)

**Added**
- Enterable inns, in every procedural village and in the vale's hamlet:
  - real walls with a doorway, and a hinged door that swings inward (**E**: Open / Close door);
  - a taproom with a hearth, a counter with barrels, tables and benches;
  - a stair to a loft with beds, a railed stair well, and a guest's chest;
  - a warm interior light while you're inside.
- Villagers:
  - an innkeeper behind the counter, a priest at the church porch, residents strolling the
    streets, farmers in their yards;
  - generated names, trades and looks (height, build, colours, hats, aprons, beards);
  - walk and idle animation; they turn to face you, and stop rather than walk into you.
- **Talk** (**E**): villagers greet you and pass on a rumour of a real place within about 3 km
  that you haven't found yet, with its direction, a distance in walking time, and how the luck
  runs there. Rumoured places appear on the Atlas (dashed ring, "?") and as hollow marks on the
  compass until you find them.
- Tests:
  - unit tests for the interior (walk in through the doorway, climb to the loft, solid walls) and
    for villagers (deterministic plans, the innkeeper inside the inn, routes on streets, rumour
    wording);
  - a browser test of village life (rumour → Atlas → open the inn door).

**Changed**
- No grass grows through floors.
- `npm test` runs the streaming benchmark on its own after the other test files, so parallel
  load cannot disturb its timing.

## 0.4.0: An open, procedural world to explore

**Added**
- The world beyond the vale is endless and procedural: 1 km regions planned from the seed alone, in
  any order, on any thread. Each has a name, a fortune (a luck shift) and its own places.
- Places:
  - villages (stone church with bell tower and spire, inn with a hanging sign, houses, lanterns,
    well, cobbled streets, a chest behind the inn);
  - farmsteads with fields, and cottages;
  - ruined watchtowers;
  - hill keeps and great castles on summits;
  - standing stones, wayside shrines, abandoned camps with chests;
  - crossroads waystones.
- Roads branch between regions through border gates both neighbours agree on. They are routed
  around steep ground by A*, always join at T-junctions, and signposts name destinations with
  compass directions. About a third of minor places are left off the roads.
- The vale opens onto the world: exit roads through its border, and side places on its hills.
- Chests open with a swinging lid to reveal a weapon. Luck depends on the region and the place.
  Stone rings and camps roll wild; castle gates are generous.
- Discovery banners for every kind of place, and region names as you cross into them.
- The Hollow Atlas (**M**, the touch **Map** button, the pause menu): a parchment map with fog of
  war, hill-shaded relief, forests, known roads, region names and every place found, with zoom.
- A compass ribbon: cardinal points, places you've found, and hollow marks when something
  undiscovered is close.
- New Journey suggests a random world every time (type a seed to revisit one).
- Countryside terrain: lowlands, uplands and mountain ranges with passes; a range north of the
  vale keeps the opening vista; regional forests (pine country, birch heaths).
- Streaming:
  - regions are planned in workers and raised over several frames (4 ms per frame);
  - colliders, finds, chests and readable things load and unload per region;
  - castles are visible as landmarks from up to 5 km;
  - distant terrain is shaped from region skeletons.
- Tests: 12 open-world unit tests, an open-world browser test, and a region screenshot set.

**Changed**
- Validation is shared by every area: roads must meet at the same height and stay in their area.
  Walls and hedges open where roads pass.
- The castle planner builds great castles or hill keeps on any summit.
- Smoke follows the nearest chimneys among all loaded regions.

## 0.3.0: Play on phones and tablets

**Added**
- Touch controls, detected automatically:
  - a floating thumbstick on the left (push to the edge to run);
  - drag to look;
  - Swing, Jump, Use (appears when something is in reach), Weapon and Pause buttons;
  - prompts can be tapped.
- Touch-specific hints, capture text and controls list.
- A *View distance* setting (short / medium / long vegetation ranges), applied without reloading.
  Phones start with shadows off and a short view distance.
- Mobile web-app metadata: viewport, safe areas, manifest and home-screen icons. Full screen and
  landscape lock where the browser allows it.
- `scripts/artifact.mjs` to publish the static build on hosts that wrap pages in their own skeleton.
- Tests: a phone-emulation browser test (touch menus, stick walk, drag look, jump, swing, use,
  weapon card, pause and resume) and a test that the world loads with worker scripts blocked.

**Fixed**
- If generation workers failed to start (a blocked script, or no module-worker support), loading
  waited forever. The pool now falls back to main-thread generation, and loading waits correctly
  across the switch.
- Render targets fall back to 8-bit on GPUs that cannot render to half-float.
- Menus scroll on short landscape screens instead of being cut off.

## 0.2.0: Procedural arsenal and bestiary foundation

**Added**
- Shared luck model: rarity odds from common (62%) to mythic (1 in 2,000), a fat-tailed craft
  condition from ruined to flawless, a luck bias, and cursed rolls.
- Weapon genome and parametric meshes: 12 classes, 10 materials, 16 boons, 6 banes, derived
  stats, names, titles and lore.
- A seeded starting weapon and five story-placed finds with local luck. E swaps (nothing is lost);
  I shows the weapon card; rarity glints mark finds.
- Creature genome and parametric meshes: 8 body plans, 16 mutations, 4 threat tiers, moves,
  temperament, stats and carried weapons.
- Developer gallery (`?gallery`) for browsing unlimited specimens with a luck slider.
- World generation moved to a Web Worker pool, and vegetation batches upload only on change.
- Tests: weapon and creature determinism, odds, variety, meshes, finds and reachability; a gallery
  browser test.

## 0.1.0: Milestone 1, "Beautiful playable first valley"

**Added**
- Project: Vite 7 + strict TypeScript + Three.js 0.180; Vitest and Playwright; documented scripts.
- Deterministic seeding (namespaced streams, generator version) and seeded simplex noise.
- World plan for *The Vale of Unwritten Days*:
  - anchor valley macro terrain;
  - castle crag and Gothic castle layout;
  - graded roads with pinned junctions and switchbacks;
  - ruined watchtower, farmstead with fields and boundaries, a 9-building hamlet, lone cottages
    with tracks, roadside dry-stone walls, props, clearings and a spawn sightline wedge.
- Spatial validation of the plan (pads, overlaps, roads, doors, spawn, fields, fences, castle).
- Quadtree terrain streaming with skirts, painterly vertex-colour classification and a pixel
  detail texture.
- Vegetation streaming: 7 tree species × 3 variants × 3 LODs, distance thinning, ground cover,
  grass and crops, trunk colliders.
- Architecture kit (building grammar, castle builder), props, boundaries, road ribbons with ragged
  edges and a cobbled hamlet street.
- Pixel pipeline: low-res half-float target, sun shafts, tone map, split grade, ink outlines and
  ordered-dither posterisation.
- Painterly sky with banded dithered clouds; four light presets.
- Character controller and collision world; first-person longsword and gloved hands with
  procedural animation.
- Bird flocks, chimney smoke, motes and leaves; synthesised soundscape.
- Front end: title over the live world, New Journey with seed entry, loading progress, intro card,
  click-to-explore, HUD hints and banners, readable signs, pause, persisted settings, credits and
  an F3 debug overlay.

**Fixed during the milestone (found by tests, validation and screenshots)**
- Neighbouring building pads tilted each other's footprints. Pads are now exact inside their
  footprint and weight-averaged in overlaps.
- The road grade limiter assumed uniform sample spacing, producing a steep final segment.
- The farm track was planned after the fields, so it crossed them.
- Roadside walls crossed the road at switchback hairpins.
- Vegetation scatter depended on chunk size (6 m cells vs 64 m chunks).
- About 24 M triangles per frame: fixed with three tree LODs and distance thinning (now about
  3.7 M at the spawn, including shadows).
- A height-fog singularity drew a dark line along the horizon.
- Haze hid the castle; the sword pose covered the screen centre; the FPS readout was clamped.
