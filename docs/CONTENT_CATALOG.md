# Content Catalog

Only content that **actually exists in the code** is listed. Everything is generated procedurally.

## Regions and biomes

| Name | Status |
| --- | --- |
| The opening vale (*The Vale of Unwritten Days* in `reference-valley`; named per seed) | Implemented, turned, mirrored and stretched per seed: forested ridge, valley meadows, copses, the castle crag, hills, blue mountains. Its palette follows the brief's *Golden Weald*. |
| The open world (endless 1 km regions) | Implemented: lowlands, uplands, mountain ranges with passes, a northern range behind the vale; great woods and copses; regional character (pine country, birch heaths). Every region is named (e.g. *the Ashen Downs*) and has a fortune that shifts its loot |
| Other biomes (Weeping Fen, Violet Marches, …), water | Planned (Milestone 3+) |

## Sites

| Site | Details |
| --- | --- |
| Ancient tree and spawn hollow | A unique colossal oak (about 26 m) with buttress roots in a levelled clearing; collidable |
| Ruined watchtower | Broken round tower with a road-facing breach, a climbable broken spiral stair (7 steps), rubble, ivy, a low enclosure wall to stand on. Enterable. Name from a grammar (e.g. *Warden's Tower*) |
| Farmstead | Farmhouse, barn and shed around a yard; haystacks, cart, woodpile; 6–11 fields (wheat, barley, fallow, cabbage) with hedges, fences or dry-stone walls; farm track |
| Hamlet | 6–9 buildings along the Vale Road (cottages and longhouses), well, signpost, barrels, woodpiles, cobbled street |
| Lone cottages | Up to 4, each with its own track, named for a family (e.g. *Hale's Cottage*) |
| Great castle | Curtain wall (7–9 sides) with towers, gatehouse and closed portcullis, keep with corner turrets, cathedral hall (buttresses, pinnacles, lancet windows, rose window, west towers, crossing tower and spire), inner towers and buildings. Name from a grammar (e.g. *the Spires of Sablecrest*). Exterior only. One crowns the vale; about 1 in 30 regions has another |
| Hill keep | A smaller castle (5–7 sided wall, low towers, keep, chapel with a spire) on a prominent summit in about 1 region in 8, with a road up to its shut gate. Named e.g. *the Hold of Briarcrag* |
| Village | Church (stone nave, buttresses, lancet windows, porch, bell tower and slate spire), inn (hanging painted sign, door lantern), 7–13 houses lining every street, lanterns, well, barrels, woodpiles, village signs, cobbled streets, a chest behind the inn. About 1 region in 2 |
| Farmsteads, cottages | As in the vale, placed anywhere suitable, with tracks routed to the nearest road |
| Ruined watchtowers | Anywhere with a view; a weapon in the rubble or a strongbox under the stair |
| Standing stones | Rings of 7–12 stones (some fallen) on hills and moors, with a weapon at the heart rolled with wild luck. Named e.g. *the Whispering Ring* |
| Wayside shrines | A saint in a stone niche with candles; often an offering (lucky). Named e.g. *Shrine of the Weeping Maid* |
| Abandoned camps | Tents round a cold fire, a woodpile and a traveller's chest. Named e.g. *Charcoal Burners' Camp* |
| Crossroads | Where a village-less region gathers its roads, marked by a waystone |
| Inn (enterable) | In every village and the vale's hamlet. A hinged door; a taproom with a hearth, a counter and barrels, tables and benches; a stair to a loft with beds and a guest's chest. A warm light while you're inside |
| Villagers | An innkeeper (behind the counter), a priest (church porch), 2–4 street strollers in a village (2–3 in a hamlet), a farmer in most farmyards. Generated names, trades (smith, weaver, miller, carter, herbalist, cooper, shepherd), looks and walk/idle animation; they talk and pass on rumours |

## Roads

- **In the vale:**
  - the Vale Road (trade road; dirt, cobbled through the hamlet; switchbacks to the castle gate);
  - the Old Root Path (forest footpath from the spawn to the junction);
  - the farm track and the cottage tracks;
  - exit roads through the vale's border gates.
- **Beyond the vale:**
  - old trade roads crossing region borders at gates;
  - village streets (cobbled) and castle approaches;
  - farm and cottage tracks;
  - footpaths to towers, stones, shrines and camps.
- **Signposts** at junctions name the destination and its compass direction.

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

## Procedural weapons (see PROCEDURAL_CONTENT.md)

- 12 classes, 10 materials, 16 boons, 6 banes, 7 craft conditions and 6 rarities.
- Every weapon has its own generated mesh, stats, name and (for rare+) lore.
- In the world: a seeded common starting weapon (a longsword in `reference-valley`; otherwise one of eight plain classes), plus five finds (watchtower rubble, waystone
  offering, before the castle gate, against the barn, in a chopping block).

## Procedural creatures (developer gallery only)

- 8 body plans, 10 coverings, 16 mutations and 4 threat tiers.
- Generated moves, temperament, stats and names; armed plans carry generated weapons.
- Not placed in the world until Milestone 5.

## Interactions (E)

- Read signposts (they point at real places), examine waystones and shrines, look into wells.
- Talk to villagers: a greeting and a rumour of a real undiscovered place nearby (direction,
  walking distance, how the luck runs there); it is marked on the Atlas and compass.
- Open and close inn doors.
- Open a chest (its lid swings up and the weapon inside is revealed), then take it.
- Take a weapon find (it swaps with the weapon in your hand). **I** shows the weapon card.
- **M** opens the Hollow Atlas.

## Audio (synthesised placeholders)

Wind with gusts, forest rustle, three birdsong patterns, distant bell (intro), footsteps on grass,
dirt and stone, sword whoosh, UI click.

## Not yet present (do not assume)

NPC schedules, trade and quests; animals; creatures in the world (they exist only in the gallery); combat hits (weapon stats are not
yet used); inventory beyond the weapon in hand; the Atlas's story entries (the map exists); saves;
interiors; water and rivers; dungeons; quests.
