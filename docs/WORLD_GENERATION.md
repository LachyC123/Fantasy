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

The world has two layers:

- **The opening vale**: an authored composition with seeded variation (the first 4 × 3 km).
- **The open world** around it: an endless grid of 1 km procedural regions. Each region is planned
  from `(seed, rx, rz)` alone, so it does not matter which region is generated first, or on which
  thread. There is no path to follow; roads branch in every direction, and some places sit off
  every road.

## The vale (`src/world/plan.ts`)

1. **Macro geography** (`macro.ts`): continuous height in metres from domain-warped simplex fBm.
   The opening region is an authored anchor with seeded variation:
   - the forested southern ridge (spawn);
   - a meandering valley trough with walls rising 95–150 m;
   - the castle crag (84–98 m high, flat summit of radius 100–115 m);
   - hills behind it.
   An elliptical anchor weight blends the vale into the open countryside (`wildHeight`): broad
   lowlands and uplands, rolling hills, and sparse ridged mountain ranges with low passes where the
   range mask dips. A range is placed deliberately 3–8 km north of the vale, so the opening vista
   always has blue mountains on the horizon.
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
8. **Exits and side places:**
   - The vale owns cells x −2…1, z −2…0 of the region grid.
   - Every gate on its border gets a trade road, routed to the Vale Road network.
   - Up to seven side places (towers, stone rings, shrines, camps, a cottage) are scattered on its
     outer hills, away from the authored core; about 60% get a footpath.
   - Walls and hedges are opened wherever a road passes through them.
9. **Validation** (`validation.ts`; see below).

## The open world (`regions.ts`, `regionPlan.ts`, `sitegen.ts`, `contentBuilder.ts`)

**Region grid.** Cells are 1024 m squares. A region is planned in two stages.

1. **Skeleton** (`regionSkeleton`, ~1 ms, macro heights only):
   - **Name:** for example "the Ashen Downs".
   - **Fortune:** a Gaussian luck shift of ±2.5, nudged upward with distance from the spawn. It
     biases every roll in the region.
   - **Gates:** see below.
   - **Sites:** chosen from an 8 × 8 jittered candidate grid scored by slope, height and
     prominence, with minimum spacing. Probabilities per region:

     | Site | Chance | Placement |
     | --- | --- | --- |
     | Castle | 16% | Prominent summit. 22% of these are great castles with a cathedral; the rest are hill keeps |
     | Village | 55% | |
     | Farmsteads | 0–2 | |
     | Ruined watchtower | 50% | |
     | Standing stones | 32% | |
     | Wayside shrine | 38% | |
     | Abandoned camp | 34% | |
     | Lone cottages | 0–2 | |

   - **Castle layouts** (`planCastleAt`).
   Distant terrain needs only the skeleton (castle summits), so the horizon never waits for
   planning.
2. **Full plan** (`planRegion`, ~20–35 ms):
   - **Network root:** a village street, or a crossroads hub with a waystone.
   - **Joins:** gates and castle approaches join the network nearest-first.
   - **Minor sites:** each gets a footpath with 65% probability; the rest are left for wanderers.
   - **Population:** each site is filled in by its generator.
   - **Signposts:** placed where side roads join, naming the destination and its compass
     direction.
   - **Finish:** buildings are seated and pads emitted.

**Gates** (`cellGates`). A road crosses a border only at a gate, which is a pure function of the
edge.

- 13 candidates along the middle of the edge are scored by local slope, with a small hash jitter.
  The gentlest one wins.
- Edges open with 72% probability, or 50% on the vale border, where the gentlest edge of each
  side is always open. Edges steeper than 0.28 never open.
- Both regions compute the same gate, and enter it straight along its normal for 30 m, pinned to
  the same height. Their roads therefore meet exactly across the border; a unit test checks
  this.

**Road routing** (`pathfind.ts`, `ContentBuilder.route`):

- **Search:** Dijkstra on a 16 m grid with 8 neighbours. Cost rises with terrain grade (strongly
  above 80% of the road's grade limit). Reserved ground costs infinity: other sites, buildings
  (+6 m), fields, fences, ruins and castle summits. The 40 m border margin costs 4×.
- **Goal:** the search ends at the first node that touches the existing network, so new roads
  always make T-junctions and never cross.
- **Junction height:** joins are allowed only where the network road runs within 2.5 m of natural
  ground, so there is never a step onto an embankment.
- **Geometry:** the path is simplified (RDP), turned into Catmull-Rom control points (border-hugging
  points dropped) and graded with pinned ends.
- **Checks:** a road is rejected and re-routed (up to 3 tries, avoiding the failed junction) if it
  misses a pin by more than 0.4 m, leaves its area, or brushes a building.

**Site generators** (`sitegen.ts`):

- **Village:**
  - the church and inn take the plots nearest the centre;
  - 7–13 houses line every street within 88 m, nearest plots first;
  - lanterns alternate along the street, with a well on the green;
  - a lost-and-found chest stands behind the inn;
  - signs mark where streets leave the village.
- **Farmstead:**
  - the track is routed first, then the farmhouse, barn and shed are set around the yard;
  - fields with hedges, fences or walls;
  - sometimes a tool-weapon leans on the barn;
  - if no building fits, the track is removed again.
- **Cottage:** a house, a track if a road is near, and a woodpile. Sometimes an axe is left in the
  chopping block.
- **Ruined watchtower:** a broken climbable tower with a weapon in the rubble, or a strongbox.
- **Castle:** a hill keep or great castle, with a road up to the gate and a weapon driven into the
  earth before it (+1.4 luck).
- **Standing stones:** a ring of 7–12 stones, some fallen. A weapon lies at the heart; its luck is
  the region's fortune ± a wide Gaussian, so the old magic cuts both ways.
- **Wayside shrine:** a saint in a niche, candles, and often an offering (+0.8 luck).
- **Abandoned camp:** tents round a fire, a woodpile, and a traveller's chest (luck = fortune ±
  1.3 σ).

**Area content** (`WorldContent`) carries castles, ruins, settlements, buildings, roads, fields,
fences, pads, pre-road pads, clearings, props, finds, sites and gates. The vale (`WorldPlan`) adds
the spawn, the ancient tree and the sightline.

## World queries (`worldIndex.ts`)

- **`WorldIndex`** owns the vale plus a least-recently-used cache of planned regions (72 by
  default). Regions are planned on demand on any thread, or adopted from a worker; the result is
  identical either way. `areasNear(x, z)` returns the area owning the point, plus neighbours
  within 24 m of a border.
- **`WorldTerrain`** answers height, normal and road queries across the whole world: macro →
  summit pads → the nearest areas' roads → building pads.
- **`heightFar`** (macro plus skeleton castle summits) shapes terrain nodes larger than 512 m
  outside the vale. A unit test bounds the difference from the planned surface.

Final height = macro → castle pad → roads → building pads (`terrain.ts`). Each stage is a pure
world-space function.

## Ecology (`ecology.ts`)

- **Forest density, inside the vale:** authored masks (the ridge forest with a ragged edge,
  valley copses, forested valley walls, crag woodland).
- **Forest density, in the open world:** great woods (1.1 km noise) and copses, thinner on high
  moors.
- **Everywhere:** a mountain tree line, then reductions from every nearby area's clearings, the
  sightline wedge, building pads, and open verges along trade roads. Footpaths stay enclosed on
  purpose.
- **Species** depend on altitude and a moisture proxy: oak, beech, birch, pine, poplar, willow
  (moist low ground) and dead trees. Pines dominate above 120 m. Beyond the vale a 3.6 km
  regional character mixes in pine country (60% pine) and birch heaths (50% birch).
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

## Region streaming (summary; see ARCHITECTURE.md)

- **Planning:** regions within 1.15 km of the player are planned in workers (or inline as a
  fallback) and adopted.
- **Building:** their structures are raised over several frames under a 4 ms per-frame budget.
  Colliders, finds, chests and readable signs are added per region and removed together beyond
  1.7 km.
- **Landmarks:** castles within 5.2 km are built from skeletons as soon as they could be seen.

## Persistence (current state)

There is **no save system** yet. Static content rebuilds identically from the seed, which unit
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
- roads stay inside their area (gates lie exactly on the border) and every road that ends or
  starts on another road actually meets it, at the same height (< 0.6 m);
- the vale's footpath meets the Vale Road and starts at the spawn, the Vale Road reaches the castle
  gate, and the vale has at least one road out to the wider world;
- the spawn is on walkable ground and inside no collider;
- no field lies on a road and no fence crosses a road;
- every castle summit pad is applied and every gate is level with its summit;
- every site lies inside its area.

`validateContent` runs these shared checks on any area. `validateWorld` adds the vale's promises.
The unit tests validate the vale for 8 seeds and 32 regions across 3 seeds. A development sweep
covered 360 regions across 6 seeds with 0 issues. `npx vite-node scripts/validate.ts -- 40`
validates 40 vales.

## Debug tools

- `npx vite-node scripts/macromap.ts -- <seed> <out.ppm> [extent] [centreX] [centreZ]` renders the
  macro height field over many kilometres, with the 1 km region grid.
- `npx vite-node scripts/worldmap.ts -- <seed> <out.ppm> [extent] [centreZ]` renders a hillshaded
  top-down map with roads, buildings, fields, props, ruin, castle and spawn.
- In-game F3 overlay: seed, generator version, position, streaming queues, collider counts,
  validation status and load timings.
