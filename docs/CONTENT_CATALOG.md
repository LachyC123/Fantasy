# Content Catalog

Only content that **actually exists in the code** is listed. Everything is generated procedurally.

## Regions and biomes

| Name | Status |
| --- | --- |
| The Vale of Unwritten Days (opening anchor region) | Implemented: forested ridge, valley meadows, copses, the castle crag, hills, blue mountains. Its palette follows the brief's *Golden Weald*. |
| Generic wilderness beyond about 5 km | Prototype: seeded hills and mountains with trees; no sites yet |
| Other biomes (Weeping Fen, Violet Marches, …) | Planned (Milestone 3+) |

## Sites

| Site | Details |
| --- | --- |
| Ancient tree and spawn hollow | A unique colossal oak (about 26 m) with buttress roots in a levelled clearing; collidable |
| Ruined watchtower | Broken round tower with a road-facing breach, a climbable broken spiral stair (7 steps), rubble, ivy, a low enclosure wall to stand on. Enterable. Name from a grammar (e.g. *Warden's Tower*) |
| Farmstead | Farmhouse, barn and shed around a yard; haystacks, cart, woodpile; 6–11 fields (wheat, barley, fallow, cabbage) with hedges, fences or dry-stone walls; farm track |
| Hamlet | 6–9 buildings along the Vale Road (cottages and longhouses), well, signpost, barrels, woodpiles, cobbled street |
| Lone cottages | Up to 4, each with its own track, named for a family (e.g. *Hale's Cottage*) |
| Great castle | Curtain wall (7–9 sides) with towers, gatehouse and closed portcullis, keep with corner turrets, cathedral hall (buttresses, pinnacles, lancet windows, rose window, west towers, crossing tower and spire), inner towers and buildings. Name from a grammar (e.g. *the Spires of Sablecrest*). Exterior only in M1 |

## Roads

The Vale Road (trade road; dirt, cobbled through the hamlet; switchbacks to the castle gate), the
Old Root Path (forest footpath from the spawn to the junction), the farm track and the cottage
tracks.

## Architecture kit (`assets/buildings.ts`, `assets/castle.ts`, `world/structures.ts`)

- **Building parts:** stone plinth, stone, plaster or plank walls, quoins, timber framing (posts,
  rails, braces), jettied upper storey with visible joists, plank doors with frames, latch and
  step stone, windows with sill and lintel, shutters (4 colours), lit windows on inhabited houses,
  flower boxes.
- **Roofs and extras:** gable roofs in clay tile, slate or thatch with ridge cap, soffits and gable
  infill (king post on plaster gables); chimneys with caps; ivy; lean-tos.
- **Castle parts:** battered plinths, crenellated curtain walls, round and square towers,
  machicolation bands, slit windows, spires with gilded finials, crowns, pinnacles, Gothic lancet
  windows, rose window, buttresses, gatehouse arch, portcullis, heraldic banners, hipped keep roof.
- **Props:** well, haystack, cart, barrel, signpost, waystone (carved ring), woodpile, bench (the
  bench builder exists but is not placed yet).
- **Boundaries:** wooden fence, dry-stone wall, hedge.

## Nature kit (`assets/trees.ts`, `assets/plants.ts`)

| Species | Silhouette grammar | LODs |
| --- | --- | --- |
| Oak | Short thick trunk, 4–6 spreading limbs, broad clumped crown | near / mid / far |
| Beech | Taller trunk, domed dense crown | near / mid / far |
| Birch | Slender white trunk, airy clumps climbing the trunk | near / mid / far |
| Pine | Straight trunk, 7–9 drooping saw-toothed skirt tiers | near / mid / far |
| Poplar | Columnar stacked crown | near / mid / far |
| Willow | Leaning trunk, dome crown and hanging curtains | near / mid / far |
| Dead tree | Bare forking branches | near / mid / far |
| Ancient oak | Colossal unique tree with buttress roots | single (spawn) |

There are 3 seeded variants per species. Ground cover: grass tufts, wheat and barley, bushes
(plain, white blossom, red berries), ferns, flower clusters (5 colours), rocks, boulders, fallen
logs, mushrooms and stumps.

## First-person kit

- **Longsword:** lozenge-section blade with a fuller, ricasso, up-swept cross-guard with gilded
  finials, diamond langet, wrapped grip, wheel pommel.
- **Gloved hands:** right fist and relaxed left hand, with cuff, tooled vambrace, rivet and sleeve.
- **Animation:** idle breathing, stride-locked bob, sprint carry, look inertia, landing dip, and a
  windup → slash → recovery swing.

## Living-world details

- Bird flocks circling the castle, hamlet, forest and valley.
- Chimney smoke from inhabited houses.
- Motes in the light and falling leaves in the forest.
- Wind on foliage and grass.

## Interactions (E)

- Read the junction signpost and the hamlet signpost (they point at real places).
- Examine the waystone (a hint at a future mystery thread).
- Look into the well.

## Audio (synthesised placeholders)

Wind with gusts, forest rustle, three birdsong patterns, distant bell (intro), footsteps on grass,
dirt and stone, sword whoosh, UI click.

## Not yet present (do not assume)

NPCs, creatures and enemies, combat hits, items and inventory, the Atlas UI, saves, interiors,
water, rivers, dungeons, quests.
