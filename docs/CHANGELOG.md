# Changelog

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
