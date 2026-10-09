/**
 * Macro geography: the continuous base height field before roads and building
 * pads are graded into it.
 *
 * The opening region ("The Vale of Unwritten Days") is an authored anchor
 * composition with seeded variation: a forested southern ridge where the
 * player wakes, a long green valley running north, a crag carrying the great
 * castle, and blue mountains on the horizon. Beyond the anchor the field
 * blends into generic seeded hills so the world never ends at a wall.
 */
import { Noise2D } from '../core/noise';
import { deriveSeed, Rng } from '../core/rng';
import { smoothstep, clamp } from '../core/math';

export const ANCHOR = {
  spawn: { x: 0, z: 0 },
  castle: { x: 130, z: -1580 },
  /** Radius over which the authored anchor composition dominates. */
  radius: 5200,
};

export interface MacroParams {
  castleX: number;
  castleZ: number;
  cragHeight: number;
  plateauRadius: number;
  meanderPhase: number;
  meanderAmp: number;
  ridgeHeight: number;
  forestEdgeZ: number;
}

export class MacroField {
  readonly params: MacroParams;
  private readonly nDetail: Noise2D;
  private readonly nShape: Noise2D;
  private readonly nRidge: Noise2D;
  private readonly nWarp: Noise2D;

  constructor(seed: string) {
    this.nDetail = new Noise2D(deriveSeed(seed, 'terrain/detail'));
    this.nShape = new Noise2D(deriveSeed(seed, 'terrain/shape'));
    this.nRidge = new Noise2D(deriveSeed(seed, 'terrain/ridge'));
    this.nWarp = new Noise2D(deriveSeed(seed, 'terrain/warp'));
    const rng = new Rng(deriveSeed(seed, 'terrain/anchor'));
    this.params = {
      castleX: ANCHOR.castle.x + rng.range(-40, 40),
      castleZ: ANCHOR.castle.z + rng.range(-40, 30),
      cragHeight: rng.range(84, 98),
      plateauRadius: rng.range(100, 115),
      meanderPhase: rng.range(0, Math.PI * 2),
      meanderAmp: rng.range(90, 150),
      ridgeHeight: rng.range(30, 36),
      forestEdgeZ: rng.range(-78, -64),
    };
  }

  /** Valley centreline X at a given Z (gentle meander). */
  centerline(z: number): number {
    const p = this.params;
    return p.meanderAmp * Math.sin(z / 720 + p.meanderPhase) * smoothstep(-150, -600, z);
  }

  /** Base height in metres. */
  height(x: number, z: number): number {
    const p = this.params;
    const nd = this.nDetail;
    const ns = this.nShape;

    // Domain warp keeps every hill from looking like round noise blobs.
    const wx = x + 60 * this.nWarp.sample(x / 600, z / 600);
    const wz = z + 60 * this.nWarp.sample(x / 600 + 40, z / 600 - 40);

    // Rolling valley floor.
    let h = 7 * ns.fbm(wx / 260, wz / 260, 3) + 2.2 * nd.fbm(wx / 70, wz / 70, 3);

    // Valley walls east and west.
    const dx = Math.abs(x - this.centerline(z));
    const wallNoise = 140 * ns.fbm(wx / 500 + 9, wz / 500, 2);
    const wall = smoothstep(420, 1150, dx + wallNoise);
    h += wall * (95 + 55 * ns.fbm(wx / 380, wz / 380 + 7, 3));

    // Southern ridge: the forested upland where the player wakes.
    const ridgeT = smoothstep(-300, 30, wz + 25 * ns.sample(x / 260, 3));
    h += ridgeT * p.ridgeHeight + Math.max(0, z - 40) * 0.06;
    h += ridgeT * 5 * nd.fbm(wx / 120, wz / 120, 3);

    // Castle crag with a flat summit.
    const cdx = x - p.castleX;
    const cdz = z - p.castleZ;
    const cd = Math.sqrt(cdx * cdx + cdz * cdz);
    const cragFall = 1 - smoothstep(p.plateauRadius - 10, p.plateauRadius + 300, cd + 35 * ns.sample(x / 160, z / 160));
    h += p.cragHeight * Math.pow(cragFall, 0.85);
    // Rocky ribs on the crag's flanks (only evaluated where they matter).
    if (cragFall > 0.001 && cragFall < 0.999) h += 9 * cragFall * (1 - cragFall) * 4 * (this.nRidge.ridged(x / 90, z / 90, 3) - 0.4);

    // Hills behind the castle and the far blue mountains.
    const north = smoothstep(-1950, -2600, z);
    if (north > 0) h += north * (35 + 45 * ns.fbm(wx / 450, wz / 450, 3));
    const mountains = smoothstep(-3300, -5200, z) + smoothstep(1500, 2900, dx);
    const mt = clamp(mountains, 0, 1);
    if (mt > 0) {
      h += mt * (180 + 620 * this.nRidge.ridged(wx / 1300, wz / 1300, 5));
    }

    // Outside the anchor: generic seeded wilderness (expanded in Milestone 3).
    const r = Math.sqrt(x * x + (z + 1500) * (z + 1500));
    const outside = smoothstep(ANCHOR.radius, ANCHOR.radius + 2500, r);
    if (outside > 0) {
      const wild = 60 + 120 * ns.fbm(wx / 900, wz / 900, 4) + 260 * this.nRidge.ridged(wx / 1600, wz / 1600, 4);
      h = h * (1 - outside) + wild * outside;
    }

    return h;
  }
}
