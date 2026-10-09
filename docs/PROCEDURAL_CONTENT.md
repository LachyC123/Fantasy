# Procedural Arsenal and Bestiary

> "A nearly unlimited number of weapons and enemy types using procedural generation. You could get
> extremely lucky or really, really unlucky."

Weapons and creatures are generated from **genomes**: pure functions of a 32-bit seed, plus an
optional luck bias and constraints. Their parameters are continuous, so the number of distinct
results is effectively unlimited. Tests confirm 5,000 of 5,000 sampled weapons and 4,000 of 4,000
sampled creatures have distinct forms. A shared **luck model** keeps the extremes rare enough to
matter, in line with the brief: legendary items are meaningful finds, not endless random drops.

## Luck model (`src/gameplay/luck.ts`)

| Rarity / tier | Odds | Weapons | Creatures |
| --- | --- | --- | --- |
| common | 62% | plain materials, 0 boons | common (rarities common and uncommon together, 87%) |
| uncommon | 25% | 1 boon | |
| rare | 9.45% | 2 boons, moonsilver possible | **elite** |
| relic | 2.8% | 2–3 boons, starmetal possible | **champion** (named) |
| legendary | 0.7% | 3 boons, a proper name and lore; bloodsteel or dragonglass | **champion** (named) |
| mythic | 0.05% (≈1 in 2,000) | 4 boons, name with epithet, voidglass | **mythic horror** (named, 3–4 mutations, ×4.5 health) |

- **Luck bias:** `luck` multiplies every above-common chance by 2^luck. Humble places such as a
  chopping block (−1.2) roll lower; the castle gate (+2.0) rolls higher.
- **Craft condition:** a separate fat-tailed roll that reaches both extremes. A mythic blade can
  still be *worn*, and a common one can be *flawless*.

| Condition | Share | Stat multiplier |
| --- | --- | --- |
| ruined | about 2% | ×0.55 |
| rusted | 7% | ×0.75 |
| worn | 19% | ×0.9 |
| sound | 48% | ×1.0 |
| fine | 17% | ×1.1 |
| masterwork | 6% | ×1.22 |
| flawless | 2% | ×1.35 |

- **Bad luck is real:** poor condition invites *banes* (Brittle, Ill-Omened, Thirsting, Wailing,
  Leaden, Dull). 8% of rare-or-better weapons are **cursed**: powerful, but carrying a bane.

## Weapons (`src/gameplay/weapons.ts`, `src/assets/weaponMesh.ts`)

- **12 classes:** dagger, shortsword, longsword, greatsword, sabre, falchion, axe, greataxe, mace,
  warhammer, spear, glaive.
- **Continuous shape:**
  - blades: length, width, taper, curve, tip (point, spear, clip, round, leaf), fuller,
    serration, notches (from damage);
  - fittings: guard style and span (cross, up-swept, down-swept, disc, ring, winged), grip length,
    pommel (wheel, sphere, stopper, ring, spike);
  - heads: bearded, crescent or double axe; flanged or spiked mace; hammer and beak; leaf spear
    head; glaive blade; plus head size.
- **10 materials,** gated by rarity: iron, steel, bronze, bone, blackened iron, moonsilver,
  starmetal, bloodsteel, dragonglass, voidglass.
- **16 boons:** Ember-Kissed, Rimed, Storm-Called, Moon-Touched, Briarheart, Bell-Forged, Hungering,
  Featherlight, Keen, Grave-Heavy, Warden's, Sunlit, Gloaming, Venomed, Sundering, Echoing. Boons
  with an element add glowing runes to the mesh.
- **Stats:** damage, speed, reach, weight, stamina and critical chance, derived from geometry,
  material, condition, rarity and affixes. They apply once combat lands in Milestone 5; the card
  says so.
- **Names:** for example *Rusted Brittle Bronze Axe of the Tolling Bell*, or *Mournreaver, Greataxe
  of the Long Dusk* (legendary and mythic pieces carry lore).
- **Mesh:** blades are extruded from their 2D outline with bevelled edges; heads, guards, pommels,
  hafts and runes are parametric. The same mesh is used in your hand, lying in the world, and
  carried by creatures.

**In the game now:**
- You start each journey with a humble common steel or iron longsword, generated from the seed.
- **Five weapon finds** wait at planned places, each with its own story and luck:
  - the watchtower rubble (+0.4);
  - an offering at the waystone (+1.1);
  - a blade driven into the earth before the castle gate (+2.0);
  - a tool left leaning against the barn (−0.6);
  - an axe buried in a cottager's chopping block (−1.2).
- Rarity-coloured glints twinkle near finds. **E** takes a weapon and leaves yours in its place, so
  nothing is lost. **I** shows the card of the weapon in your hand.
- Each weapon's pose in the first-person view follows its family; swing speed follows its speed
  stat.

## Creatures (`src/gameplay/creatures.ts`, `src/assets/creatureMesh.ts`)

- **8 body plans:** biped, quadruped, brute, crawler, serpent, wisp, thornling, construct.
- **Continuous proportions:** torso length and width, neck, head, leg count and length (crawlers
  have 6–10 legs), arms, tail, hunch.
- **Head features:** 1–9 eyes, curved, straight or antlered horns, maw, beak, tusks or mandibles,
  crests.
- **10 coverings,** each with palettes and surface detail: fur spines, scale plates, bark ridges,
  bone ribs, plate armour with great helm, stone blocks, moss, chitin, ethereal.
- **16 mutations,** for example:
  - Twin-Headed, Ancient (×1.7 size), Many-Eyed, Thorn-Backed, Bell-Hung;
  - Ember-Blooded, Rime-Touched, Crystal-Grown (visible glowing shards);
  - Hollow (translucent), Gloam-Cloaked (shadow), Fungal, Venomous, Swift, Lumbering, Crowned,
    Ironhide.
- **Behaviour data** (ready for Milestone 5 AI):
  - a move set of 2–5 moves from the body plan's library;
  - temperament: skittish, territorial, predatory, guardian, ambusher or wandering;
  - activity hours, pack size, biome affinity.
- **Stats:** health, damage, speed, armour, perception and a threat score, from size, tier and
  mutations.
- **Weapons:** bipeds and brutes carry a generated weapon. Its luck rises with the creature's tier,
  so a champion's weapon is a likely prize.
- **Names:** for example *Ember-Blooded Glossy Eel*; champions and mythics get proper names such as
  *Mother Gallowstep* or *Old Gristlemaw, the Unburied*.

**In the game now:** creatures can be browsed in the **developer gallery**. They are deliberately
**not** placed in the world until combat, AI, navigation and hit detection exist (Milestone 5),
because inert enemies would be fake gameplay.

## Developer gallery

Open `http://localhost:5173/?gallery` (append `&seed=<seed>` to change the backdrop world).

- **← / →** or the buttons step through specimens. The index is unbounded in both directions, so
  you can keep stepping forever.
- **R** jumps to a random specimen. **Tab** switches between creatures and weapons.
- The **luck** slider (−3 to +4) shows how fortune shifts the results.

## Roadmap hooks

- **Milestone 5 (combat):**
  - creature AI uses `moves`, `temperament` and `stats`, and spawns by biome affinity and pack
    size;
  - weapon stats drive hit detection and timing;
  - creatures drop their carried weapons.
- **Milestone 4 (saves and Atlas):** taken and dropped finds persist by stable id; bestiary entries
  record creatures you have met.
- **Milestone 8 (RPG):** inventory, comparison and repairing conditions; boon effects become real
  mechanics.
