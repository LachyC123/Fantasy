# World Generation

Everything in a world is a pure function of its **seed** and the **generator version**. Logical
records (the `WorldPlan`) are generated first as plain serialisable data. Meshes are built from
them afterwards and can be thrown away and rebuilt at any time.

## Seeds and random streams (`src/core/rng.ts`)

- `canonicalizeSeed(text)`: trims, lower-cases and hyphenates. An empty seed becomes
  `reference-valley`.
- `deriveSeed(seed, namespace, ...ints)`: a 32-bit stream seed. It hashes
  `"{seed}|{namespace}|v{GENERATOR_VERSION}"` with cyrb53, then mixes in integer keys with
  lowbias32.
- Namespaces in use: `terrain/detail`, `terrain/shape`, `terrain/ridge`, `terrain/warp`,
  `terrain/anchor`, `terrain/colour`, `castle/v1`, `sites/v1`, `farm/v1`, `settlement/v1`,
  `cottages/v1`, `walls/v1`, `ecology/*`, `vegetation/trees`, `vegetation/ground`,
  `ambient/birds`.
- Per-cell scattering uses stateless hashes of `(namespaceSeed, cellX, cellZ, k)`. A placement
  therefore depends only on its world cell, never on chunk size or load order (this is tested).
- `Math.random()` is used only to *suggest* a random seed name in the UI.
- `GENERATOR_VERSION = 1` is stored in every plan for future save compatibility.

Coordinates are metres, Y is up, and north is −Z. The spawn is near the origin and the castle is
about 1.6 km to the north.

## Pipeline (`src/world/plan.ts`)

1. **Macro geography** (`macro.ts`): continuous height in metres from domain-warped simplex fBm.
   The opening region is an authored anchor with seeded variation:
   - the forested southern ridge (spawn);
   - a meandering valley trough with walls rising 95–150 m;
   - the castle crag (84–98 m high, flat summit of radius 100–115 m);
   - hills behind it, and ridged blue mountains beyond about 3.3 km and to the sides.
   Beyond about 5.2 km it blends into generic seeded wilderness, so there is no edge wall.
2. **Castle reservation** (`castle.ts`): position, summit height (sampled average) and a defensive
   layout. This is the gate on the approach side, an irregular curtain-wall ring with towers at the
   vertices, twin gate towers, a keep at the rear, a cathedral hall with a crossing spire, and inner
   towers. The summit becomes a *pre-road pad*.
3. **Roads** (`roads.ts`):
   - Control points are authored relative to the anchor and jittered by seed.
   - They are densified with Catmull-Rom and resampled every 2 m.
   - The profile is sampled from the terrain, box-smoothed and then grade-limited. Grade limits:
     trade road 20%, tracks 25–30%, footpath 30%.
   - The limiter is a forward/backward pass that respects pinned ends and the real sample spacing.
     Pins keep junctions exact: the footpath meets the Vale Road, tracks meet the trade road, and
     the Vale Road meets the castle summit.
   - Roads are graded into the terrain within `halfWidth + blend`.
   - Every road names its two end places (`from` / `to`). The castle approach climbs in
     switchbacks.
4. **Sites:**
   - **Ruined watchtower** beside the junction, with its doorway facing the road.
   - **Farmstead.** The farm track comes first. The farmhouse sits at the back of the yard facing
     the road; the barn and shed flank the yard. Fields are laid out in a loose grid aligned with
     the farm; each is rejected if it touches a road, a building or steep ground. Hedges, fences
     or dry-stone walls run along field edges.
   - **Hamlet** strung along the Vale Road. Plots alternate sides at about 18 m intervals. Each
     building faces the road with a 3–6.5 m setback. Plots are rejected on overlap, road
     intrusion or slope. A well sits on the green and a signpost at the entrance.
   - **Lone cottages** (up to 4), chosen by candidate scoring: they must be 70–260 m from the road
     and away from other sites. Each gets its own track. A cottage is rolled back if its track
     would cross a field, fence, building or ruin.
   - **Roadside dry-stone walls.** Walls break at hairpins, at other roads and near props.
5. **Building grammar** (`assets/buildings.ts`, from each `BuildingPlan`):
   - a foundation plinth sunk 1.5 m into the ground;
   - the ground floor, then a jettied timber upper storey if there are two floors;
   - a door on the road-facing side, and windows per bay (shutters, sills, lintels, flower boxes);
   - a gable roof (two slopes, gable infill, ridge cap and soffits);
   - a chimney, ivy, an optional lean-to;
   - colliders that match the drawn volumes.
   Each building gets its own seed for wall and roof materials, pitch, floors and details.
6. **Pads:** each building gets a rectangular pad (footprint + 1.4 m, 7 m falloff). The ruin and
   the spawn hollow get circular pads. Inside a footprint the pad height is exact. In overlapping
   falloff zones the pads are weight-averaged, so neighbouring houses never tilt each other.
7. **Clearings and sightline:** clearings around sites, plus a *view wedge* from the spawn
   towards the castle. Trees are excluded from a corridor that widens by 0.11 m per metre. This is
   the planned "framed reveal" of reference B.
8. **Validation** (`validation.ts`; see below).

Final height = macro → castle pad → roads → building pads (`terrain.ts`). Each stage is a pure
world-space function.

## Ecology (`ecology.ts`)

- **Forest density** comes from authored masks (the ridge forest with a ragged edge, valley
  copses, forested valley walls, crag woodland, a mountain tree line), reduced by clearings, the
  sightline wedge, building pads, and open verges along the trade road. Footpaths stay enclosed on
  purpose.
- **Species** depend on altitude and a moisture proxy: oak, beech, birch, pine, poplar, willow
  (moist low ground) and dead trees. Pines dominate above 120 m.
- **Placement:** one jittered sample per 6 m cell (trees), 3 m cell (ground cover) or 1.4 m cell
  (grass and crops), kept with probability equal to density. A sample is rejected on roads,
  building footprints, fields (except crops), fences, ruins, props, the castle summit, and slopes
  too steep for its layer.
- **Ground cover** depends on context: ferns, bushes, mushrooms, logs and stumps under forest;
  flowers, rocks and boulders in meadows; wheat and barley inside fields.

## Streaming and LOD (summary; see ARCHITECTURE.md)

- **Terrain:** a quadtree of 64 m–4 km nodes on a fixed 32×32 grid sampled from the world
  function, with skirts, out to 7.2 km. Nodes are swapped in atomically, so the ground never shows
  holes.
- **Vegetation:** deterministic 64 m chunks feed shared instanced meshes.
  - Trees: near < 110 m (full detail), mid < 460 m (≈50 tris), far < 1.3 km (≈25 tris).
  - Far trees are thinned deterministically (42% or 26% kept) and scaled up to preserve canopy
    cover.
  - Ground cover is drawn within 150 m and grass within 70 m.
  - Tree-trunk colliders are generated within 90 m.

## Persistence (current state)

Milestone 1 has **no save system**. Static content rebuilds identically from the seed, which unit
tests verify. Planned save format (Milestone 4): IndexedDB, versioned, storing diffs keyed by
stable ids such as `{seed}/{settlementId}/b{index}` and `{seed}/prop/...`. Whole scenes will
never be serialised.

## Validation (`validation.ts`)

This runs at load time (results appear in the F3 overlay) and in the unit tests across many seeds.
It checks that:

- every building footprint is within 0.35 m of its pad (no floating or buried houses);
- no building corner sits on a road, no buildings overlap, and no fence crosses a building;
- the ground in front of every door is level with it and free of colliders;
- roads are continuous, within their grade limits, and name real places at both ends;
- side tracks join another road, the footpath meets the Vale Road and starts at the spawn, and the
  Vale Road reaches the castle gate;
- the spawn is on walkable ground and inside no collider;
- no field lies on a road and no fence crosses a road;
- the castle summit pad is applied and the gate is level with the summit.

`npx vite-node scripts/validate.ts -- 40` validates 40 seeds. The latest run passed 40/40.

## Debug tools

- `npx vite-node scripts/worldmap.ts -- <seed> <out.ppm> [extent] [centreZ]` renders a hillshaded
  top-down map with roads, buildings, fields, props, ruin, castle and spawn.
- In-game F3 overlay: seed, generator version, position, streaming queues, collider counts,
  validation status and load timings.
