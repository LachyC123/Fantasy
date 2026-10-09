/**
 * Terrain surface classification → painterly vertex colour. Meadows vary in
 * broad brush patches, forest floors darken, steep ground turns to rock, roads
 * wear dirt shoulders, fields carry crop colours and peaks catch snow.
 */
import * as THREE from 'three';
import { Noise2D } from '../core/noise';
import { deriveSeed } from '../core/rng';
import { smoothstep, clamp } from '../core/math';
import { pointInObb } from './geometry2d';
import { padDistance } from './terrain';
import type { TerrainLike } from './terrain';
import type { Ecology } from './ecology';

const C = (h: string): THREE.Color => new THREE.Color(h);

const PAL = {
  meadowA: C('#557f2c'),
  meadowB: C('#6f9a35'),
  meadowLight: C('#8fb243'),
  dry: C('#a29a48'),
  forestFloor: C('#3a4f22'),
  forestDark: C('#2b3a1c'),
  rock: C('#8a8578'),
  rockDark: C('#605d56'),
  dirt: C('#a88f63'),
  trodden: C('#8d8a52'),
  mountainGrass: C('#77874e'),
  snow: C('#e6eaf2'),
  wheat: C('#c9ad55'),
  barley: C('#b6b35e'),
  fallow: C('#7a5a3a'),
  cabbage: C('#4f8236'),
};

export class TerrainColorizer {
  private readonly nPatch: Noise2D;
  private readonly nFine: Noise2D;
  private readonly tmp = new THREE.Color();

  constructor(
    readonly terrain: TerrainLike,
    readonly ecology: Ecology,
  ) {
    this.nPatch = new Noise2D(deriveSeed(ecology.seed, 'terrain/colour'));
    this.nFine = new Noise2D(deriveSeed(ecology.seed, 'terrain/colour-fine'));
  }

  /**
   * Colour at a point. `detailed` enables per-feature masks (roads, fields,
   * exact forest density) which only matter for nearby terrain.
   */
  color(x: number, z: number, h: number, ny: number, detailed: boolean, out: THREE.Color, roads = true): THREE.Color {
    const patch = this.nPatch.fbm(x / 70, z / 70, 3);
    const fine = this.nFine.sample(x / 9, z / 9);
    // Meadow base: broad brush patches between three greens and dry gold.
    out.copy(PAL.meadowA).lerp(PAL.meadowB, smoothstep(-0.35, 0.35, patch));
    out.lerp(PAL.meadowLight, smoothstep(0.25, 0.65, patch + fine * 0.15) * 0.8);
    out.lerp(PAL.dry, smoothstep(0.45, 0.8, this.nPatch.sample(x / 260 + 11, z / 260)) * 0.45);

    // Forest floor.
    const forest = detailed ? this.ecology.forestDensityAt(x, z, h) : this.ecology.forestBase(x, z, h);
    out.lerp(this.tmp.copy(PAL.forestFloor).lerp(PAL.forestDark, smoothstep(0, 0.6, fine)), smoothstep(0.15, 0.65, forest) * 0.9);

    // Altitude bands.
    out.lerp(PAL.mountainGrass, smoothstep(220, 340, h + patch * 30) * 0.8);
    const slope = Math.sqrt(Math.max(0, 1 / (ny * ny) - 1));
    const rockAmt = Math.max(smoothstep(0.7, 1.05, slope + fine * 0.1), smoothstep(380, 520, h + patch * 60));
    out.lerp(this.tmp.copy(PAL.rock).lerp(PAL.rockDark, smoothstep(-0.3, 0.6, fine)), rockAmt);
    out.lerp(PAL.snow, smoothstep(620, 700, h + patch * 80) * smoothstep(0.9, 0.6, slope));

    if (detailed) {
      for (const plan of this.ecology.source.contentsNear(x, z)) {
        // Fields.
        for (const f of plan.fields) {
          if (Math.abs(f.x - x) > 40 || Math.abs(f.z - z) > 40) continue;
          if (!pointInObb({ x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2, hd: f.depth / 2 }, x, z, -0.5)) continue;
          const crop = PAL[f.crop];
          out.lerp(crop, 0.85).multiplyScalar(0.94 + 0.12 * fine);
        }
        // Trodden ground around buildings and ruins.
        for (const p of plan.pads) {
          if (Math.abs(p.x - x) > 30 || Math.abs(p.z - z) > 30) continue;
          const d = padDistance(p, x, z);
          out.lerp(PAL.trodden, (1 - smoothstep(0, 4, d)) * 0.45);
        }
      }
      // Road shoulders.
      const hit = this.terrain.roadIndex.query(x, z);
      if (hit) {
        const w = hit.road.halfWidth;
        const k = 1 - smoothstep(w - 0.3, w + (hit.road.kind === 'trade-road' ? 2.2 : 1.2), hit.dist + fine * 0.6);
        out.lerp(PAL.dirt, clamp(k, 0, 1) * 0.9);
      }
    } else if (roads) {
      // Distant roads still read as pale threads across the valley.
      const hit = this.terrain.roadIndex.query(x, z);
      if (hit && hit.dist < hit.road.halfWidth + 2.5) out.lerp(PAL.dirt, 0.75);
    }
    return out;
  }
}
