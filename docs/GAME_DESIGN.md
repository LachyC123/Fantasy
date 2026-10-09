# Game Design

The full brief is in [BRIEF.md](BRIEF.md). This file states the design as it applies to the code
**today**, and the rules new content must follow.

## Identity

- **Genre:** first-person, single-player, exploration-driven fantasy action RPG.
- **Feeling:** wonder, solitude, beauty, mystery; the urge to go *one hill farther*.
- **Premise:** you wake beneath an ancient tree with a nearly blank book, the Hollow Atlas, in a
  kingdom whose history has been erased.
  - **Now:** the Atlas is a map that fills in as you travel.
  - **Later (Milestone 4):** its story role (the altar, entries and lore).

## Six pillars (every feature must strengthen at least one)

1. The next hill matters.
2. Locations have histories.
3. Handcrafted-feeling composition.
4. A living but affordable world.
5. Discovery changes the player's knowledge and options.
6. Peace is valuable.

## Core loops

- **Minute to minute (playable now):** survey the horizon → pick a direction (no path is the right
  one) → cross real terrain → notice details (smoke, a tower on a hill, a mark on the compass) →
  discover a place → read, open a chest, take a weapon → check the Atlas → choose the next hill.
- **Exploration is not linear.**
  - The world is an endless grid of procedural regions, each different for every seed.
  - Roads branch through gates in every direction, and signposts name real destinations.
  - About a third of the minor places sit off every road, for people who wander.
  - The compass hints at undiscovered places only when you are close.
  - Luck varies by region (its fortune) and by place: stone rings and camps roll wildly, castle
    gates generously, and a cottager's chopping block is humble.
- **Expedition (Milestones 4–7):** set out from a safe place → follow a rumour or a vista → find
  2–5 details and one larger location → overcome an obstacle → return with knowledge or loot.
- **Long progression (Milestones 8–9):** fill the Atlas, unlock traversal and magic, connect
  regional mysteries.

## The opening (Section 4): how far Milestone 1 delivers it

| Beat | Status |
| --- | --- |
| Black screen, bell, *"Some places are forgotten. Others are waiting."* | Implemented (synthesised bell) |
| Wake beneath the ancient tree, gaze lifts to the vale, castle on the horizon | Implemented |
| Unobtrusive WASD / mouse / Shift / Space / click hints that advance when performed | Implemented |
| Birds and wind | Implemented (instanced flocks, synthesised wind and birdsong) |
| Atlas on a stone altar | Planned (Milestone 4) |
| Watchtower with chest, torch and note; survey viewpoint | The ruin exists and can be entered and climbed via a broken stair. Chest, items and survey are planned (Milestone 4). |
| Briarling encounter | Planned (Milestone 5) |
| Farm, inhabited cottage, smoke, travelling NPC, rumour | Farm, cottages and smoke are implemented. NPCs and rumours are planned (Milestone 7). |
| Village gate, castle framed by roofs | The hamlet and the cobbled street towards the castle exist. Gate and street dressing are planned (Milestone 2). |

## Content rules

- **No fake functionality.** Every visible button works. Doors without interiors have no
  interaction prompt. Nothing claims to be enterable unless it is (the ruin is genuinely walkable).
- **Places with internal logic.** Roads join real places at both ends. Farms sit beside their
  fields with a track to the yard. Cottages face the road. The castle sits on a crag commanding the
  valley.
- **Determinism.** Everything persistent derives from the seed through named namespaces. Random
  choice only happens when *picking* a seed.
- **Negative space.** Meadows, quiet road stretches and forest gaps are intentional.
- **Interactions** need a ray or proximity target, a label, a valid distance, an action, feedback
  and state. Readable signs and the waystone already follow this pattern.

## Controls (implemented)

WASD/arrows move · mouse look · Shift run · Space jump · left click swing · E read/open/take ·
I weapon card · M the Atlas (+/− zoom) · Esc pause · F3 debug overlay. Touch: stick, drag to look,
Swing/Jump/Use/Weapon/Map/Pause buttons.
