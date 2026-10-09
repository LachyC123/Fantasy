# HOLLOW ATLAS: THE UNMAPPED KINGDOMS
## COMPLETE CLAUDE CODE MASTER DEVELOPMENT PROMPT — SECTIONS 0–62
### Painterly low-resolution first-person fantasy RPG | Procedural exploration | Three.js + TypeScript | Browser playable

> **INSTRUCTIONS TO CLAUDE CODE:** This is an IMPLEMENTATION BRIEF, not a request to summarise a game concept. Build a genuine playable game in the current repository, milestone by milestone, validating each completed system in a browser. Read the two image references in the accompanying `references/` folder if image inspection is possible. Treat the text descriptions below as authoritative if you cannot inspect the pictures. Do not report imagined work as completed. Keep a running, honest status of what runs, what is implemented, and what remains.

---

# 0. YOUR ROLE AND NON-NEGOTIABLE CONTRACT

You are the lead designer, gameplay engineer, technical artist, world-generation engineer, 3D environment artist, UI/UX developer, audio implementer, tester, and technical director for **Hollow Atlas: The Unmapped Kingdoms**. The output is a **3D playable first-person fantasy browser game** with an atmospheric pixelated painterly look inspired by the supplied images.

Work independently on reasonable design decisions, but **do not turn the entire spec into a gigantic single untested implementation**. Deliver a beautiful, working first valley and settlement first. Then grow the playable game into a reproducible, streamed world with meaningful discoveries, exploration, characters, combat, dungeons, and persistent state.

**Hard rules:**

1. Working code and playable results outrank plans and placeholder files.
2. No Unity, Unreal, paid API, server requirement, or asset-store dependency for core gameplay. Use browser-native technologies.
3. Every world must have a seed; deterministic geography and placed content must reproduce regardless of chunk load order.
4. Generation should make **places with internal logic** rather than terrain noise sprinkled with unrelated props.
5. Never present an unreachable facade as an enterable location, or a fake button as functional.
6. Maintain usable FPS through chunk streaming, instancing, re-use, LOD, and bounded simulations.
7. Test TypeScript, builds, deterministic generation, persistence, accessibility and visual output each milestone.
8. Do not silently delete functional work to implement something else. Make additive, reviewable changes.
9. Preserve a beautiful, legible composition at low render resolution; avoid generic grey cubes or randomly coloured geometry as final assets.
10. Distinguish **implemented**, **prototype**, **planned**, and **blocked** honestly in your reports.
11. Ask only for a genuinely blocking dependency or decision. Otherwise proceed with sensible defaults.
12. Produce stable, documented commands to launch, test and build the game.

**Definition of the game's promise:** A player sees a distant tower or remote village, wonders what is there, travels through a believable landscape, encounters something unplanned but meaningful, explores a usable location, learns something about that place, and records it in the Hollow Atlas. The next excursion should feel distinct in its scenery, encounters, stories or destination.

---

# 1. THE GAME'S IDENTITY

**Title:** HOLLOW ATLAS: THE UNMAPPED KINGDOMS  
**Genre:** First-person, single-player, exploration-driven fantasy action RPG.  
**Platform:** Modern desktop browsers initially; responsive menus and adjustable graphical settings. Mobile support can follow after core desktop quality.  
**Style:** Painterly low-resolution/pixelated medieval fantasy, rich with Gothic vertical architecture, lush green valleys, heavy atmospheric depth, warm skies, detailed medieval settlements and a visible first-person hand/weapon.  
**Primary feeling:** Wonder, solitude, beauty, mystery, and the compulsion to go *just one hill farther*.  
**Pace:** Relaxed exploration with occasional tension, not non-stop combat or survival micromanagement.

**Premise:** The player awakens beneath an old tree with an enchanted, nearly blank book: the Hollow Atlas. Much of the kingdom's history has been erased. Roads still lead to lost civilisations, buildings remain inhabited by people with partial memories, and maps fail to agree on what is real. An ordinary traveller—not a chosen hero—can record forgotten places and slowly uncover connections between them. There is an optional deep mystery, but the world is free to explore in any direction.

**Primary inspirations (feel, not copied content):** King's Field / Lunacid for first-person fantasy texture and unease; Dread Delusion for strange colourful worlds; Morrowind for unexpected discovery and distinctive local cultures; Elden Ring for landmark-led visual navigation; Outer Wilds for clue-driven knowledge; Minecraft for persistent seed-based exploration. Make wholly original content and designs.

The player should remember a specific night on a mountain road, a strange creature glimpsed at a shrine, a shopkeeper who knew about a missing bell, and the view of a castle from a cobbled street—not just the number of items collected.

---

# 2. THE TWO PROVIDED REFERENCE IMAGES — VISUAL BIBLE

**The images accompany this prompt:**

- `reference_01_castle_street.webp`
- `reference_02_green_valley.webp`

Inspect them if possible; use their common art direction, not merely their subject matter.

## Reference A: Castle street, first-person sword

An incredibly atmospheric medieval street: narrow uneven cobbles, dark stone and timber buildings at either side, irregular steep roofs, ivy climbing masonry, flickering lamps, arches, a large ornate sword and gloved arm visibly held in first person. The road draws the eye towards an **enormous Gothic castle/cathedral skyline** rising above treetops and rooftops. The clouds are violet, apricot, peach and gold, with deep blue shadow on buildings. Architectural silhouettes layer from close dark frames to massive lighter distant towers.

**Implementation targets:**

- Gothic pointed arches, spires, towers, buttresses, complex slate roof planes, jagged skyline, carved portals.
- Foreground framing and occlusion from dense buildings; distant castle remains a visual destination.
- Perceived detail from layered modular geometry, deliberate texturing, strong shadow design and vegetation, not high-poly photorealism.
- Real street layout, doors, thresholds, width variation, stairs, correct collisions and usable paths.
- Sword model and hands should be beautifully art-directed, not wireframe, stretched primitives, or a static flat sprite.
- Stonework should read as chunky, illustrated material at 320×180 or 480×270, not smooth concrete.

## Reference B: Green valley, dual-hand first-person view

A shadowy forest exit frames a lush, sunlit medieval valley. Rich rolling greens, clusters of farms and cottages, long winding pale stone/dirt road, distant hills, heavily layered deciduous trees and beautiful painterly light. First-person hands and equipment appear at frame edges. It feels like every distant house is reachable.

**Implementation targets:**

- A carefully composed **forest-to-valley reveal** in the first few minutes.
- Dark foreground foliage, rich and varied midground vegetation, brighter distant landscape, atmospheric sky.
- Road winding across actual walkable terrain into settlement plots, not a texture ribbon into nowhere.
- Farms, woods, hedgerows, streams, hills, cottages and occasional ruins placed by geographic and human settlement logic.
- Lushness without clutter: varied trees, grass masses, shrubs, flowers, stone walls, ruined markers, windswept leaves.

## The precise style, NOT optional

The target is a **moving 3D medieval fantasy painting seen through a retro pixel display**. Do not interpret “low resolution” as low effort, empty hills, faceted default cubes, psychedelic colours or intentionally ugly graphics. It should feel like a vivid 1990s fantasy artwork brought alive by modern engineering.

A compelling screenshot must emerge during normal gameplay. The user should be able to walk between a dark wooded trail and a brilliantly lit rolling valley, and then into a moody street with the castle looming behind it.

---

# 3. SIX CORE DESIGN PILLARS

1. **The next hill matters:** Most excursions should reveal a new shape, route, encounter, environmental clue, useful location, or astonishing vista. Variety must come from relationships and content, not only random mesh swaps.
2. **Locations have histories:** Old roads connect things; ruins have an original purpose; villages have economies; architectural motifs reveal former kingdoms.
3. **Handcrafted-feeling composition:** Shape hills, roads, forests, walls and buildings around visible points of interest. Great silhouette first, terrain context second, playable route third, decoration last.
4. **A living but affordable world:** Smoke, birds, caravans, wildlife, daily schedules, distant bells, local soundscapes, weather and dynamic encounters make places feel occupied without simulating millions of active entities.
5. **Discovery changes the player's knowledge and options:** The Atlas, clues, map details, spells, rumours, unlocked routes, equipment, NPC reactions and persistent world flags reward curiosity.
6. **Peace is valuable:** Do not overcrowd a world of beauty with hostile enemies. Have wilderness, safe villages, secluded vistas, atmospheric empty ruins, and optional dangers.

Every new feature must strengthen at least one pillar; prioritise features strengthening several.

---

# 4. OPENING FIVE MINUTES — SCRIPTED, THEN FREE

This opening is partly authored with procedural variation. Preserve composition even when the seed differs. It should be polished before expanding to infinite territory.

**0:00–0:15** Black screen, distant bell, leaves and turning pages. Quiet line of text: *“Some places are forgotten. Others are waiting.”* Fade to sunlight through an ancient tree.

**0:15–0:35** Player sits or stands under old branches at a dark forest edge, looking across a green valley. The player sees a winding pale road, cottages, farms, distant blue hills, and a gigantic castle silhouette. It should strongly recall reference image B. Camera control becomes available without jarring cuts.

**0:35–1:10** Teach WASD, mouse look, sprint and E with unobtrusive prompts. A small ruin and low wall provide environmental traversal. Birds and wind make it alive.

**1:10–1:45** A leather-bound Atlas rests on a worn stone altar. Interact, perform a compact physical pickup animation, open a beautiful illustrated parchment UI. The nearby region is named *The Vale of Unwritten Days*. Most of the map is undiscovered.

**1:45–2:45** A tiny watchtower beside the road provides an old sword, a torch, coins and a hand-written note. The player learns picking up, inspecting, equipment and climbing to a survey viewpoint. Make the chest, door and lookout genuinely interactive.

**2:45–3:30** Introduce one well-telegraphed Briarling enemy in a space with sufficient room. Teach one attack, block and dodge in context. If possible include a peaceful alternative route.

**3:30–4:30** The player sees a farm, an inhabited cottage, smoke, a moving animal and a travelling NPC. They can talk and hear an interesting rumour. No mandatory wall of text.

**4:30–5:00** Village gate or open road; new sign, distant castle framed by town roofs. The guided prompts stop. A rumour points to an old chapel; every other direction remains available. The world is free to explore.

**Success criterion:** New players understand interaction, travel, equipment, the Atlas and curiosity without a repetitive tutorial or quest-marker corridor.

---

# 5. FUNDAMENTAL GAMEPLAY LOOPS

**Minute-to-minute:** Survey horizon → select a route or landmark → navigate physical terrain → notice environmental changes → interact with wildlife, residents, object or challenge → find a clue/item/story/shortcut → record and continue.

**Expedition loop (10–30 minutes):** Depart a safe place → follow rumour or self-chosen vista → discover 2–5 smaller meaningful details and a larger location → solve obstacle or make decision → leave with loot/knowledge/map discoveries → potentially return to sell, heal, rest or equip.

**Long progression:** Fill the Atlas, understand lost kingdoms, collect unusual tools, unlock traversal and magic, gather regional clues, uncover major historical mysteries and return to changed places.

**Never:** Require grinding generic enemies just to unlock the surrounding countryside. The player's primary motivation is environmental curiosity.

---

# 6. WORLD SEED, COORDINATES, CHUNKS AND DETERMINISM

The terrain/world must be effectively unbounded in horizontal play space *without promising mathematically infinite unique locations*. Use a layered, deterministic seeded model.

- World coordinate system: metres; up-axis Y; world horizontal X/Z.
- Initial terrain chunk: ~128 m square, configurable.
- Group chunks into larger geographical *tiles* and *regions*, with stable seed-derived IDs.
- Generate major geographic sites at region scale, then terrain at chunk scale.
- Stable 64-bit or carefully implemented 32-bit seed hash; derive independent PRNG streams for terrain, climate, roads, settlement planning, vegetation, loot, NPCs and quests.
- Never depend on uncontrolled `Math.random()` for persistent world content.
- Border samples use world-space functions to avoid cracks; adjacent LOD levels need skirts, morphing or matched edge solutions.
- Chunk loading order must not change site positions or decorative selections.
- Stable entity IDs use world seed + region coordinates + site ID + feature local ID + generator version.
- Store save-game differences, not the entire world mesh or all static spawn positions.
- Record world-generation version so future algorithm changes do not invisibly corrupt existing saves.

Suggested namespaces: `terrain/v1`, `biomes/v1`, `sites/v1`, `settlement/v1`, `interior/v1`, `loot/v1`, `ambient/v1`. Use explicit deterministic sampling functions for reproducibility.

---

# 7. MACRO GEOGRAPHY AND ECOLOGY

Create a world-wide family of smoothly varying fields: continentalness, plate boundaries/ridge influence, elevation, erosion, temperature, moisture, distance-to-coast, ancient magic and historical human use. Use independent but spatially correlated noise functions where appropriate.

**Landform generation:**

- Gentle green river valleys and broad pastures.
- Mountain ranges with passes, foothills and scree.
- Forested plateaus, narrow ravines, swamps, coasts, lakes, cliffs, volcanic terrain.
- Height profile composed from multi-octave noise, ridged noise for mountains, masks for geological features, and controlled erosion-like modifications.
- Stabilise walkable paths by locally grading rather than creating impossible slopes.

**Hydrology:** Build a lower-resolution elevation drainage network first where practical. Rivers flow downhill to lakes, coasts or valid basin sinks; lakes have appropriate outlets or are deliberate endorheic basins. Carve stream/river channels into terrain and place bridges/ford crossings along roads. Avoid disjoint river stubs on chunk edges.

**Ecology:** Forest density, trees, ground cover, rock distribution, wildlife and agriculture depend on slope, altitude, moisture, soil proxy, river proximity, climate and settlement distance. Do not populate cliffs with uniform forests or deserts with wetland plants.

**Biome transitions:** Ecotones, mixed vegetation, shifting fog and soil colours should make transitions feel gradual unless lore justifies a supernatural boundary.

**Terrain beauty:** Use negative space. Every square metre does not need plants. Differentiate open meadows, enclosed paths, old growth, cliff edges, densely layered groves and lakeshores.

---

# 8. TWELVE BIOMES — DISTINCT PALETTE, SILHOUETTE, AUDIO, HISTORY, CONTENT

Start with 3 polished biomes in the playable vertical slice; implement remaining through data-driven expansion.

1. **Golden Weald:** sunny emerald/amber hills, deciduous woodland, soft ochre roads, little farms, hedges, watchtowers, dry-stone walls. Sounds: songbirds, wind, livestock. Secrets: burial mounds, hunting lodges, collapsed shrines.
2. **Weeping Fen:** teal-black water, sunken footpaths, pale willow trunks, blue lanterns, broken boardwalks, reeds, persistent mist. Sounds: insects, croaks, splashing and wood creaks. Secrets: submerged crypts, witch cottages, drowned villages.
3. **Violet Marches:** lavender meadows, dark strange trees, purple dusk, magical stones, standing circles and mirror ponds. Sounds: airy resonance, strange birds. Secrets: ritual observatories, floating fragments, enchantment chambers.
4. **Pale Highlands:** silvery grass, slate mountains, windswept ramparts, snow patches, lonely monasteries, giant weathered warrior statues. Sounds: cold wind and far bells. Secrets: military tunnels, cliffside temples, ruined forts.
5. **Cinder Kingdom:** ash-black stone, burnt woods, deep crimson glow, deserted cities, old foundries, lava cracks. Sounds: distant furnace rumble, ash wind. Secrets: sealed royal vaults, ashbound knights.
6. **Moonlit Hollows:** underground blue fungi, massive roots, reflective black lakes, crystal clusters, ghostly architectural bridges. Sounds: slow drips, cavern echo. Secrets: buried settlements and forgotten libraries.
7. **Rosewild:** emerald growth and giant pink flowers overwhelming white ruins, golden drifting spores, crumbling garden palaces. Sounds: soft wind and insect hum. Secrets: botanical spells and overgrown throne rooms.
8. **Drowned Coast:** dark bluffs, storm beaches, medieval fisheries, sea caves, shipwrecks, lighthouse towers, sea birds. Sounds: surf, gulls and creaking boats. Secrets: tide-gated caves and smugglers.
9. **Starfallen Expanse:** jade glass, meteor craters, impossible suspended rocks, blue-green haze, altered gravity at authored sites. Sounds: glass chimes and distant deep vibration. Secrets: observatories and alien stone vaults.
10. **Elderwood:** monumental ancient trees, thick root bridges, low light, mossy ruins and elevated wooden hamlets. Sounds: deep canopy rustle and animals. Secrets: tree-heart chambers, hidden ranger routes.
11. **Silver Downs:** chalk and cream hills, pale windblown grass, clustered pastoral cottages, standing stones, open panoramas. Sounds: winds and sheep bells. Secrets: barrows, wells, hillside shrines.
12. **Gloam Border:** green-black fir forests, blood-orange sunsets, abandoned frontier walls and military roads. Sounds: distant owls, branches, howling. Secrets: old siege tunnels and haunted guard posts.

Define each biome with typed data: ID, name generator, climate limits, elevation distribution, terrain style, texture palette, fog colour/distance, vegetation grammars, settlement probabilities, site families, creature families, ambient layers, time/weather variations and rarity weights.

---

# 9. REGIONAL HISTORY, CULTURES AND GEOGRAPHIC CAUSALITY

Before decorating sites, generate *lightweight fictional history* at region scale. This is NOT a giant simulation. It is a compact causality model driving visible differences.

For every region store:

- Dominant former culture/faction and present influence.
- Historic prosperous use (mining, farming, monastery trade, defensive frontier, magical research).
- 1–3 significant past events selected from coherent event grammars (war, plague, flood, magical accident, succession, famine, migration, religious schism).
- Local architectural language: roof shape, stone colour, timber pattern, emblem, ornamental motifs.
- Named roads, river crossings and historical travel nodes.
- Degree of abandonment, maintenance, threat and trade activity.
- Primary rumours and one mystery relationship to another site.

**Example:** An ancient Ashen Crown frontier once used tall black-stone forts. Roads connect watchtowers to a mountain garrison. Abandoned outposts share a heraldic lion. Gravebound soldiers, rusted weapons and records of a failed retreat appear. A still-occupied inn remembers old stories. Players notice relationships before explicit explanation.

Narrative generation must affect architecture and objects, not just put a randomly generated paragraph in a diary.

---

# 10. SEMANTIC WORLD MODEL — THINK IN PLACES, NOT MESHES

Represent world entities in lightweight structured records separate from their visible Three.js scene objects.

**Region record:** seed, coordinates/bounds, biome composition, terrain proxies, culture/history, roads, settlements, POI IDs, rare-event slots.

**Site record:** stable ID, archetype, world position, oriented footprint, entrance(s), height, bounds, architecture set, site role, history tags, site seed, persistent content IDs, linked rumours/quests, available LOD, generation validation status.

**Settlement record:** site ID, road skeleton, plots, building functions, residents, economy, schedule, local threats, indoor spaces, rumours.

**Dungeon record:** graph of rooms/links, required gates/keys, critical path, shortcuts, secret paths, encounter slots and proof-of-solvability metadata.

**Dynamic entity record:** unique ID, archetype, position, local state, faction, schedule/AI mode, persistence policy.

Store simulation data independently so a distant inn can appear in the Atlas and remain logically present even when its geometry is unloaded.

---

# 11. POINT-OF-INTEREST FAMILIES

Produce a library of structured, playable archetypes. Each archetype is an authored grammar with procedural parameters and validation.

**Living sites:** farms, roadside taverns, fishing hamlets, vineyard clusters, market villages, mountain monasteries, castle towns, blacksmith villages, military posts, river mills, walled capitals (latter as future expansion).

**Ruin sites:** stone towers, small chapels, hollow abbeys, collapsed bridges, castle courtyards, burial circles, aqueducts, abandoned libraries, graveyards, shattered giant statues, ruined bathhouses, burned villages, star-fallen observatories.

**Natural sites:** waterfalls, glowing groves, giant trees, cave mouths, deep ravines, crystal seams, hot springs, willow islands, strange lakes and cliff arches.

**Hostile sites:** bandit camps, cursed crypts, monster nests, abandoned mines, ruined keeps, overrun villages, fortresses and guarded shrines.

**Mystery sites:** unlit lighthouse, impossible tower, house beneath a lake, ringing underground bell, upside-down tower, silent observatory, forest of bells and tomb with missing inscriptions.

Every interactive site needs (a) a visual hook; (b) an approach route; (c) something to examine, overcome or learn; (d) a reward or consequence; (e) at least one subtle sign of its original purpose. Decor-only sites can exist, but don't label them as full dungeons.

---

# 12. LANDMARK PLACEMENT, NEGATIVE SPACE AND COMPOSITION

Generate sites through geographically valid candidate scoring, minimum distances and regional diversity rules; do not roll random XYZ coordinates and hope for the best.

Score candidate positions based on slope, drainage, water access, road proximity, defensibility, visibility, territory spacing, cultural requirements and scenic potential.

**Examples:**

- A working watermill must be beside a usable stream with a stable bank and access track.
- A defensive castle belongs on a hill controlling a route, pass or river crossing.
- Farms concentrate around fertile valleys, accessible water and roads.
- A shrine can plausibly occupy a forest clearing along an old route.
- A shipwreck belongs on a shore; a mine belongs in suitable geology; a swamp village needs raised paths.

**Sightline planning:** Identify likely first-approach routes and scenic viewpoints. Reserve openings in forests or streets so distant landmarks are visible at meaningful moments. Place castle, mountain and monument silhouettes to build depth: dark near frame → midground landmark → distant mountain/sky. Use structured composition tags like `vista`, `framed-reveal`, `ridge-dominant`, `claustrophobic-approach`.

**Negative space:** Preserve peaceful travel segments, non-hostile meadows and stretches of road. Avoid equally spaced “POI bubbles” that reveal procedural regularity.

---

# 13. PROCEDURAL SETTLEMENT GENERATION

Treat each settlement as a spatial design problem with economy, geography, circulation, topology and lifestyle.

**Generation steps:** suitable site → population/economy → hub(s) and landmarks → main road to regional road → alley/street graph → zoning → land plots → building roles → construction grammar → usable entrances → yards, workspaces, farms, wells → resident assignments → schedules and goods → believable details → collision/navigation tests.

**Sizes (initial design targets):** hamlet 4–12 structures; village 12–35; town 35–100; city districts later with custom streaming and facades. These are capacity targets, not a reason to neglect polish.

**Layout types:** linear riverside, crossroads, hill terraces, ring around church, market-square, fortified hilltop, coastal crescent, forest-clearing, clustered farming village.

Buildings should vary by plot width, frontage, roof pitch, height, extensions, material palette, prosperity, repair state and culture. Mix ordinary and memorable architecture. Avoid identical neat grids except in a culture where planned grids make sense.

Include church bell, tavern, market, workspaces, scattered livestock, vegetable plots, signs, smoke, lamps and villagers. Generate special-case semantic places: a burned farmhouse, busy mill, overgrown abandoned cottage, newly built palisade or eccentric shop.

Settlement doors must connect to navigable paths; roads must lead into and through the village. Village water sources and food production should be believable even if abstractly simulated.

---

# 14. BUILDING AND GOTHIC CASTLE GRAMMARS

Define modular sockets, dimensions, clearances and semantic categories. Building grammar components include: masonry and timber wall units, foundations, corners, stair landings, doors, Gothic and square windows, recesses, lintels, roof ridge/valley/hip sections, chimneys, cornices, dormers, balconies, porches, wooden extensions, support beams, buttresses and spire segments.

**Cottage:** plan → foundations → perimeter walls → door orientation → 1–2 stories → roof with correctly assembled planes → chimneys/windows → details and collision.

**Tavern:** strong frontage, recognisable sign, large ground-floor hall, believable stair, sleeping rooms where active.

**Church:** tall nave, large arched windows, bell tower, graveyard and plausible entrance.

**Castle:** generate defensible layout before towers: approach road, gatehouse, walls, defensive edges, courtyard, keep, one or more service buildings, stairs, ramparts and optional underground link. Vary curtain walls, towers, keep profile, spires, buttresses, courtyards and damage. Some grand Gothic castles can include a cathedral-like complex, creating the **tall intricate skyline from reference A**.

At a distance, a coherent castle can be rendered as a simplified grouped silhouette. On approach it should stream actual traversable courtyards, stairs, interiors and collision.

**Validation:** no roof pieces through walls, no inaccessible door, stairs arriving in solid stone, floating chimney, unrealistic wall intersections or giant accidental gaps. Special magical anomalies must be explicit narrative design, not bugs.

---

# 15. INTERIORS THAT FIT THEIR EXTERIORS

Use interior footprint constraints derived from exterior wall planes, floor elevation and door coordinates. Fit rooms within this footprint and verify clearance and connected traversal graph.

Archetypes: cottage kitchen and sleeping nook; blacksmith with forge, rack and store; tavern common room, kitchen and sleeping chambers; chapel sanctuary and crypt; watchtower stairwell and lookout; noble house hall and chamber; shop floor and stockroom; dungeon guardroom, prison and storeroom.

Contents depend on purpose, wealth and occupancy. A poor abandoned cottage differs from a bustling apothecary. Use material palette, fireplace, shelves, books, food, tools, cobwebs, worn rugs, lamps, broken furniture and ambient sounds contextually.

Start with **at least one complete enterable building** in the vertical slice. Expand later to a controlled proportion of accessible homes and special locations. Do not populate non-enterable facades with misleading active handles or quest directions.

---

# 16. ROADS, PATHS, BRIDGES AND WORLD NAVIGATION

First generate a regional connection graph between settlements, forts, river crossings, passes and principal POIs. Use weighted pathfinding through a coarse geographic cost surface (slope, wetland, water crossings, dense forest, historical trade importance). Smooth the route with curvature constraints; locally grade path surfaces and avoid sudden impossible climbs.

Road hierarchy: major trade route → cobbled settlement street → farm track → forest footpath → deer/game trail → ancient overgrown path. Each has distinct width, material, erosion, clutter and upkeep.

Bridges must span actual water or ravines and meet walkable land at both ends. Switchbacks for steep slopes. Signs, shrines, mileposts, old fences, abandoned carts, campsites and worn stone markers make travel meaningful. Roads may intentionally break at authored landslides or collapsed bridges that pose solvable traversal problems, but not because of seam bugs.

Introduce subtle visual path guidance. Roads naturally pull the eye towards sights. Avoid mandatory minimap GPS arrows everywhere.

---

# 17. CAVES, VERTICALITY AND THE UNDERWORLD

Above ground: winding castle stairs, accessible towers, gatehouses, lookout cliffs, monastery terraces, bridges, giant-root pathways, windmills and rooftops where coherent.

Below ground: natural caverns, eroded passages, cellar tunnels, abandoned mines, royal crypts, cult sanctuaries, sunken passages, giant buried ruins and Moonlit Hollows.

Caves can combine authored chamber shapes, spline tunnels and procedural deformation. Ensure a watertight cave solution suited to browser performance. For initial milestone, simpler connected mesh modules and hand-authored entrance assemblies are preferable to brittle marching-cubes ambitions.

Every vertical route must have actual traversable stairs, ladders, ramps, lifts or explicit abilities. Cave mouths must align to terrain collision. No interior black voids or clipping through hills.

---

# 18. DUNGEON GENERATION AND SOLVABILITY

Build a dungeon grammar based on a semantic graph, not a random grid of identical rooms. Archetypes: chapel crypt, ossuary, mine, ruined castle basement, catacombs, sewer, buried library, cave temple, abandoned prison, ancient observatory and submerged shrine.

Algorithm: choose function/history → critical path → required gate/keys/puzzle dependencies → branch paths and loops → shortcuts → optional secrets → assign room functions → fit modules spatially → doors/stairs → encounters and loot → visual damage/theme → validation.

**Strict invariants:** entrance reaches exit or objective; required key appears before corresponding gate; hidden route does not accidentally replace main path; treasure reachable; creatures can navigate without phasing; multi-floor stairs align; optional puzzles have clues; no trapped player without intended escape.

**Example crypt:** entrance chapel → low staircase → entry ossuary → locked gate → side chamber of rotating statues (clue in mural) → activated passage → lower bone vault → Gravebound ambush → sarcophagus and relic → unlock return shortcut; hidden passage to an outdoor cliff exit.

Variation includes flooded vs dry state, age, collapse, infestation, former purpose, lighting, architectural style, lore and navigational structure. Avoid twenty mechanically identical crypts with different wall colours.

---

# 19. ENVIRONMENTAL STORIES AS GENERATED CAUSAL CHAINS

The most valuable procedural output is an **adventure with context**, not random text. Store narrative templates as structured graphs:

- **Setup:** what happened and why.
- **Visible hook:** something the player notices naturally.
- **Evidence:** physical clues, tracks, notes, NPC remarks or affected environment.
- **Investigation locations:** real spawned world sites.
- **Obstacle:** combat, traversal, social choice or puzzle.
- **Resolution:** change in state, discovered truth or open-ended mystery.
- **Reward:** Atlas knowledge, relationship, item, trade, access or environment change.

**The missing bell:** village without bell → residents mention nighttime sounds → quarry tracks → nest containing bell → retrieve, negotiate, or leave → bells ring again and villagers respond.

**Knight at the bridge:** lone armoured figure waits by broken crossing → old battlefield records → retrieve his lost banner → choice of returning or leaving it → his character state changes.

**House under lake:** luminous water after dusk → local drowned hamlet history → accessible submerged passage → mechanism + document → old tragedy exposed.

**False king:** occupied fortress wears obsolete colours → inconsistency clues → linked tomb and historical records → revelation without requiring a forced linear mission.

Keep actual data links between records. Every object referenced by a quest must exist and have a stable ID.

---

# 20. QUESTS, RUMOURS AND CONSEQUENCES

Avoid template spam (“kill 10 rats” everywhere). Quest verbs: investigate, follow, decode, traverse, repair, defend, trade, negotiate, choose, retrieve, open, map, survey, rescue, discover.

Each quest needs state machine: unknown → hinted → active → stage complete → resolved / failed / abandoned; account for missing critical characters or inaccessible sites. Generate the final solvable graph first, then phrase clues and objective text from that graph.

**Rumour forms:** exact NPC directions, approximate map circle, silhouette description (“the white tower beyond the marsh”), historical reference, merchant tale, inked drawing, road sign. Avoid constantly turning rumours into exact glowing waypoints.

Persistent effects should be visible. A rescued trader returns to their stall; a recovered bell sounds at dusk; cleared bandit camp changes roadside encounter odds; restored shortcut becomes a walkable route.

Include both authored flagship mysteries and procedural smaller stories. Flagship quests should have hand-written beats and deep environmental staging. Procedural quests should use reliable reusable templates, not unrestricted hallucinated prose.

---

# 21. THE HOLLOW ATLAS — SIGNATURE INTERFACE

Press `M` to open the animated old leather-bound Atlas, with worn parchment, ink sketches, restrained gilded headings, page turns and readable type. It contains **World Map**, **Regions**, **Landmarks**, **Creatures**, **People**, **Rumours**, **Relics**, **History**, and **Discoveries** tabs/pages.

Discovery entry data: stable ID, original/generative name, region, approximate coordinates, kind, first visit, current known state, sketch/icon, observed clues, known links, optional site completion. Important discoveries get a brief title-card and low-key musical cue.

At the watchtower, the player draws/reveals a wider area around a surveyed view. Read books, talk to locals and uncover routes to update the map. Keep unknown areas in fog of war. Let players make custom markers and revisit unresolved mysteries.

The Atlas must reflect *actually existing generated locations and known information*. Don't fill it with fictional sites that cannot be reached. Store discoveries persistently, updating entries as new clues appear rather than replacing earlier records.

---

# 22. MYSTERY NETWORK AND NONLINEAR DISCOVERY

Mysteries can span local (one site), regional (several sites in same culture), ancient (several biomes/cultures) and rare world (special weather/time/ability) scales.

Generate/author a directed clue graph with stable anchors. The player finds a symbol on a broken watchtower; later sees the same emblem on a Gravebound shield; a scholar explains it; three remote towers align towards a buried archive. Investigations must be logically consistent even if performed out of order.

Special conditions may include eclipse, moon phase, rain, hearing a rare bell, Echo Sight, wearing a specific relic, activating mechanisms or approaching by a hidden route. Give observable clues, not arbitrary secret flags.

Retain a master *Forgotten History* arc built from authored pieces, while region histories and most clues use procedural connections. Do not require all regions be generated in advance; allocate anchors deterministically across world regions and maintain a high-level site index.

---
# 23. SURVEYING, MAP FOG AND PLAYER NAVIGATION

The map begins as largely blank parchment. The player's footsteps reveal local detail within line-of-travel; surveying from high ground reveals a larger area, with approximate silhouettes of notable landmarks. A clue can annotate a possible location before the area is fully explored. Allow custom player pins and labels.

The player's position should be comprehensible without a modern constantly glowing quest line. Offer configurable compass, approximate region name, remembered roads and subtle landmark orientation. Ancient signposts, bell towers, mountains, rivers and castles should provide natural navigation cues.

Persist fog reveal data efficiently as low-resolution explored tiles/bitsets (or another compact spatial representation) separate from semantic discovered-site IDs. Reopening the Atlas should not demand all world chunks be loaded.

**Surveying moment:** Climb abandoned watchtower; view over valley; use Atlas → a delicate ink wash expands across nearby map; a castle icon and river bend appear, with unknown interiors still blank. Exploration remains meaningful.

---

# 24. NPC GENERATION, PERSONALITY, FAMILIES AND DIALOGUE

NPCs must be locally believable persistent people, not new random mannequins on every visit. Generate: stable ID, name, appearance recipe, age band, occupation, home, workplace, faction, personality traits, concerns, local knowledge, friends/rivals/family links, daily schedule, trade inventory, rumour pool, and key quest flags. Choose compatible attributes rather than independent random combinations.

**Examples:** weary blacksmith who admires uncommon blades; elderly chapel keeper who has suspicions about bell sounds; curious farmhand wanting to see the mountains; suspicious guard assigned to a broken gate; charismatic merchant who exaggerates every danger; historian desperate for an ancient inscription.

**Dialogue features:** greetings by time/weather, profession/trade, hints about nearby real sites, local history, contextual lines about quests, relationship/reputation responses, farewells. Use human-written sentence templates with meaningful vocabulary variables and authored flagship lines. No dependency on online LLMs.

**Schedule:** morning wake/travel → work → noon errand → evening social/rest → night sleep/guard. Rain causes shelter seeking; a monster alert may cause fleeing or regrouping; an important quest can override daily routine. NPCs should avoid closed doors or obstacles using valid navigation.

**Distance simulation:** full animation/behavior only near player; faraway NPC progression as lightweight time/position state. Key NPCs remain in stable home/work context across sessions.

---

# 25. THE LIVING WORLD AND AMBIENT EVENTS

The environment needs constant subtle movement without computational chaos.

**Settlement life:** villagers walking with baskets, smith hammering, peasants chopping wood, chickens scratching, cats on walls, dogs trotting, guards changing posts, merchants adjusting wares, inn patrons sitting, smoke drifting, bells marking the hour, lamps lit at dusk, conversations fading with distance.

**Wilderness life:** deer grazing and fleeing, birds taking off, foxes following hedgerows, moths around lights, fish ripples, insects, leaves, small gusts through grass, puddle/rain splashes, falling branches and distant wolf calls.

**Road events:** mule-drawn cart, broken wagon, stranded traveller, small funeral, wandering minstrel, patrol, escorted prisoner, frightened villager, odd pedlar, campfire, creature crossing the road, storm-induced mud, distant caravan attacked by predators.

Spawn encounters in valid, screened positions outside direct view. Simulate small local groups, not hundreds of entities. Clearly distinguish persistent stateful events from temporary flavour; once an important bridge is repaired or NPC rescued, that consequence must survive reload.

**Director:** encounter likelihood follows road use, danger, time, weather, faction state and recent event history. Let some journeys be quiet and beautiful.

---

# 26. CREATURE ECOLOGY, ENEMY AI AND FACTIONS

Initial bestiary (all original):

- **Briarling:** knot of animated thorns, stealthy quick swipes in Golden Weald woods.
- **Gravebound:** rust-armoured reanimated soldiers, slow feints and shield use around old military tombs.
- **Fen Lurker:** pale swamp predator, crouches in shallow water and ambushes near reeds.
- **Hollow Wolf:** packs with flanking, retreat and hearing behavior.
- **Candle Wraith:** near-abandoned sanctuaries, telegraphs luminous spectral projectiles.
- **Stone Warden:** heavy statue automaton, protects ancient vaults and reacts to trespass.
- **Mire Widow:** tall long-limbed wetland creature, stalking and burst attacks.
- **Ashbound Knight:** veteran melee foe tied to ruined border kingdoms.
- **Mossback:** huge peaceful living vegetation; hostile only when attacked or nest threatened.
- **Lantern Pilgrim:** enigmatic traveller whose faction/state may vary by context.

Non-hostile wildlife: deer, foxes, rabbits, owls, chickens, horses, sheep, boars, butterflies, fish; fantastical lantern deer, moss tortoises, glasswing moths and occasional moving tree spirits.

AI state repertoire: idle, graze, wander, patrol, investigate sound, watch, alert, chase, flank, wind-up attack, attack, recover, defend, retreat, search, return, flee, social/faction action, dead. Select subsets per archetype. Use vision cone + occlusion and hearing radii, local path/nav grids or recast-compatible navigation where necessary, animation telegraphs and cooldowns. NPCs/enemies must not sprint through walls, teleport on camera or attack through thick stone.

Creatures react to other creatures, weather, light and territory when feasible. A pack hunting prey or a sentry guarding a gate conveys life better than constant direct aggro.

---

# 27. FIRST-PERSON COMBAT — PHYSICAL FEEL, FAST READABILITY

Player combat: light/heavy attack, block, perfect-timing parry, stamina-aware dodge, lock-free mouse aim, contextual spell/bow action, damage, stagger, heal, defeat/respawn at safe location. Initial weapons: dagger, short sword, long sword, greatsword, mace, axe, spear, shield, bow, staff. Build 2–3 very polished classes before scaling roster.

**Every strike has:** wind-up, acceleration, contact window, impact feedback, recovery, audio and camera/weapon follow-through. Implement accurate arc/raycast/swept-volume hit detection rather than damage from mere animation proximity; prevent repeated damage ticks from same swing unless weapon design calls for it.

**Impacts:** short material-aware sparks/dust/bone fragments, limited tasteful hit-stop on player animation, sound, directional screen/camera impulse, enemy stagger if threshold met. Use one hit result source of truth. Shields show metallic/wooden hit material response. Sword should not clip through the camera or obscure half the screen while walking.

**Enemy design:** dangerous attacks clearly telegraph direction and timing, recover after committed swings, use spacing and flanks intelligently, often fall after modest number of good hits. Difficulty comes from behaviour, not giant health pools. Avoid unfair off-screen ambush chains or frequent stun locks.

**Audio:** cloth, leather, chain mail, weapon whooshes, hits to metal/wood/stone/flesh, breathing and impact. Use appropriately generated or licensed assets with source notes; original synthesized placeholder sounds are fine for early milestones, but label them.

---

# 28. MAGIC AS A COMBAT AND EXPLORATION TOOL

Spell categories:

- **Offence:** Ember Bolt, Frost Lance, Arcane Burst, Stone Shard, Spectral Flame.
- **Defence/utility:** Minor Mend, Warding Sigil, Light, Wind Push, Slowfall.
- **Discovery:** Echo Sight, Mist Dispersion, Read Old Script, Reveal Hidden, Root Awakening, Temporary Light Bridge at designed magical sockets.

**Echo Sight, signature:** brief spectral overlay revealing traces of older architecture, faded footprints, hidden writing, ghost silhouettes, dormant symbols and puzzle hints. Costs resource or cooldown. Implement as data-driven objects with an `echoReveal` state, layered rendering/filtering, sound, optional effects and Atlas hint changes. Do not let the effect show nonexistent secrets.

Spells should feel rare and eerie, with distinctive hand gestures and retro particle effects. Make visual/audio language consistent with the pixel style. Exploration spells should produce new routes and discoveries but not undermine solvable procedural dungeon graphs.

---

# 29. PLAYER STATS, EQUIPMENT AND CONTROLS

Suggested core attributes: Vitality (health), Endurance (stamina), Might (heavy melee), Finesse (agility/bows), Attunement (magic). Avoid dozens of overlapping stats. Distinguish progression stats from current resources.

Equipment slots: main hand, offhand, head, chest, gloves, boots, legs, amulet, rings, utility. Combat determines visible first-person arms, gloves, shield, weapon skin and animations from the actual equipped item.

**Default controls:** WASD movement; mouse look; shift sprint; space jump; C/ctrl crouch; E interact; left click attack/use; right click block/aim; hold or modifier for heavy attack; F torch; 1–5 quickbar; Tab inventory; M Atlas; J journal; Esc pause; optional R context action. Provide remapping/sensitivity later.

**Controller requirements:** capsule collision; grounded detection; step-up at small obstacles; correct slope limits; jump, fall, landing and fall damage; no ghost movement through stair treads; no camera teleport as chunks load; configurable head bob, FOV, screen shake and pixel density. Mouse pointer lock should be deliberate, with a clear control prompt and Esc to release.

Start with polished walking and sword animation, then add swimming and climbing for suitable locations with reliable physical rules.

---

# 30. INVENTORY, LOOT AND REWARD DESIGN

Inventory categories: weapons, armour, trinkets, herbs, consumables, books, lore objects, keys, crafting supplies and valuables. UI must work with mouse, click/drag or robust selection, quick equip, stack splitting where appropriate, item comparison and tooltips. Consistent icon atlas or procedural hand-painted icons; avoid unreadable tiny typography at low render resolution.

**Loot recipe:** base type + culture/region + material + condition/quality + rare affix + cosmetic variation + optional origin story. Examples:

- *Moon-Touched Iron Longsword:* cool blue blade gleam; effective against some spectral enemies.
- *Briarheart Ring:* slight stamina regeneration benefit while outdoors among dense living vegetation.
- *Keeper's Lantern:* reveals faded inscriptions in old sanctuaries.
- *Ashen Border Helm:* protective but worn; part of a kingdom-specific armour design.

Rarity tiers: common, uncommon, rare, relic, legendary. Legendary named artefacts should have unique world placement rules or signature discoveries—not endless neon random drops. Loot design should encourage exploring unusual ruins, speaking to people, finding secret chambers and facing risks.

**Containers:** stable IDs and persistent open/looted state. Their contents determined by location story, context, rarity, quest dependencies and seeded RNG. Never respawn a legendary item because a chunk unloaded.

---

# 31. LONG-TERM PROGRESSION WITHOUT GRINDING

Combine modest attribute growth, equipment, practical abilities, new magic, faction relationships, Atlas knowledge and exploration unlocks. Discovery itself can grant insight used to study spells or improve survey range.

Players should have several valid playstyles: cautious explorer, swordsman, scholar/mage, treasure seeker or hybrid. Make early regions approachable with basic gear. Later regions may be tougher but not level-wall locked. Let clever avoidance, knowledge, shortcuts and preparation work.

**Unlock examples:** better torch duration; wider survey radius; Echo Sight; ability to read an old script; access to a cave network after discovering an old quarry mechanism; a robe that reduces detection by wraiths. Avoid making every reward a +2 damage item.

---

# 32. LIGHTWEIGHT CRAFTING, TRADE, SHOPS AND ECONOMY

Crafting supports exploration but does not become a hunger/thirst grind. Resources: wood, cloth, ore, herbs, mushrooms, leather, rare magical components. Recipes: torch, healing tincture, arrows, simple weapon repair, antidote, temporary weather protection, minor upgrades.

Vendors: innkeeper for provisions; smith for repair/weapons; apothecary for alchemy; wandering trader for unusual regional items; antiquarian for lore/rare map fragments. Basic gold economy, buy/sell UI, local stock chosen by settlement economy and faction, interesting named items on occasion.

Resources should spawn where ecologically appropriate and not with infinite dense repetition. Crafting stations must be physically situated at usable places. Animated shopkeepers, audible forge and workshop props make commerce part of the world.

---

# 33. INTERACTION, TRAVERSAL AND PHYSICALITY

Every interaction should have a ray-target, label, clear valid distance, action, feedback and state. Types: open door, loot chest, read note, inspect carved symbol, ring bell, pull lever, light torch, enter conversation, rest at fire, gather herb, mine ore, sit at inn, activate shrine, equip item, place marker, solve puzzle.

Doors rotate around believable hinges, chests animate lids, levers move physically, book UI opens with a first-person pose, ropes and hanging signs sway subtly. Use animation timing and sound, not a jarring state swap whenever reasonably achievable.

**Traversable elevation:** ramps, staircases, ladders, small drops, waterways, vaultable knee-high obstacles later. Traversal is always collision-validated. Mark special magical traversal surfaces as explicit gameplay objects.

Optional environmental puzzles: turn statues to face the same bell, redirect a beam of light, raise water level, solve symbol pattern, lower bridge counterweight, activate stained-glass windows. Generate solutions first, place all needed clues and test solvability.

---

# 34. RESTING, CAMPFIRES AND RISK/REWARD

Safe points include inns, friendly houses, shrines and campfires. Rest restores resources, advances time and autosaves; when resting outdoors the player should see flickering flame, shifting light and hear an intimate soundscape. Enemy respawn rules should be consistent, with unique named boss/quest kills persistent.

Do not implement tedious mandatory food/water bars. Day/night and weather create incentives to rest but not constant punishment. Dark roads and certain caves can become riskier after dusk, while lanterns and some spells provide relief.

---

# 35. DAY/NIGHT, SKY, WEATHER AND ATMOSPHERE

The visual references demand rich skies and environmental lighting. Build a stylised procedural sky with layered illustrated cloud shapes/textures, dusk apricot and violet, bright haze, twilight gradients, stars and moon. Clouds should not look like a realistic volumetric sky incompatible with painterly textures.

**Time of day:** dawn mist in valleys, active farms in morning, bright high-contrast midday, golden-hour architecture, deep indigo evening, subtle moonlight and local torchlight at night. Ensure visibility and functional UI at night.

**Weather:** sun, overcast, rain, heavy rain, local fog, wind, snow, thunderstorms, magical regional events. Coherent regional transition, not instantaneous random changes every few minutes. Rain adds dripping roofs, puddles, wet darkened colour response, subtle splashes and low-cost particles. Wind moves grass, foliage, smoke, banners and mist. Thunder changes sky/light momentarily, with distance-appropriate audio.

Use region palette profiles and environmental time curves. Weather effects must respect performance and allow reduced quality.

---

# 36. ENVIRONMENTAL MICRODETAIL AND AMBIENT ANIMATION

**Forest:** ferns, dead leaves, mushrooms, broken branches, tree hollows, roots, moss, logs, animal prints, insects, layered understory and birds. Distribute according to canopy, soil, slope, moisture, paths and age.

**Village:** signs, barrels, baskets, racks, carts, washing lines, stools, ropes, wells, gardens, chicken coops, chimneys, small plant pots, lanterns, scattered produce and footprints. Attach to building functions, not everywhere randomly.

**Castle:** flags, cracked stone, ivy, gargoyle silhouettes, old stained glass, sconces, rubble heaps, arrow slits, support columns, worn banners, stairs and wooden hoardings. Keep intended entrances clear.

**Dungeon:** cobwebs, dust motes, dripping water, rough-cut floor stones, fallen masonry, old candles, bones, damp streaks, roots breaking through stone and abandoned artefacts. Different site histories lead to different details.

**Ambient behaviors:** birds circle towers, smoke rises, cats choose roof/ground rest spots, carts move along real roads, grass sways in wind, flies hover near bog pools. Use cheap instancing, shader motion, baked procedural tracks and a limited update scheduler.

---

# 37. AUDIO, MUSIC AND THE ART OF SILENCE

Use Web Audio or a compatible lightweight library. Build soundscape layers by biome, weather, time and nearby activity. Spatialise local sounds: bell, waterfall, forge, footstep, animal, NPC, torch, opening door, spell and combat. Fade/reverb appropriately for interiors and caves where feasible.

**Examples:**

- Dark wood at morning: rustle, two types of birds, distant woodpecker, leaf gusts.
- Valley near inn: wind, sheep, cart wheels, muffled conversation, chimney crackle.
- Gothic street at sunset: footsteps on cobbles, distant cathedral bell, lantern crackle and banners.
- Underground crypt: droplets, sub-bass hum, sparse movement, sound of own breath.

Music should be sparse, melodic, atmospheric and original. A brief theme may accompany a major sighting or Atlas discovery; leave long stretches for natural ambience. Do not add random copyrighted tracks. If proper assets aren't available, use clearly labelled synth/procedural audio placeholders and upgrade plan.

Treat silence and distance as purposeful composition tools.

---

# 38. PAINTERLY PIXELATED RENDERER

Use Three.js WebGLRenderer with a pixelated lower-resolution scene target and nearest-neighbour upscale to browser viewport. Target default internal resolutions 320×180 (`Ultra Retro`), 480×270 (`Balanced`), 640×360 (`High Clarity`), adjusted for aspect ratio. Ensure UI fonts/text can render at readable native/appropriate resolution rather than making inventory text illegible.

**Materials and textures:** custom low-res colour atlases for stone, brick, timber, plaster, roof, grass, foliage, dirt, metal, cloth and caves; consistent texel-density style. Limited saturated accents and intentional variation. Avoid photoreal PBR textures mixed with flat-shaded cubes.

**Geometry:** readable chunky medieval silhouettes with modest polygon counts, bevels and wall relief where they add value, detailed roof lines, layered trees with irregular leaf masses, geometric shrubs and rocks. Real-world scale proportions matter more than smooth surfaces.

**Effects:** atmospheric fog, subtle warm/cool grading, painterly sky, local torch lighting, restrained dither for shadow/fog transitions, optional vertex wobble as a graphics option. Disable excessive blur, grain, chromatic aberration and constant post-processing noise. Preserve contrast and silhouette clarity.

**Hand/weapon render:** use consistent exposure and shader look, animate arm bones or procedural transforms correctly, handle depth/near plane and occlusion without obvious compositing seams. It should resemble the sword and hand from reference A.

---

# 39. COMPOSITION AND VISTA GENERATION

Good procedural terrain must include **planned cinematic everyday viewpoints**. Generate viewpoint nodes on roads, ridges, forest exits, gatehouses, bridges, tavern steps, towers and cliff paths. Evaluate unobstructed sightlines and landmark prominence. Reserve forest gaps, road bends, background silhouettes and negative space to produce beautiful reveals.

**Vista recipe A:** shadowed close trees → light road sweeping through green fields → farmhouses → massive Gothic keep emerging above village → pale mountain haze → apricot-violet evening sky.

**Vista recipe B:** narrow dark cobbled street with irregular buildings close to camera → climbing ivy and torchlight → road rises into distance → immense cathedral/castle spires dominate the skyline → painterly gold clouds.

**Vista recipe C:** cold cliff pass → dramatic ravine below → ruined arch bridge → distant snow-touched monastery → thick bluish mist.

Use adjustable foreground/midground/background hierarchy, focal anchor, horizon balance, approach angle and sun direction. Never depend solely on accidental scenic screenshots. Programmatic composition does not require perfect computer vision; robust heuristic masks and fixed authored vista modules are an acceptable start.

---

# 40. TEXTURE AND MATERIAL GENERATION PIPELINE

Create an internal procedural atlas generator, ideally with a deterministic pixel-art palette and hand-authored noise rules:

- Stone: irregular block outlines, edge wear, moss, tonal patches.
- Cobblestone: visible uneven stones, grout, light wear, patch repairs.
- Timber: broad grain, knots, weathered beam highlights.
- Plaster: pale warm uneven texture, exposed wood sections.
- Slate roof: overlapping dark tiles, occasional damage and variation.
- Grass/dirt: clustered colours, path wear, speckled flowers and shaded edges.
- Leaves: clustered palette steps, leaf silhouettes with dark internal masses.
- Metal/cloth: patterned bands, rust, subdued highlights, heraldry.

Deliver actual PNG or browser-generated texture atlases or deterministic canvas textures, with nearest sampling where suitable. Avoid tile seams, UV stretching and overly random noise. Use small handmade-inspired motifs to help low-resolution surfaces read distinctly.

Maintain a palette document: Golden Weald moss/honey/peach/slate; Violet Marches lavender/black plum/rose; Weeping Fen dark teal/pale cyan/brown; Cinder Kingdom black/ember/rust; Gothic towns slate blue, moss green, warm stone, candle gold and violet sunset.

---

# 41. PROCEDURAL 3D ASSET KIT

Build geometry factory functions and reusable templates rather than hand-typing unique meshes per building. Document dimensions, pivot orientation, sockets, collision bounds, LOD geometry and associated textures.

**Architecture kit:** wall/foundation units, Gothic/square arched windows, doors, stairs, tower shafts and crowns, battlements, steep gable roofing, chimneys, dormers, stone buttresses, timber frames, bridges, fences, chapel arches, wells, markets, hanging signs and furniture.

**Nature kit:** at least 4 deciduous tree silhouettes, conifers, willow variations, huge old-growth trees, shrubs, reeds, ferns, flowers, mushrooms, roots, rocks, fallen logs, vines and grass tufts. Vary geometry recipes not just random scale.

**Props:** lantern, torch, barrel, chest, cart, bucket, pottery, shield rack, forge, millwheel, banner, bed, table, chair, book, plaque, gravestone, statue and altar.

**First-person kit:** stylised hands, sleeves, gloves, longsword, small shield, torch, staff and bow; rig/animate movement poses and attack arcs. No stick-like untextured final weapon.

**NPC kit:** modular low-poly heads, hairstyles, medieval tunics, cloaks, leather armour, helmets, boots, props, readable silhouettes and simple looping skeletal/procedural animations. Avoid uncanny photorealism or obvious primitive mannequin bodies.

Finish fewer high-quality modules before multiplying bland ones.

---

# 42. IN-GAME HUD, INVENTORY, ATLAS AND JOURNAL UI

**HUD:** discreet health/stamina and magic, small equipment icon, minimal center-dot or subtle crosshair, interact prompts, subtle new-discovery notification, optional compass, contextual boss health bar. Hide UI clutter while sightseeing.

**Inventory:** medieval parchment and hand-inked layout; readable item slots; equip/unequip, inspect, compare, stacks, quickbar, trade, drag/drop or click-to-move, keyboard support; avoid raw debug panels.

**Atlas:** old book with page transitions, map and discoveries, unknown ink-wash regions, manual markers, categories, cards for creatures/people/sites/rumours; accessible without freezing the game in broken state.

**Journal:** active and completed quests, clue snippets, people and regional mystery threads. Only show objectives that correspond to actual game state.

**Subtle game feel:** hover click sounds, small page animations, parchment texture, legible typography, simple readable icon vocabulary and controller-safe layering. UI animations should be interruptible, and Esc must always close the active menu predictably.

---

# 43. FULL FRONT END: TITLE, NEW GAME, PAUSE, SETTINGS, LOADING

Title screen: the game's name over a subtly animated Gothic castle/valley at dusk, with original ambient audio. Functional **Continue**, **New Journey**, **Load Journey**, **Settings**, **Credits**. Continue disabled if no valid save. New Journey allows seed entry/random seed, graphics preset, optional combat difficulty and world name. Provide a real loading/progress overlay during initial asset preparation.

Pause screen: Resume, Atlas, Save, Load, Settings, Return to Title. Save and load show success/failure reliably. Settings include sound/music volumes, mouse sensitivity, FOV, head bob, camera shake, internal render resolution, shadow quality, fog/particle quality, key mapping when implemented, colour/contrast and subtitle settings.

Design keyboard focus and pointer-lock transitions carefully. Never leave gameplay controls active under a modal menu. Display clear error messages if IndexedDB quota/access fails.

---

# 44. SAVE GAME DESIGN AND WORLD PERSISTENCE

Use IndexedDB for structured worlds and save slots, localStorage only for tiny settings. Version save formats. Store world seed/generator version, time/weather, player position/stats/resources, inventory/equipment, discovered map masks, Atlas entries, active/completed quests, NPC state deltas, opened chests, moved levers, solved puzzles, unique creature/boss deaths and major settlement outcomes.

Static sites reconstruct deterministically from seed. Stateful alterations are keyed by stable content ID. Do NOT serialise whole Three.js scenes or save millions of default unchanged props.

**Atomic-ish save strategy:** write to a staging record and update active slot pointer on success; maintain backup/recovery when feasible. Include corruption validation and migration or explicit compatibility warning on load.

**Testing:** explore, take item, open chest, kill named enemy, discover landmark, alter a lever, move between chunks, save, reload browser, restore in same place with all world flags; return to previous location and confirm content did not reset.

---

# 45. PROJECT TECHNOLOGY AND MODULE ARCHITECTURE

Default stack:

- TypeScript (strict mode).
- Three.js for graphics.
- Vite for build and development server.
- Rapier 3D for physics if practical and stable in target runtime; otherwise a robust, tested custom first-person capsule controller, not ad-hoc coordinate collisions.
- IndexedDB for saves.
- Web Audio API / lightweight audio utility.
- Vitest for algorithms and persistence units.
- Playwright for browser smoke tests and screen captures when browser tooling is available.
- Web Workers for heavy deterministic generation as warranted.

Suggested module groups (create actual files only when implementing their responsibilities):

```
src/
  main.ts
  app/{Game,GameLoop,GameState,InputManager,Settings}
  rendering/{Renderer,CameraRig,PixelationPipeline,Fog,Lighting,Sky,Textures,LOD}
  world/{WorldSeed,WorldIndex,Region,ChunkManager,Terrain,Hydrology,Biomes,Roads}
  generation/{History,Sites,Landmarks,Settlements,Buildings,Interiors,Dungeons}
  world/validation/{Footprints,NavChecks,RouteChecks,DungeonChecks}
  player/{Controller,FirstPersonArms,Stats,Equipment,Interaction}
  simulation/{EntityManager,Scheduler,NPCs,Wildlife,Encounters,Weather,Time}
  gameplay/{Combat,Weapon,Damage,Magic,Inventory,Loot,Crafting,Trade}
  narrative/{Atlas,QuestGraph,Rumours,Mysteries,Dialogue}
  ui/{MainMenu,HUD,AtlasUI,InventoryUI,JournalUI,PauseMenu,SettingsUI}
  save/{SaveManager,Migrations,WorldDiffStore}
  audio/{AudioManager,AmbientDirector,SpatialAudio}
  debug/{Overlay,WorldInspector,Profiler,GenerationTests}
  content/{biomes,archetypes,weapons,creatures,quests,palettes}
```

Minimise coupling; pass explicit context/services to procedural generators. Store world records as plain typed data, and construct scene graphs from them. Ensure chunk unload disposes unique resources but preserves shared geometry/materials safely. Avoid single monolithic `main.ts` containing the whole game.

---

# 46. PERFORMANCE, MEMORY BUDGETS AND SCALABILITY

Aim for 60 FPS on a modern desktop/laptop browser under Balanced mode; offer performance presets, with 30 FPS acceptable as a fallback target on weaker supported devices. Benchmark honestly rather than promising a specific FPS everywhere.

Key methods: streaming terrain chunks; reuse meshes/materials; `InstancedMesh` for repeated trees/grass/rocks; merge static architecture wisely; frustum/distance culling; lower-detail distant silhouettes; impostors for castles and forests if needed; limited high-quality dynamic lights and shadows; pooled projectiles/particles; bounded NPC update rates; incremental chunk generation in workers; chunk eviction by memory budget; texture atlases; avoid unnecessary per-frame allocations.

Plan separate **render distance**, **simulation distance**, **landmark horizon distance**, and **Atlas/world-index distance**. Large distant landmarks are visible at coarse LOD without loading their dozens of rooms or NPCs. On approach they transition to high detail without disappearing.

Instrumentation: FPS, CPU frame time, chunk generation duration, workers queued, draw calls, geometry count, active entities, textures/memory proxies and streaming stalls. Establish real budgets after the first valley is implemented. Test sustained travel, turning quickly and entering a village—not only standing still in an empty field.

---

# 47. DEVELOPER DEBUG OVERLAY AND GENERATION INSPECTOR

Add opt-in debug tools showing position, seed, active biome/region, chunk ID, active chunks, queued tasks, draw calls, FPS, nearby POIs, NPC counts and selected seed values.

Debug views: heightmap, biomes, moisture, roads, water flow, plot footprints, building door sockets, collision shapes, navigation graph, dungeon connectivity, quest links, site bounding boxes, LOD boundaries and landscape scenic viewpoints.

Provide dev-only conveniences: teleport to site, reveal Atlas for debugging, force time/weather, spawn test enemy, fast travel between generated test seeds, regenerate region and validate. Hide or lock out from production UI as appropriate.

Log generation errors with stable seed, coordinates, generator version and reproduction steps. Provide a saved failing-seed list used in automated regression tests.

---

# 48. AUTOMATED TESTING AND VISUAL VALIDATION

**Unit tests:** stable RNG and hash; heightfield seams; river continuity; deterministic site allocation under shuffled chunk load order; path connectivity; plot bounds; door access; puzzle dependency ordering; inventory transactions; world-state diffs; quest state transitions; save/load migrations.

**Procedural integration:** choose seeds biased to forest, mountains, rivers, swamp, villages and sparse wilderness. For each: build local 3×3 chunk neighbourhood and validate no gap; place roads/bridges; check spawn point; validate reachable sites and level graph; measure generator cost and memory.

**Browser smoke:** first load renders a non-black frame, WASD moves player, pointer lock works, interaction prompt appears, Atlas opens and closes, chest loot enters inventory, save and reload survive, menus don't trap keyboard, browser console has no unhandled errors.

**Visual review:** capture screenshots of forest-to-valley, town/castle street, first-person weapon, exterior building and dungeon. Check against the supplied images: scale, colour, texture quality, depth, composition, sky, lighting and architectural coherence. If screenshot automation unavailable, give precise manual steps and do not pretend images were reviewed.

**No cheating:** A green build does not prove the game looks good; a beautiful screenshot does not prove collision or saves work. Validate both.

---

# 49. COMPLETE FIRST-PERSON FEEL AND ACCESSIBILITY

Movement should include smooth but responsive acceleration, reliable grounding, footstep variations (grass, dirt, cobbles, wood, water), optional gentle head bob, weapon sway/inertia, sprint posture, believable jump arc and soft landing impulse. Camera shake must be restrained and individually adjustable.

First-person equipment configurations: empty hands, sword alone, sword + shield, sword + torch, staff, bow, magical casting. Animations need anticipation/contact/recovery and blend smoothly when moving.

Combat accessibility and general settings: combat difficulty, subtitles, FOV, mouse sensitivity and invert Y, high-contrast prompts, UI scale, head bob toggle, camera shake reduction, lower graphical effects, reduced flash, colour-readable status indicators. Pause on loss of focus where appropriate. Mouse capture only after explicit player action.

Touch controls are optional future work; do not compromise desktop quality or declare mobile supported without appropriate UI and performance verification.

---

# 50. THE FIRST BOSS: THE BELL-WORN KNIGHT

Create a memorable contained boss in a ruined roadside chapel or crypt (place as an optional exploration reward, not a forced introduction blocker). Weathered armour covered in small bells, asymmetrical helmet, rusted sword, heavy bootfalls and a mournful ringing sound.

**Moves:** slow overhead strike; two-hit sweep; delayed counterattack; thrust when player stays too far; bell-ringing shockwave with clear tell; stagger/recovery window after missed heavy attacks. Use state machine and telegraphed anticipation. Sound must make attacks readable. The boss arena has sensible geometry, collision, light and safe starting entrance.

**Lore context:** an old chapel once guarded a road between kingdoms. Notes and inscriptions hint that the knight once waited for a bell that never rang. The fight or alternative mystery outcome awards an artefact and Atlas entry.

**Milestone expectation:** first implement one regular creature well. Build the boss when combat, damage, enemy navigation and animations already work; otherwise it becomes a nonfunctional showcase.

---

# 51. AUTHOR THE FIRST VALLEY WITH CONTROLLED PROCEDURAL VARIATION

The opening valley must be more crafted than distant wilderness. Treat it as a deterministic **anchor area** with stable visual design and configurable local generation. The aim is to guarantee a memorable first ten minutes and reliable acceptance testing regardless of user seed.

Required connected geography: opening ancient tree clearing → forest exit vista → descending winding road → watchtower/ruin → pasture with farm buildings and birds → small inhabited hamlet → one enterable inn or blacksmith → view down Gothic street towards huge castle → optional branch path to chapel/crypt → onward roads branching into streamed procedurally generated regions.

Use authored layout constraints with seed-dependent dressing, NPC identities, small side routes and loot. The castle should be a real future destination, even if only partial exterior access during initial milestone. Avoid placing an unreachable full-featured-looking city behind a hard blocker without explanation.

Make a **fixed known reference seed** for screenshot comparisons. Use arbitrary alternative seeds for stress tests but keep the opening composition constraints stable. Preserve more world freedom as distance from the start increases.

---

# 52. DISCOVERY DIRECTOR AND VARIATION TRACKER

Create a planning-time deterministic Discovery Director that tunes content distribution; do not spawn permanent structures opportunistically in sight because the player hasn't found enough lately.

Track per-region diversity: biome, site role, architecture family, historical theme, scale, previous nearby archetypes, travel route pacing, viewpoints, mystery-thread capacity, danger and reward type. Use diversity scoring and cooldown rules to avoid nearby repeat temples or identical watchtowers, while preserving believable clustering of historically related ruins.

**Desired exploratory cadence (soft):** in rich areas an interesting detail every 30–60 seconds; meaningful interactions/landmarks roughly every 2–4 minutes; larger site/reveal roughly every 5–10 minutes. Test real movement speed and map density; do not tile the world into obvious timed grids. Open plains, harsh mountains and old frontier roads can be naturally sparse.

Runtime director chooses **transient** creatures, events, ambient layers and rumours based on current time, weather, player danger and recent encounters. Keep deterministic permanent world data separate from mutable runtime encounter state.

---

# 53. RARE DISCOVERIES, WONDER AND SPECIAL ARCHETYPES

Design rarity tiers by *visual/mechanical significance*, not arbitrary drop chance:

- Common: scenic shrine, watchtower fragment, farm, cave, burial marker.
- Uncommon: hidden chapel, failed caravan, flooded passage, lonely mystic, rare species.
- Rare: special observatory, enormous fallen statue, ancient archive, unique knight or lost village.
- Mythic: giant under a mountain, underground kingdom, walking cathedral, forest of bells, village built in enormous tree, inverted tower, altered-gravity ruin, lighthouse shining at a forgotten island.

**Special authored archetypes with procedural variance:**

1. **Giant's Rest:** colossal fallen stone being straddling valley; traverse its torso; secret chamber inside chest; pose and history vary.
2. **Castle Above Mist:** dramatic Gothic silhouette and proper castle plan; occupants vary (lord, bandits, ghosts, siege, abandoned).
3. **Village That Sleeps:** intact dinner tables and empty streets; clues explain disappearance; multiple coherent resolutions.
4. **Hanging Monastery:** cliffside monastery with layered stairs, timber walkways, bells and a view over mountains.
5. **Hollow Crown:** crown-shaped monument visible across entire region; internal architecture and lost heraldry.
6. **Buried Kingdom:** cave descent becomes stone streets and subterranean towers; distinct roofless cavern skyline.
7. **Walking Cathedral:** giant slow-moving structure represented through bounded movement states, not expensive universal physics; rare environmental event.
8. **Upside-Down Tower:** suspended tower descends into a crater; connected rooms and safe stair navigation.
9. **Forest of Bells:** an old forest where wind swings dozens of bells; sound puzzle and story.
10. **Last Lighthouse:** offshore beam illuminates hints of a strange ruin, accessible with a valid planned route.

The rarest events should be surprising and memorable, but a normal new seed must still offer substantial compelling exploration in its early regions. Never make all the best content one-in-a-million impossible to find.

---
# 54. TECHNICAL FAILURE CONDITIONS — BLOCKERS, NOT POLISH REQUESTS

Unacceptable:

- Blank screen, broken imports, blacked-out shaders, missing first-person camera.
- World generated but no functioning player controller or collision.
- Terrain cracks at chunk borders, roads vanishing abruptly, uncrossable bridges, lakes without valid placement.
- Buildings hovering, intersecting, with fake entries or entrances buried by decorations.
- Twenty villages consisting of the same 5 cubes and randomly repeated roofs.
- Distant castle silhouette that becomes a void or disappears when approached.
- NPCs with no identity or shops that don't work.
- Creatures penetrating walls, attacking through solid stone, endlessly chasing across loaded/unloaded space.
- Quests referencing missing objects or locked objectives without attainable keys.
- Dungeons with unreachable exits, unavoidable dead ends without intended path, invalid stair geometry.
- Legendary treasure respawning on chunk reload.
- Save states losing the player's map, chest states, quest progress or equipment.
- Performance stalls on every chunk boundary, leaking GPU resources, uncontrolled growing entity lists.
- Fake settings toggles, inert menu buttons, broken pointer lock or keyboard focus.
- Generic random cube/primitive models presented as the final reference-accurate visual art.
- Promises like “all biomes complete” when content is absent or only placeholder definitions exist.

If a blocking failure is found, fix before advancing. If completion must be deferred, mark it clearly in status and explain the next specific action.

---

# 55. ASSET CREATION STANDARD AND CONSISTENCY

Build a reusable coherent **asset language**. Procedural geometry is welcome but needs designed shapes, pivots, UVs, colliders, silhouette standards and quality review. Material palettes must match the images. Do not use external copyrighted assets or scrape game textures.

**Architecture:** stone wall systems, arches, multiple door types, broad/window slit/Gothic windows, ornate gate, battlements, flying or grounded buttresses where structurally coherent, pointed slate roofs, chimneys, colonnades, towers and spires, carved keystones, medieval signs. Create attractive larger profiles with combinations of these modular units.

**Nature:** conifers, willows, oak-like broadleaf variants, ancient monstrous trees, stump/root system, hedges, bushes, ferns, small flowers, long grass, mushrooms, rocks, boulders, reeds, reeds with cattails, moss and forest clutter. Make tree silhouette diversity algorithmic and meaningful.

**Characters:** stylised but readable faces/clothes/arms; distinct traveller, farmer, blacksmith, guard, priest, merchant, scholar; first-person gloved hand and detailed sword with credible grip, guard, blade and motion; enemy silhouettes that read at low resolution.

**Asset inspection:** render isolated assets against neutral and in-world backgrounds; verify the roof matches walls, scale makes sense, door height accommodates player capsule, textures aren't stretched, UVs are consistent and geometry won't overtax renderer. Use generated PNG texture atlases where appropriate and keep ownership/license notes for any introduced third-party free assets.

**Iteration:** a small cohesive collection expanded through intelligently chosen variation beats a giant folder of randomly generated unrelated meshes.

---

# 56. IMPLEMENTABLE GENERATION ALGORITHM AND VALIDATION ORDER

Use the following concrete pipeline; split time-consuming work between world-index planning and streamed realization:

1. **Seed + stable IDs:** establish namespace PRNGs and generation version.
2. **Coarse world-index planning:** create region cells, climate/elevation summaries, culture and history.
3. **Hydrology and mountain passes:** derive rivers, lakes, ridges and viable crossings on coarse grid.
4. **Site allocation:** score and reserve major monuments, settlements, trade hubs, rare special sites and mystery anchors.
5. **Road graph:** connect viable settlements and strategic sites with slope/water-aware routing.
6. **Chunk terrain:** sample continuous heights and material masks from world fields plus local edits for roads/sites.
7. **Site footprints and foundations:** terraform tiny areas deliberately; preserve regional terrain shapes.
8. **Structures:** plan village plots and individual building grammars, then instantiate modules at valid transforms.
9. **Interiors/dungeons:** generate connected graphs, fit rooms, position real entrances, verify reachability.
10. **Ecology:** distribute tree/vegetation/rocks/animals by environmental suitability and scenic masks.
11. **History dressing:** add faction emblems, battle scars, occupation-specific props, clues and unique details.
12. **Interactive objects:** allocate stable IDs and seeded loot; check quest references and key ordering.
13. **Navigation/collision validation:** ground tests, reachable doors, no invalid road crossings, correct stair/cave links.
14. **Distant/near rendering:** build low-cost silhouette or terrain LOD and full detail on demand.
15. **State overlay:** apply saved persistent diffs after deterministic construction.
16. **Bounded runtime simulation:** register relevant NPCs, creatures, sounds, effects and encounters.

**Pseudocode:**

```
worldSeed = canonicalizeSeed(inputSeed)
regionKey = (rx, rz)
region = generateRegionIndex(worldSeed, regionKey, GENERATOR_VERSION)
siteReservations = deriveSitesAndRoads(region, adjacentRegionSummaries)

function buildChunk(cx, cz):
  s = deriveSeed(worldSeed, 'chunk', cx, cz, GENERATOR_VERSION)
  terrain = sampleContinuousWorldTerrain(cx, cz, siteReservations)
  cells = classifyBiomeAndMaterials(terrain)
  roadsAndWater = cutInPlannedWorldFeatures(terrain, region.index)
  sites = realizeReservedSitesOverlappingChunk(cx, cz)
  decorations = placeContextualDecorations(s, terrain, sites, cells)
  validateGeometryAndNavigation(terrain, sites, roadsAndWater)
  return applyPersistedState({terrain, roadsAndWater, sites, decorations})
```

**Seam conditions:** deterministic world-coordinate sampling, cross-region sites reserved by one canonical owner, local adjacency queried with a border margin, consistent transforms/footprints. Do not regenerate a cross-boundary castle independently on two sides.

**Output safety:** mark failed sites as invalid, attempt constrained repair, then replace with a simpler valid archetype if needed. Fail gracefully rather than silently creating floating or broken geometry.

---

# 57. STREAMING, GPU OPTIMISATION AND LONG SESSION RELIABILITY

Use separate render/physics/simulation registries with clear ownership and cleanup. Define chunk lifecycle: unrequested → requested → generating → ready → active → cooling → unloaded. Use cancellation or ignoring stale worker results if player turns around quickly. Make priority based on proximity, velocity, camera direction and crucial entrances.

**Distance bands:** close full terrain/building geometry/collision and NPCs; medium simplified structures/instanced foliage; far terrain and landmark silhouettes; beyond that atmosphere/horizon only. Adjust bands by graphics settings and actual scene density. Fog hides LOD boundaries but must not erase every vista.

**Memory hygiene:** share materials and meshes; dispose unique GPU buffers/textures when no longer referenced; never let sounds/physics bodies/listeners accumulate on unloaded chunks; avoid updating off-screen vegetation individually; reuse ambient particles. Track active and pooled objects during extended traversal.

**Worker safety:** generation worker should exchange serialisable typed data, not Three.js scene instances. Assemble GPU resources on render thread incrementally to avoid spikes. Avoid too many expensive shadow casters; choose which lights actually matter.

**Stress tests:** uninterrupted 20-minute walking circuit across settlements, repeated entering/leaving dungeon, rapidly rotating camera, load/save after exploring multiple chunks, switching graphics modes, tab suspension/resume. Report measured FPS and scene budgets honestly.

---

# 58. SECOND-PASS POLISH — MAKE IT FEEL LIKE A GAME

After systems work, spend a *dedicated pass* improving what the player actually sees and feels. Do not add ten biomes to avoid fixing the first.

**Visual pass:** sky quality, castled skyline proportions, road composition, medieval material depth, layered forests, building silhouettes, lighting continuity, atmospheric haze, pixelation clarity, lighting inside interiors, first-person hand and sword aesthetic, terrain texturing and fog.

**Environment pass:** quiet life; wind through grass and banners; animals moving from A to B; chimney smoke; dusk lamp switching; market clutter; cloth sway; footsteps, foliage, droplets and distant ambience.

**Combat pass:** weapon animation curves, attack contact timing, enemy hit response, stagger, readable telegraphs, responsive block/parry, distinct impact audio and effects, reasonable stun limits.

**Exploration pass:** approachable sightlines, enough landmarks but also breathing room, understandable routes, rewarding secrets, memorable discovery music, dialogue writing, informative clues, meaningful Atlas entries.

**UX pass:** functional menu stack, quick readable tooltips, stable save UI, correct pointer lock release, legibility at all internal resolutions, keyboard navigation, understandable tutorial and setting persistence.

**Quality bar:** Regular screenshots should convey the look of supplied images. If not, identify visual differences and iterate before declaring polish complete.

---

# 59. PROJECT DOCUMENTS AND STATUS FILES

Maintain and update these files truthfully:

- `README.md`: dependencies, install, launch, build, controls and troubleshooting.
- `DEVELOPMENT_PLAN.md`: milestone sequence, goals, dependencies, acceptance tests.
- `ART_DIRECTION.md`: two references, palette, texture rules, architecture silhouettes and screenshot checklist.
- `WORLD_GENERATION.md`: seed, world-index, biome/climate, roads/rivers, site placement, settlement grammar, stable IDs and persistence.
- `ARCHITECTURE.md`: rendering, physics, data records, AI, UI, audio, chunk lifecycle, subsystem interfaces.
- `CONTENT_CATALOG.md`: every actually implemented biome, site, NPC family, enemy, item, spell, encounter and quest archetype.
- `IMPLEMENTATION_STATUS.md`: implemented vs prototype vs planned, tests, known blockers and real screenshots.
- `KNOWN_ISSUES.md`: reproducible steps, relevant seed and coordinates.
- `CHANGELOG.md`: changes and regressions.

Include sample configuration and how to use a known reference seed. Do not fill status documents with aspirational unchecked claims.

---

# 60. MILESTONES, ACCEPTANCE GATES AND CLAUDE CODE WORKFLOW

**Operating mode:** inspect → plan small change → implement → build/test → view screenshot → fix → report. Keep each milestone runnable. Stop for user review after completed milestone unless they explicitly request uninterrupted expansion.

## Milestone 1 — Beautiful playable first valley

Implement: Vite+TS+Three scene; pixelated renderer; first-person controller with robust collisions; painterly sky/fog; contiguous low-poly rolling valley; dense but performant foliage; stone/dirt winding road; coherent small farm/cottages; distant Gothic castle silhouette; attractive first-person hands/sword; audio; pause and basic settings. **Acceptance:** player walks out of dark trees to the sunlit valley as in image B; browser build has no runtime errors; no floating props or camera clipping; capture actual screenshot if supported.

## Milestone 2 — Medieval village + castle approach

Implement: semantic village roads/plots; varied medieval stone/timber houses; Gothic arches/church; one real accessible inn; first residents; street-specific decorative rules, lanterns, ivy, chimneys, ambient activity, silhouetted castle skyline. **Acceptance:** walking down an actual cobbled street looks recognisably like image A; doors/steps/path collisions work; at least one inhabited interior accessible.

## Milestone 3 — Deterministic procedural landscape

Implement: seed substreams; stable region/chunk index; 3 polished biomes; world-space seamless terrain; water/roads; chunk streaming + LOD; geographically plausible small POIs and settlements; data validation. **Acceptance:** same seeds reproduce, no chunk seams, sustained roaming loads correctly, and no obvious major generation overlaps.

## Milestone 4 — Hollow Atlas and discoveries

Implement: manuscript Atlas; map reveal; location naming and surveys; reliable landmark interactions; 2–3 distinct POIs, treasure, document clue, journal/rumours. **Acceptance:** actual sites are discovered, marked, saved, and remain marked on reload.

## Milestone 5 — Combat vertical slice

Implement: player sword, blocks, dodge/stamina; two polished enemy archetypes, reactions, loot, VFX/SFX and defeat/rest behavior. Boss may begin here only after regular encounters feel good. **Acceptance:** fair hits/collisions, enemy telegraphs, no wall phasing, satisfying feedback, no infinite loot exploits.

## Milestone 6 — First usable dungeon generator

Implement: crypt or mine room graph, 2–3 layout alternatives, stairs/doors, one puzzle, enemies and secret chest; automated reachability. **Acceptance:** every tested seed has reachable objective and exit; dungeon is visually/architecturally coherent; players can finish it.

## Milestone 7 — Inhabited world

Implement: persistent NPC identities, basic schedules and dialogue, shop/trade, wildlife, road encounters, 1–2 quest templates and settlement reactions. **Acceptance:** returning to same village preserves named people, trade and quest state.

## Milestone 8 — RPG and exploration abilities

Implement: inventory/equipment, appropriate gear visuals, spells including Echo Sight, usable item stats, simple crafting and progression. **Acceptance:** equipped items alter gameplay, spells reveal actual linked content, inventory and save remain reliable.

## Milestone 9 — Regional mysteries and content expansion

Implement: additional biomes/POI archetypes, multi-location mystery graphs, history-driven dressing, unique boss or grand landmark, meaningful quest outcomes. **Acceptance:** mystery clue dependencies hold across procedural seeds and can be resolved through in-world discovery.

## Milestone 10 — Full polish and reliability

Improve first-person animation, art coherence, richer skies, background life, sound, accessibility, menus, performance, chunk unloading, seed stability, browser support and bug-fix pass. **Acceptance:** extended gameplay test and full vertical slice, screenshots, test summary, no blocking errors.

### At every milestone

- Start with exact source inspection and actual dependency state.
- Create a bounded feature checklist with acceptance conditions.
- Edit existing functioning code thoughtfully; do not delete unrelated features.
- Run typecheck, build, tests and browser launch.
- Inspect actual rendered scene; compare with references if possible.
- Fix blockers before moving on.
- Update documentation and report only what truly works.

**Recommended development practices:** Run `npm install`, `npm run dev`, `npm run build`, `npm run test` with scripts you actually configure. Set up `npm run typecheck`; provide a seed-enabled debug route or query parameter, e.g. `?seed=reference-valley`, if useful. Test browser via Playwright if available; don't claim screenshot review if unsupported.

---

# 61. COMPLETE PLAYABLE VERTICAL-SLICE ACCEPTANCE SCRIPT

A tester must be able to perform **this exact uninterrupted sequence**:

1. Open browser URL and reach an attractive working title menu.
2. Click New Journey and enter or randomise a seed.
3. Wait through a clear, finite loading phase without freezes or blank screen.
4. Spawn under an ancient tree, seeing layered green hills, road, cottages and a massive castle on horizon.
5. Move with responsive collision-safe first-person controls; see animated gloved hands and sword.
6. Travel through a wooded path while foliage moves, animals sound and birds are visible.
7. Emerge into a bright valley resembling reference image B, with impressive long view.
8. Reach a ruined watchtower via real navigable road; open chest, read note, acquire item and survey the region.
9. Open Atlas and confirm site entry and newly revealed map portion.
10. Encounter a creature; attack/block/dodge using reliable hit detection; defeat it or avoid it through world navigation.
11. Walk into a living hamlet with different houses, smoke, an animal and several named NPCs.
12. Converse with an NPC, get a geographically valid rumour and view trade where available.
13. Enter an actual cottage/inn with usable interior and functioning doorway/collision.
14. Walk down a cobblestone medieval street looking towards enormous Gothic towers against a peach/violet sky, resembling reference image A.
15. Follow side route to a small ruin, cave or crypt; navigate its connected rooms and find a secret or environmental clue.
16. Collect a reward, optionally solve a basic puzzle or complete a short quest, and see Atlas update.
17. Save, close/reopen tab, load, confirm position, inventory, map discoveries, opened chest, quest progress and NPC identity all persist.
18. Continue into additional procedurally generated terrain; see coherent biome/road continuity and novel discoveries without obvious world seams.

If a step is not available in the current milestone, report it as pending; it is not acceptable to describe the *whole vertical slice* as complete until all steps succeed. Do not invent screenshots, FPS numbers, playtest outcomes or systems.

**Primary visual judgement:** The player should repeatedly encounter landscapes that look like illustrated medieval fantasy paintings—intimate Gothic stone streets; enormous dramatic castles; picturesque rolling meadows; lush forest shadows; atmospheric pink and purple skies. This quality must survive ordinary camera movement, not only promotional renders.

---

# 62. BEGIN DEVELOPMENT — FIRST WORKING SESSION

**Do the work now rather than asking whether to start.**

1. Inspect the current repository and installed tools. Check whether the two supplied WebP references are readable.
2. If no project exists, initialise a Vite + strict TypeScript + Three.js application. Add only necessary dependencies.
3. Create the short project documents and an initial milestone checklist.
4. Implement the renderer with low-resolution target/upscaling and a basic adjustable retro pipeline.
5. Create a robust first-person controller with correct input, pointer lock, ground collision, walking, sprinting, jump and slope handling.
6. Create the opening valley terrain, forest with multiple silhouettes, road, scattered medieval farms and a giant distant Gothic castle.
7. Make a painterly sky, fog and sun positioning matching the two references.
8. Implement first-person hand/sword view model with walk sway and a simple tested attack pose, without prematurely building entire combat logic.
9. Add ambient wind/birds and make the opening terrain feel alive.
10. Launch, typecheck, build, screenshot if tooling permits, inspect actual composition, fix obvious visual and technical defects.
11. Report exactly how to run it and which acceptance items passed.
12. **Pause for milestone review** before beginning the village/castle expansion, unless instructed to continue autonomously.

**Creative command:** Make the player feel like a lonely wanderer moving through a beautiful and impossibly old world. A road should suggest a story; a silhouette should suggest a destination; a ruin should suggest its past; a city should feel inhabited; and an Atlas entry should feel like a genuine discovery.

> **BUILD HOLLOW ATLAS: THE UNMAPPED KINGDOMS. START WITH A WONDERFUL FIVE MINUTES.**

---

# APPENDIX A — ENGINEERING IMPLEMENTATION EXAMPLES

These examples communicate expected data architecture. Adapt to actual chosen implementation; do not blindly paste untested snippets.

## Stable seeded site record

```ts
type WorldSeed = string;
type SiteKind = 'hamlet' | 'watchtower' | 'chapel' | 'castle' | 'cave' | 'ruin';
type Vec3 = readonly [number, number, number];

interface SitePlan {
  id: string; // worldSeed + index owner + site namespace + local index
  kind: SiteKind;
  center: Vec3;
  yaw: number;
  footprint: readonly Vec3[];
  seed: number;
  biomeId: string;
  regionId: string;
  cultureId: string;
  historyTags: string[];
  approachAnchors: Vec3[];
  entryAnchors: Vec3[];
  worldStoryLinks: string[];
  validated: boolean;
}
```

Do not put GPU mesh references in `SitePlan`; generation workers should be able to serialise it.

## Persistent diffs

```ts
interface WorldSaveDiff {
  worldSeed: WorldSeed;
  generatorVersion: number;
  discoveredSiteIds: string[];
  openedContainerIds: string[];
  defeatedUniqueEnemyIds: string[];
  solvedMechanismIds: string[];
  questStates: Record<string, unknown>;
  importantNpcStates: Record<string, unknown>;
  player: {
    position: Vec3;
    health: number;
    stamina: number;
    inventory: unknown[];
    equipment: Record<string, unknown>;
  };
}
```

Version all save payloads. Keep types concrete in final code rather than `unknown` placeholders.

## Determinism regression

```ts
const a = generateRegionPlan('example-seed', 12, -4);
const b = generateRegionPlan('example-seed', 12, -4);
expect(stripRuntimeFields(a)).toEqual(stripRuntimeFields(b));

const order1 = generatePlansInOrder(seed, [[0,0], [1,0], [0,1]]);
const order2 = generatePlansInOrder(seed, [[0,1], [0,0], [1,0]]);
expect(normalisePlans(order1)).toEqual(normalisePlans(order2));
```

These should become real passing tests with actual project APIs.

---

# APPENDIX B — IMPLEMENTATION PRIORITY / SCOPE GUARDRAILS

The **full design vision is large** and cannot responsibly be implemented as a polished 3D RPG in one Claude Code session. Prioritise a beautiful **slice that proves world generation, visual quality, interaction and persistence**, then iterate.

**Before adding 12 biomes:** perfect 3 with unique ecology and palettes.  
**Before adding 100 enemy variants:** perfect 2 intelligent and animated enemies.  
**Before generating a giant city:** perfect 1 small believable village.  
**Before making endless dungeons:** prove 1 coherent, solvable dungeon grammar.  
**Before adding hundreds of quests:** prove 2 genuine causal quest templates and a regional mystery.  
**Before heroic ambitions of unlimited procedural assets:** perfect the modular geometry/texture kit and visual screenshot comparison.  
**Before claiming browser compatibility:** test real load, movement, save, extended travel and production build.

The goal is not an impressive-looking code folder. It is a **playable, convincing world** whose systems can be enlarged without losing coherence.

---

# APPENDIX C — HANDOFF FORMAT FOR EVERY CLAUDE SESSION

At the end of each work session, include:

```
MILESTONE: <name> / <number>
STATUS: complete | in progress | blocked
PLAYABLE NOW: <exact actions possible>
IMPLEMENTED: <specific systems>
TESTS RUN: <commands and actual pass/fail>
VISUAL REVIEW: <screenshots paths or 'not available'>
PERFORMANCE: <measured data or 'not yet measured'>
KNOWN ISSUES: <specific reproducible bugs>
FILES CHANGED: <important paths>
HOW TO RUN: <exact commands>
NEXT STEP: <smallest highest-value next action>
```

Keep reporting factual, concise and implementation-oriented. Work product always comes before status rhetoric.

---

# APPENDIX D — EXTRA EXPLORATION CONTENT SEEDS FOR FUTURE EXPANSION

Use these as *design patterns*, not a fixed list guaranteed to spawn identically in every seed:

- Hill chapel partly enclosed by roots, bell audible across misty fields.
- A windmill with its sails missing, located at a fork in old trade road.
- Deer standing motionless near a ruined statue at twilight.
- Forest clearing with upright swords embedded in stones, each differently worn.
- Farmhouse abandoned after a river changed course; its cellar opens into older masonry.
- Broken giant's finger forming a bridge across a deep stream.
- A trader whose wagon contains maps of a region that appears absent from the Atlas.
- Small fishermen's hamlet linked to a cave accessible only at low tide.
- A lighthouse keeper who insists the lights at sea belong to no ships.
- A ruined library whose books have blank pages except during Echo Sight.
- A castle's ramparts visibly rebuilt from stone of a much older monument.
- A travelling companion animal that leads the player to a lost shepherd.
- A buried bell visible beneath clear frozen lake ice.
- A carefully maintained grave inside an otherwise forgotten cemetery.
- A merchant caravan crossing a bridge while a distant storm closes in.
- An orchard village celebrating an annual festival with lanterns and changing NPC routines.
- A stone aqueduct heading towards a vanished settlement.
- A mountain cave containing a large abandoned banquet hall.
- A snow-covered monk watching distant columns of smoke from a watchtower.
- A shrine whose statues subtly face a constellation that changes with the calendar.
- A lonely bridge leading to a black castle rising from a pine forest.
- A meadow with unusual towering flowers at the base of broken palace walls.
- A forest pond reflecting a building that is not physically present above it (special authored magical site).
- A small fortified village actively repairing last night's monster damage.
- A bandit camp that has been mysteriously deserted, leaving equipment around a fire.
- An ancient subterranean road with occasional openings to the surface.
- A valley where several old stone roads inexplicably converge on an unmarked hill.
- An isolated tower surrounded by cottages that borrow its old stonework.
- A field of old war banners half-buried beneath red flowers.
- A walled city street whose final view reveals the full Gothic castle skyline under a violet peach sky.

The above should inform art direction, content grammars, historical world logic, ambient events and modular future content creation.

---

**END OF COMPLETE MASTER PROMPT — SECTIONS 0 THROUGH 62 + APPENDICES A–D**
