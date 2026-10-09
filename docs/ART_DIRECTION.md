# Art Direction

**Target:** a moving 3D medieval fantasy painting seen through a retro pixel display. It should
feel like a vivid 1990s fantasy illustration, not "low effort low-res".

## The two references (`references/`)

| Reference | What we take from it | Where it shows in the game now |
| --- | --- | --- |
| **A, castle street** (`reference_01_castle_street.webp`) | Violet, apricot and peach clouds; deep blue shadow on stone; an enormous Gothic castle as the skyline destination; chunky illustrated stonework; a gloved hand gripping an ornate sword in first person | Dusk and golden-hour presets, banded cloud shading, the castle complex with its 215–245 m crossing spire, ruin and wall stone textures, the view-model sword and glove |
| **B, green valley** (`reference_02_green_valley.webp`) | Dark forest framing a sunlit valley; a pale winding road; red-roofed cottages among layered trees; hands at the frame edges | The spawn vista (a forest gap reserved by the sightline wedge), the pale dirt road ribbon, tile-roofed cottages, layered tree LODs, dark-to-bright depth |

Both references share: strong silhouettes, layered depth (dark near frame, mid-ground detail, pale
distance), saturated but harmonious palettes, visible pixel texture and painterly light.

## Renderer targets

- **Internal resolution:** 180p (Ultra Retro), **270p (Balanced, default)** or 360p (High
  Clarity). Width follows the aspect ratio, and the result is upscaled with nearest-neighbour
  filtering.
- **Grade (final pass):** ACES-style tone map → sRGB, saturation ×1.16, violet-tinted shadows,
  warm highlights, slight S-curve, a subtle vignette.
- **Posterisation:** 30 levels per channel with a 4×4 ordered (Bayer) dither in *low-res pixel
  space*, so the dither pattern stays locked to the big pixels.
- **Ink outlines:** depth-discontinuity darkening on near silhouettes (fades out by 260 m). It can
  be switched off.
- **Sun shafts:** screen-space radial blur of the visible sky towards the sun, at half low-res.
- **Atmosphere:** exponential aerial perspective whose colour depends on view direction (warm
  towards the sun, violet-blue elsewhere), plus analytic valley mist. Distant landmarks fade but
  stay legible. The castle must never disappear into haze; that is a regression.

## Palettes (as implemented)

| Family | Colours |
| --- | --- |
| Meadow | `#557f2c` · `#6f9a35` · `#8fb243` · dry gold `#a29a48` |
| Forest floor | `#3a4f22` · `#2b3a1c` |
| Road / dirt | `#a88f63` (texture `#b49a6e` range) |
| Stone (village) | warm grey `#8e8a82` – `#b0a792`, mortar `#4a463f`, moss `#4f6233` |
| Castle stone | pale `#b9b2a2` – `#c4bca9`; roofs blue slate `#4c5466` – `#5d6577` tinted `#c9d0e6` |
| Roofs | clay `#a8492f` – `#bf6343`; slate `#454c5c` – `#5d6577`; thatch `#9b773f` – `#d0ad6b` |
| Foliage | oak `#24461f` / `#4f7a2c` / `#9cbc4e`; birch lighter yellow-green; pine `#14301f` / `#2c5034` / `#5f8650` |
| Golden-hour sky | zenith `#3d4596`, upper `#7f78c4`, horizon `#f4c39a`; clouds lit `#ffd9a0`, mid `#e2a3a6`, shadow `#7a6aa8` |
| Dusk sky | zenith `#2a2c6e`, upper `#6a58a8`, horizon `#f0a07a`; clouds `#ffb07c` / `#c97a9a` / `#5a4a8e` |
| Gloved hand | leather `#3e2c23`, highlight `#6e5241`, vambrace `#2c2622`, tooling `#8a7a62` |

## Texture rules

- Every texture is generated deterministically in code (`src/rendering/textures.ts`): masonry
  coursework with lit top-left and shaded bottom-right edges, clay and slate tile rows, thatch
  strands, timber grain, bark, cobbles, packed dirt, leaf dabs.
- Geometry UVs are in **metres**, and each material maps metres to tiles. Stone repeats every 3 m,
  castle stone every 5 m, roof tiles every 2.4 m, terrain detail every 4 m. Texel density stays
  uniform, roughly 16–25 px/m.
- Magnification is nearest-neighbour. Minification uses mipmaps to stop shimmer.
- Leaf dabs are deliberately bigger than real leaves so they survive at 270p.
- No photographic textures, no external texture packs.

## Geometry rules

- Chunky readable silhouettes before detail: steep gable roofs with overhangs and ridge caps,
  jettied upper storeys, timber frames, chimneys, quoins, buttresses, spires and battlements.
- Trees grow by species grammar (see `CONTENT_CATALOG.md`). Canopies use crown-blended normals
  with noise, so they shade as painted masses.
- Nothing floats. Buildings sit on stone plinths sunk into levelled pads. Roads are graded into
  the terrain.

## Screenshot checklist (each milestone)

Capture with `npm run screenshots` (reference seed `reference-valley`, 1280×720, golden hour):

1. **Spawn vista:** dark tree framing, path leading out, ruin in the mid-ground, castle silhouette
   on the horizon. Compare with reference B.
2. **Forest edge / road:** bright valley, pale road, scattered trees, distant hills.
3. **Hamlet street towards the castle:** cobbles, walls, cottages, castle spires. Compare with
   reference A.
4. **Ruin close-up:** stone texture, ivy, broken silhouette.
5. **First-person sword:** hand and blade readable, not covering the centre of the view.
6. **Dusk:** violet and apricot palette held across sky, haze and shadows.

For each shot, check: scale, colour harmony, texture legibility, depth layering, sky quality,
silhouette clarity, and that the castle stays visible. Real screenshots from this milestone are in
`docs/screenshots/`.
