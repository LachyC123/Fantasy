/**
 * Contextual ecology: forest density, species choice and deterministic
 * scattering. Every decision is a function of world position + seed (hashed
 * per grid cell), so scattering is independent of chunk size and load order.
 */
import { Noise2D } from '../core/noise';
import { deriveSeed, hashInts } from '../core/rng';
import { smoothstep, distSqToSegment, clamp } from '../core/math';
import type { TerrainLike } from './terrain';
import type { WorldContent } from './types';
import { padDistance } from './terrain';

/** Where ecology finds the planned content that keeps a spot free of trees. */
export interface ContentSource {
  contentsNear(x: number, z: number): readonly WorldContent[];
}

/** A single planned area as a content source (tests, tools, the vale alone). */
export function singleSource(c: WorldContent): ContentSource {
  const list = [c];
  return { contentsNear: () => list };
}
import { pointInObb } from './geometry2d';

export type TreeSpecies = 'oak' | 'beech' | 'birch' | 'pine' | 'poplar' | 'willow' | 'dead';
export const TREE_SPECIES: readonly TreeSpecies[] = ['oak', 'beech', 'birch', 'pine', 'poplar', 'willow', 'dead'];

export type GroundLayer = 'bush' | 'fern' | 'flower' | 'rock' | 'boulder' | 'log' | 'mushroom' | 'grass' | 'wheat' | 'stump';

export interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** Variant index among the species' generated meshes. */
  variant: number;
  /** Small per-instance colour jitter in [0,1]. */
  tint: number;
}

const hash01 = (seed: number, ...k: number[]): number => hashInts(seed, ...k) / 4294967296;

export class Ecology {
  private readonly nForest: Noise2D;
  private readonly nMoist: Noise2D;
  private readonly nEdge: Noise2D;
  private readonly nMeadow: Noise2D;
  private readonly nWoods: Noise2D;
  private readonly nBiome: Noise2D;
  private readonly seedTrees: number;
  private readonly seedGround: number;

  constructor(
    readonly seed: string,
    readonly terrain: TerrainLike,
    readonly source: ContentSource,
  ) {
    this.nForest = new Noise2D(deriveSeed(seed, 'ecology/forest'));
    this.nMoist = new Noise2D(deriveSeed(seed, 'ecology/moisture'));
    this.nEdge = new Noise2D(deriveSeed(seed, 'ecology/edge'));
    this.nMeadow = new Noise2D(deriveSeed(seed, 'ecology/meadow'));
    this.nWoods = new Noise2D(deriveSeed(seed, 'ecology/woods'));
    this.nBiome = new Noise2D(deriveSeed(seed, 'ecology/biome'));
    this.seedTrees = deriveSeed(seed, 'vegetation/trees');
    this.seedGround = deriveSeed(seed, 'vegetation/ground');
  }

  /** Regional character in [-1, 1]: high = pine country, low = birch heath. */
  biome(x: number, z: number): number {
    return this.nBiome.fbm(x / 3600 + 3.3, z / 3600 - 1.7, 2) * 1.6;
  }

  /** Moisture proxy in [0,1]: low ground and noise. */
  moisture(x: number, z: number, h: number): number {
    return clamp(0.5 + 0.45 * this.nMoist.fbm(x / 340, z / 340, 3) - h / 400, 0, 1);
  }

  /** Raw forest suitability before exclusions (cheap; usable for terrain tint). */
  forestBase(x: number, z: number, h: number): number {
    const a = this.terrain.macro.anchorWeight(x, z);
    let f = 0;
    if (a > 0) f += a * this.valeForest(x, z);
    if (a < 1) f += (1 - a) * this.wildForest(x, z, h);
    // Mountain conifer belt and tree line.
    f *= 1 - smoothstep(330, 430, h);
    return clamp(f, 0, 1);
  }

  /** The open countryside: great woods, scattered copses, thinner on high moors. */
  private wildForest(x: number, z: number, h: number): number {
    const woods = smoothstep(0.05, 0.38, this.nWoods.fbm(x / 1100 + 5.1, z / 1100 - 2.4, 3) + 0.25 * this.nEdge.fbm(x / 140, z / 140, 2));
    const copse = smoothstep(0.24, 0.44, this.nForest.fbm(x / 230, z / 230, 3));
    const moor = 1 - 0.55 * smoothstep(170, 280, h);
    return Math.max(woods, copse) * moor;
  }

  /** The authored vale's forests (valid where the anchor weight is above zero). */
  private valeForest(x: number, z: number): number {
    const macro = this.terrain.macro;
    const p = macro.params;
    // Southern ridge forest with a ragged edge.
    const edge = p.forestEdgeZ + 28 * this.nEdge.fbm(x / 140, 0.5, 3);
    let f = smoothstep(edge - 6, edge + 18, z);
    // Woodland copses scattered across the valley floor.
    const copse = this.nForest.fbm(x / 230, z / 230, 3);
    f = Math.max(f, smoothstep(0.22, 0.42, copse));
    // Forested valley walls.
    const dx = Math.abs(x - macro.centerline(z));
    f = Math.max(f, smoothstep(380, 620, dx) * smoothstep(-0.25, 0.15, this.nForest.fbm(x / 160 + 30, z / 160, 2)));
    // Crag woodland beneath the castle.
    const cd = Math.hypot(x - p.castleX, z - p.castleZ);
    f = Math.max(f, smoothstep(p.plateauRadius + 300, p.plateauRadius + 60, cd) * smoothstep(-0.35, 0.3, this.nForest.sample(x / 70, z / 70)) * 0.8);
    return f;
  }

  /** True when a point must stay free of vegetation (roads, sites, fields). */
  blocked(x: number, z: number, clearance: number): boolean {
    if (this.terrain.roadIndex.surfaceDistance(x, z) < clearance + 0.8) return true;
    for (const plan of this.source.contentsNear(x, z)) {
      for (const b of plan.buildings) {
        if (Math.abs(b.x - x) > 25 || Math.abs(b.z - z) > 25) continue;
        if (pointInObb({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2, hd: b.depth / 2 }, x, z, clearance + 1.5)) return true;
      }
      for (const f of plan.fields) {
        if (Math.abs(f.x - x) > 60 || Math.abs(f.z - z) > 60) continue;
        if (pointInObb({ x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2, hd: f.depth / 2 }, x, z, clearance * 0.5)) return true;
      }
      for (const r of plan.ruins) if (Math.hypot(r.x - x, r.z - z) < r.radius + clearance + 2) return true;
      for (const p of plan.props) if (Math.abs(p.x - x) < clearance + 1.5 && Math.abs(p.z - z) < clearance + 1.5) return true;
      for (const fe of plan.fences) {
        for (let i = 0; i < fe.points.length - 1; i++) {
          const a = fe.points[i]!;
          const b = fe.points[i + 1]!;
          if (Math.min(a.x, b.x) - clearance - 2 > x || Math.max(a.x, b.x) + clearance + 2 < x) continue;
          if (distSqToSegment(x, z, a.x, a.z, b.x, b.z).d2 < (clearance + 0.9) ** 2) return true;
        }
      }
      for (const c of plan.castles) if (Math.hypot(c.x - x, c.z - z) < c.plateauRadius + 2) return true;
    }
    return false;
  }

  /** Forest density after clearings, sightline and settlement exclusions. */
  forestDensity(x: number, z: number): number {
    return this.forestDensityAt(x, z, this.terrain.height(x, z));
  }

  /** As forestDensity, reusing a height the caller already sampled. */
  forestDensityAt(x: number, z: number, h: number): number {
    let f = this.forestBase(x, z, h);
    if (f <= 0) return 0;
    for (const plan of this.source.contentsNear(x, z)) {
      for (const c of plan.clearings) {
        const r = c.radius * 1.6;
        if (Math.abs(c.x - x) > r || Math.abs(c.z - z) > r) continue;
        f *= smoothstep(c.radius * 0.8, r, Math.hypot(c.x - x, c.z - z));
      }
      const s = plan.sightline;
      if (s) {
        const seg = distSqToSegment(x, z, s.from.x, s.from.z, s.to.x, s.to.z);
        const along = seg.t * Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z);
        const hw = s.halfWidth + along * s.spread;
        const sd = Math.sqrt(seg.d2);
        if (seg.t > 0.001) f *= smoothstep(hw * 0.75, hw * 1.5, sd);
      }
      for (const pad of plan.pads) {
        const reach = Math.max(pad.halfW, pad.halfD) * 1.5 + 14;
        if (Math.abs(pad.x - x) > reach || Math.abs(pad.z - z) > reach) continue;
        f *= smoothstep(4, 14, padDistance(pad, x, z));
      }
    }
    // Roads keep open, sunlit verges so travellers can see where they are going.
    // (Forest footpaths stay enclosed and shadowy on purpose.)
    const hit = this.terrain.roadIndex.query(x, z);
    if (hit && hit.road.kind === 'trade-road') f *= 0.2 + 0.8 * smoothstep(1.5, hit.road.blend, hit.dist - hit.road.halfWidth);
    return f;
  }

  speciesAt(x: number, z: number, h: number, r: number): TreeSpecies {
    const m = this.moisture(x, z, h);
    if (h > 240) return r < 0.85 ? 'pine' : 'dead';
    if (h > 120) return r < 0.55 ? 'pine' : r < 0.75 ? 'birch' : r < 0.95 ? 'oak' : 'dead';
    // Regional character beyond the vale: pine country and birch heaths.
    if (this.terrain.macro.anchorWeight(x, z) < 0.5) {
      const bio = this.biome(x, z);
      if (bio > 0.35) return r < 0.6 ? 'pine' : r < 0.75 ? 'birch' : r < 0.92 ? 'oak' : 'dead';
      if (bio < -0.35) return r < 0.5 ? 'birch' : r < 0.7 ? 'oak' : r < 0.82 ? 'pine' : m > 0.6 ? 'willow' : 'beech';
    }
    if (m > 0.68 && r < 0.25) return 'willow';
    if (r < 0.34) return 'oak';
    if (r < 0.54) return 'beech';
    if (r < 0.7) return 'birch';
    if (r < 0.84) return 'pine';
    if (r < 0.94) return 'poplar';
    return 'dead';
  }

  /**
   * Trees in the axis-aligned square [x0,x0+size)×[z0,z0+size). Cells are 6 m;
   * a jittered sample per cell is kept with probability = forest density.
   */
  scatterTrees(x0: number, z0: number, size: number): Map<TreeSpecies, Placement[]> {
    const out = new Map<TreeSpecies, Placement[]>();
    const cell = 6;
    const seed = this.seedTrees;
    // A sample belongs to the chunk containing its jittered position, so the
    // result is independent of chunk size and load order.
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor((x0 + size) / cell); cx++) {
      for (let cz = Math.floor(z0 / cell); cz <= Math.floor((z0 + size) / cell); cz++) {
        const x = (cx + hash01(seed, cx, cz, 1)) * cell;
        const z = (cz + hash01(seed, cx, cz, 2)) * cell;
        if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
        const keep = hash01(seed, cx, cz, 3);
        let density = this.forestDensity(x, z);
        // Lone meadow trees: rare, graceful, keep the valley from feeling empty.
        if (density < 0.05) density = 0.012 * smoothstep(0.1, 0.5, this.nMeadow.sample(x / 90, z / 90));
        if (keep >= density) continue;
        if (this.blocked(x, z, 2.2)) continue;
        if (this.terrain.slope(x, z) > 1.0) continue;
        const h = this.terrain.height(x, z);
        const species = this.speciesAt(x, z, h, hash01(seed, cx, cz, 4));
        let list = out.get(species);
        if (!list) out.set(species, (list = []));
        list.push({
          x,
          y: h - 0.25,
          z,
          yaw: hash01(seed, cx, cz, 5) * Math.PI * 2,
          scale: 0.75 + hash01(seed, cx, cz, 6) * 0.55,
          variant: Math.floor(hash01(seed, cx, cz, 7) * 4),
          tint: hash01(seed, cx, cz, 8),
        });
      }
    }
    return out;
  }

  /** Ground cover layers (bushes, ferns, flowers, rocks, logs, mushrooms). */
  scatterGround(x0: number, z0: number, size: number): Map<GroundLayer, Placement[]> {
    const out = new Map<GroundLayer, Placement[]>();
    const push = (layer: GroundLayer, p: Placement): void => {
      let list = out.get(layer);
      if (!list) out.set(layer, (list = []));
      list.push(p);
    };
    const seed = this.seedGround;
    const cell = 3;
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor((x0 + size) / cell); cx++) {
      for (let cz = Math.floor(z0 / cell); cz <= Math.floor((z0 + size) / cell); cz++) {
        const r = hash01(seed, cx, cz, 0);
        const x = (cx + hash01(seed, cx, cz, 1)) * cell;
        const z = (cz + hash01(seed, cx, cz, 2)) * cell;
        if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
        const h = this.terrain.height(x, z);
        if (h > 380) continue;
        const forest = this.forestDensity(x, z);
        const meadow = this.nMeadow.fbm(x / 60, z / 60, 2);
        let layer: GroundLayer | null = null;
        if (forest > 0.4) {
          if (r < 0.2) layer = 'fern';
          else if (r < 0.3) layer = 'bush';
          else if (r < 0.325) layer = 'mushroom';
          else if (r < 0.333) layer = 'log';
          else if (r < 0.338) layer = 'stump';
          else if (r < 0.355) layer = 'rock';
        } else {
          const edge = smoothstep(0.05, 0.35, forest);
          if (r < 0.04 + edge * 0.18) layer = 'bush';
          else if (r < 0.06 + edge * 0.18 + Math.max(0, meadow) * 0.25) layer = 'flower';
          else if (r < 0.075 + edge * 0.18 + Math.max(0, meadow) * 0.25) layer = 'rock';
          else if (r < 0.0765 + edge * 0.18 + Math.max(0, meadow) * 0.25) layer = 'boulder';
        }
        if (!layer) continue;
        const clearance = layer === 'flower' || layer === 'fern' || layer === 'mushroom' ? 0.6 : 1.4;
        if (this.blocked(x, z, clearance)) continue;
        const slope = this.terrain.slope(x, z);
        if (slope > 1.1 && layer !== 'rock' && layer !== 'boulder') continue;
        push(layer, {
          x,
          y: h,
          z,
          yaw: hash01(seed, cx, cz, 5) * Math.PI * 2,
          scale: 0.7 + hash01(seed, cx, cz, 6) * 0.6,
          variant: Math.floor(hash01(seed, cx, cz, 7) * 4),
          tint: hash01(seed, cx, cz, 8),
        });
      }
    }
    return out;
  }

  /** Grass tufts (and crops inside fields) near the player; 1.4 m cells. */
  scatterGrass(x0: number, z0: number, size: number): { grass: Placement[]; wheat: Placement[] } {
    const grass: Placement[] = [];
    const wheat: Placement[] = [];
    const seed = this.seedGround ^ 0x5bd1e995;
    const cell = 1.4;
    const fields: WorldContent['fields'] = [];
    const houses: WorldContent['buildings'] = [];
    for (const [qx, qz] of [
      [x0, z0],
      [x0 + size, z0],
      [x0, z0 + size],
      [x0 + size, z0 + size],
    ] as const) {
      for (const plan of this.source.contentsNear(qx, qz)) {
        for (const f of plan.fields) if (!fields.includes(f) && Math.abs(f.x - (x0 + size / 2)) < size + 60 && Math.abs(f.z - (z0 + size / 2)) < size + 60) fields.push(f);
        for (const b of plan.buildings) if (!houses.includes(b) && Math.abs(b.x - (x0 + size / 2)) < size + 20 && Math.abs(b.z - (z0 + size / 2)) < size + 20) houses.push(b);
      }
    }
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor((x0 + size) / cell); cx++) {
      for (let cz = Math.floor(z0 / cell); cz <= Math.floor((z0 + size) / cell); cz++) {
        const x = (cx + hash01(seed, cx, cz, 1)) * cell;
        const z = (cz + hash01(seed, cx, cz, 2)) * cell;
        if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
        const r = hash01(seed, cx, cz, 0);
        let inField: (typeof fields)[number] | undefined;
        for (const f of fields) {
          if (pointInObb({ x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2 - 1, hd: f.depth / 2 - 1 }, x, z)) {
            inField = f;
            break;
          }
        }
        if (inField) {
          if (inField.crop === 'wheat' || inField.crop === 'barley') {
            wheat.push({ x, y: this.terrain.height(x, z), z, yaw: r * 6.283, scale: 0.8 + r * 0.4, variant: inField.crop === 'wheat' ? 0 : 1, tint: hash01(seed, cx, cz, 3) });
          }
          continue;
        }
        // Never through a floor.
        if (houses.some((b) => pointInObb({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2, hd: b.depth / 2 }, x, z, 0.3))) continue;
        const h = this.terrain.height(x, z);
        if (h > 330) continue;
        const road = this.terrain.roadIndex.surfaceDistance(x, z);
        if (road < 0.3) continue;
        const density = road < 1.5 ? 0.35 : 0.85;
        if (r > density) continue;
        grass.push({ x, y: h, z, yaw: r * 40, scale: 0.65 + hash01(seed, cx, cz, 4) * 0.7, variant: 0, tint: hash01(seed, cx, cz, 3) });
      }
    }
    return { grass, wheat };
  }
}
