# Known Issues and Limitations

Reproduction uses the reference seed `reference-valley` unless stated. Coordinates are world
metres (press F3 to see your position).

## Limitations (by design for Milestone 1)

| # | Limitation | Planned |
| --- | --- | --- |
| L1 | No save/load. Continue and Load Journey are deliberately absent from the title menu, so there are no fake buttons. | M4 (IndexedDB) |
| L2 | No interiors. Cottage doors are closed and have no prompt; the castle gate is shut (portcullis). | M2 (inn), later castle |
| L3 | No NPCs, creatures or enemies. The sword swing has no hit detection. | M5, M7 |
| L4 | No Atlas, items, chests or quests. | M4 |
| L5 | No water (rivers or lakes) yet. | M3 |
| L6 | Beyond about 5 km the terrain is generic wilderness with trees but no sites. | M3 |
| L7 | All audio is synthesised placeholder sound. | Later audio pass |
| L8 | Chunk generation runs on the main thread under a 5 ms budget; there is no Web Worker yet. | M3 |
| L9 | Time of day is a static preset chosen in Settings; there is no day/night cycle yet. | Later |
| L10 | No gamepad, touch or key remapping. | Later |

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
| I8 | Validation issues for unusual seeds are logged and shown in F3 but not shown to players. | – | Validation passes for 40/40 sampled seeds. A failing seed should be added to the test list. |
