# Known Issues and Limitations

Reproduction uses the reference seed `reference-valley` unless stated. Coordinates are world
metres (press F3 to see your position).

## Limitations (by design for Milestone 1)

| # | Limitation | Planned |
| --- | --- | --- |
| L1 | No save/load. Continue and Load Journey are deliberately absent from the title menu, so there are no fake buttons. | M4 (IndexedDB) |
| L2 | No interiors. Cottage doors are closed and have no prompt; the castle gate is shut (portcullis). | M2 (inn), later castle |
| L3 | No NPCs or enemies in the world; generated creatures can only be viewed in the developer gallery. Swings have no hit detection, and weapon stats are not used yet. | M5, M7 |
| L4 | The Atlas is a map only (no story entries, notes or rumours); no inventory or quests. Taken weapons, opened chests, explored ground and discoveries last for the journey only (no saves). | M4 |
| L5 | No water (rivers or lakes) yet. | M3 |
| L6 | ~~No sites beyond the vale.~~ The open world is procedural and endless. Remaining: distinct biomes (fen, marches, …) and water. | M3 |
| L7 | All audio is synthesised placeholder sound. | Later audio pass |
| L8 | ~~Chunk generation on the main thread.~~ Moved to a Web Worker pool. Without worker support it falls back to inline generation under a 5 ms budget. | done |
| L9 | Time of day is a static preset chosen in Settings; there is no day/night cycle yet. | Later |
| L10 | No gamepad or key remapping. Touch controls exist but cannot be rearranged or resized. | Later |

## Open issues

| # | Issue | Repro | Notes |
| --- | --- | --- | --- |
| I1 | Real-GPU frame rate not yet measured. | Run on desktop, F3 | The test environment only has software WebGL. Triangle budget at the spawn is about 3.7 M per frame (with shadows); see TESTING.md for the levers. |
| I2 | Tree LOD switches per 64 m chunk, so a chunk of trees can visibly change LOD at once around 110 m and 460 m. | Walk along the forest edge watching trees about 110 m away | Softened by fog and pixelation. Per-instance LOD or dithered cross-fade is planned for the M10 polish. |
| I3 | Far-forest thinning shows as a slightly sparser canopy beyond about 880 m. | Look across the valley walls | Trade-off for triangle budget. |
| I4 | The crag woodland can still hide the castle from parts of the switchback road. | Walk the last 300 m of the Vale Road | Road verges are thinned; framed castle views on the approach are planned with M2. |
| I5 | The view-model hand is built from rounded primitives and has no finger animation. | Look at the bottom right | Acceptable for M1; a richer hand and arm rig comes with M5 combat. |
| I6 | Pointer lock cannot be re-acquired straight after Esc in some browsers (a browser security rule). | Esc, then click Resume immediately | Resume goes through the *Click to explore* prompt, which always works. |
| I7 | Headless software rendering runs at about 1–3 FPS, so browser tests take several minutes. | `npm run test:e2e` | Environment limitation, not a game bug. |
| I9 | Generated creatures sometimes have awkward proportions (thin limbs, horns clipping) and no animation. | `?gallery`, browse | Acceptable for a generator preview; rigging and animation come with M5. |
| I10 | Frame rate on real phones has not been measured. Phones start with shadows off and a short view distance; older phones may still be slow. | Open on a phone, F3 is unavailable without a keyboard | Lower *Pixel resolution* to 180p if it stutters. A touch-friendly FPS readout is planned. |
| I11 | iPhone Safari has no full-screen API for pages, so the browser bars stay visible. | Open on iPhone | *Add to Home Screen* from a static host launches it full screen. |
| I12 | Inside a claude.ai Artifact the URL query string is not passed through, so `?seed=` and `?gallery` do nothing there. | – | Enter the seed in New Journey instead. |
| I13 | A region's buildings appear a moment after you reach it if you teleport or move very fast. Walking, regions are raised well ahead (planned 1.15 km out, built over several frames). | Teleport with test hooks | Structures, colliders and finds arrive together, so nothing can be walked through before it exists. |
| I14 | Region builds cost 30–90 ms of CPU, spread over several frames at 4 ms per frame. Castle landmarks (about 20–60 ms each) are built in one go. | F3 overlay | Time-slicing castles is a follow-up. |
| I15 | Villages have no NPCs yet, and church and inn doors are closed (no interiors). | Visit a village | M2 (enterable inn) and M7 (residents). |
| I16 | Roads can climb steeply where a region has no gentle way to its gate (grade-limited to 18% for trade roads, with cuttings). | Mountain regions | Validation keeps every road within its grade limit. |
| I8 | Validation issues for unusual seeds are logged and shown in F3 but not shown to players. | – | Validation passes for 40/40 sampled seeds. A failing seed should be added to the test list. |
