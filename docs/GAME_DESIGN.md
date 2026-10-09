# Game Design

The full brief is in [BRIEF.md](BRIEF.md). This file states the design as it applies to the code
**today**, and the rules new content must follow.

## Identity

- **Genre:** first-person, single-player, exploration-driven fantasy action RPG.
- **Feeling:** wonder, solitude, beauty, mystery; the urge to go *one hill farther*.
- **Premise:** you wake beneath an ancient tree with a nearly blank book, the Hollow Atlas, in a
  kingdom whose history has been erased. The Atlas itself arrives in Milestone 4.

## Six pillars (every feature must strengthen at least one)

1. The next hill matters.
2. Locations have histories.
3. Handcrafted-feeling composition.
4. A living but affordable world.
5. Discovery changes the player's knowledge and options.
6. Peace is valuable.

## Core loops

- **Minute to minute (playable now):** survey the horizon → pick a route → cross real terrain →
  notice details (signs, the waystone, smoke, birds) → read or examine → continue.
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

WASD/arrows move · mouse look · Shift run · Space jump · left click swing · E read/examine ·
Esc pause · F3 debug overlay.
