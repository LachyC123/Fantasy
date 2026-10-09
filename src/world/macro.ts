/**
 * Macro geography: the continuous base height field before roads and building
 * pads are graded into it.
 *
 * The opening region ("The Vale of Unwritten Days") is an authored anchor
 * composition with seeded variation: a forested southern ridge where the
 * player wakes, a long green valley running north, a crag carrying the great
 * castle, and blue mountains on the horizon. Around the anchor the field
 * blends into open procedural countryside that never ends.
 */
import { Noise2D } from '../core/noise';
import { deriveSeed, Rng } from '../core/rng';
import { smoothstep } from '../core/math';

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

  /**
   * Weight of the authored vale composition at a point: 1 inside the vale, easing to 0 over its
   * rim, where the open procedural countryside takes over.
   */
  anchorWeight(x: number, z: number): number {
    const ex = (x - this.centerline(z)) / 1900;
    const ez = (z + 800) / (z < -800 ? 1750 : 1250);
    return 1 - smoothstep(0.82, 1.22, Math.sqrt(ex * ex + ez * ez));
  }

  /** Base height in metres: the vale blended into the open world. */
  height(x: number, z: number): number {
    const a = this.anchorWeight(x, z);
    if (a >= 1) return this.valeHeight(x, z);
    const wild = this.wildHeight(x, z);
    if (a <= 0) return wild;
    return wild + (this.valeHeight(x, z) - wild) * a;
  }

  /**
   * The open countryside: broad lowlands and uplands, rolling hills, and mountain ranges that
   * rise in some places and leave low passes between their peaks. A range is placed deliberately
   * north of the vale, so the opening vista always has blue mountains on the horizon.
   */
  wildHeight(x: number, z: number): number {
    const nd = this.nDetail;
    const ns = this.nShape;
    const wx = x + 90 * this.nWarp.sample(x / 900, z / 900);
    const wz = z + 90 * this.nWarp.sample(x / 900 + 40, z / 900 - 40);
    const cont = ns.fbm(wx / 5200 + 17.3, wz / 5200 - 5.1, 3);
    const up = smoothstep(-0.3, 0.55, cont);
    let h = 18 + 105 * up + 28 * ns.fbm(wx / 1300 + 3.7, wz / 1300, 3);
    h += (5 + 20 * up) * ns.fbm(wx / 420 + 3.1, wz / 420 - 8.2, 3);
    h += 2.2 * nd.fbm(wx / 70, wz / 70, 3);
    // Mountain ranges: sparse, with passes where the range mask dips.
    let mm = smoothstep(0.38, 0.7, this.nRidge.fbm(x / 9000 + 31.4, z / 9000 - 12.9, 2));
    // The northern range behind the castle.
    const rz = z + 700 * ns.fbm(x / 2600 + 4.4, 0.37, 3);
    mm = Math.max(mm, smoothstep(-2900, -4300, rz) * smoothstep(-8600, -6400, rz) * (1 - smoothstep(5000, 9000, Math.abs(x + 900 * ns.sample(z / 3000, 7.7)))));
    if (mm > 0) {
      const pass = smoothstep(-0.35, 0.25, ns.fbm(x / 1700 - 9.3, z / 1700 + 2.2, 2));
      h += mm * (60 + 520 * this.nRidge.ridged(wx / 1500, wz / 1500, 4) * (0.35 + 0.65 * pass));
    }
    return h;
  }

  /** The authored vale composition (valid where `anchorWeight` > 0). */
  valeHeight(x: number, z: number): number {
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
    h += ridgeT * p.ridgeHeight + Math.min(60, Math.max(0, z - 40) * 0.06);
    h += ridgeT * 5 * nd.fbm(wx / 120, wz / 120, 3);

    // Castle crag with a flat summit.
    const cdx = x - p.castleX;
    const cdz = z - p.castleZ;
    const cd = Math.sqrt(cdx * cdx + cdz * cdz);
    const cragFall = 1 - smoothstep(p.plateauRadius - 10, p.plateauRadius + 300, cd + 35 * ns.sample(x / 160, z / 160));
    h += p.cragHeight * Math.pow(cragFall, 0.85);
    // Rocky ribs on the crag's flanks (only evaluated where they matter).
    if (cragFall > 0.001 && cragFall < 0.999) h += 9 * cragFall * (1 - cragFall) * 4 * (this.nRidge.ridged(x / 90, z / 90, 3) - 0.4);

    // Hills behind the castle.
    const north = smoothstep(-1950, -2600, z);
    if (north > 0) h += north * (35 + 45 * ns.fbm(wx / 450, wz / 450, 3));
    return h;
  }
}
