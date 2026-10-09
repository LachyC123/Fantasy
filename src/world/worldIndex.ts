/**
 * The whole open world as one queryable thing. Areas (the vale and every
 * procedural region) are planned lazily on first use and cached; any thread
 * that asks about the same point gets the same answer because every area is a
 * pure function of the seed. Far-away terrain can be shaped from region
 * skeletons alone (castle summits) without planning roads and buildings.
 */
import type { MacroField } from './macro';
import { RoadIndex, type RoadHit } from './roads';
import { applyPads, type RoadLookup, type TerrainLike } from './terrain';
import { cellOf, inVale, REGION, regionSkeleton, type RegionSkeleton } from './regions';
import { planRegion } from './regionPlan';
import { castlePad } from './contentBuilder';
import type { Pad, RegionPlan, WorldContent, WorldPlan } from './types';

/** One planned area with its spatial indices. */
export class Area {
  readonly roads: RoadIndex;
  lastUsed = 0;
  constructor(readonly content: WorldContent) {
    this.roads = new RoadIndex(content.roads);
  }
}

const key = (rx: number, rz: number): number => (rx + 32768) * 65536 + (rz + 32768);
/** Content and road grading reach at most this far past an area's border (gate roads). */
const MARGIN = 24;

export class WorldIndex {
  readonly valeArea: Area;
  private readonly areas = new Map<number, Area>();
  private readonly skeletons = new Map<number, RegionSkeleton>();
  private readonly skeletonPads = new Map<number, readonly Pad[]>();
  private readonly near: Area[] = [];
  private clock = 0;
  /** Planned regions are kept until this many are cached, then the least recently used go. */
  capacity = 72;
  /** Called after a region is planned on this thread (main-thread fallback accounting). */
  onPlanned: ((rx: number, rz: number, ms: number) => void) | null = null;

  constructor(
    readonly seed: string,
    readonly macro: MacroField,
    readonly vale: WorldPlan,
  ) {
    this.valeArea = new Area(vale);
  }

  has(rx: number, rz: number): boolean {
    return inVale(rx, rz) || this.areas.has(key(rx, rz));
  }

  /** Adopt a region planned elsewhere (a worker). Identical to planning it here. */
  adopt(plan: RegionPlan): Area {
    const k = key(plan.rx, plan.rz);
    let a = this.areas.get(k);
    if (!a) {
      a = new Area(plan);
      this.areas.set(k, a);
      this.trim();
    }
    a.lastUsed = ++this.clock;
    return a;
  }

  /** The area owning a cell, planning it now if needed. */
  area(rx: number, rz: number): Area {
    if (inVale(rx, rz)) return this.valeArea;
    const k = key(rx, rz);
    let a = this.areas.get(k);
    if (!a) {
      const t0 = performance.now();
      a = new Area(planRegion(this.seed, this.macro, rx, rz, this.skeleton(rx, rz) ?? undefined));
      this.areas.set(k, a);
      this.onPlanned?.(rx, rz, performance.now() - t0);
      this.trim();
    }
    a.lastUsed = ++this.clock;
    return a;
  }

  /** Cheap first stage of a region (null inside the vale). */
  skeleton(rx: number, rz: number): RegionSkeleton | null {
    if (inVale(rx, rz)) return null;
    const k = key(rx, rz);
    let s = this.skeletons.get(k);
    if (!s) {
      s = regionSkeleton(this.seed, this.macro, rx, rz);
      if (this.skeletons.size > 4000) this.skeletons.clear();
      this.skeletons.set(k, s);
    }
    return s;
  }

  region(rx: number, rz: number): RegionPlan | null {
    return inVale(rx, rz) ? null : (this.area(rx, rz).content as RegionPlan);
  }

  private trim(): void {
    if (this.areas.size <= this.capacity) return;
    const list = [...this.areas.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (let i = 0; i < list.length - this.capacity; i++) this.areas.delete(list[i]![0]);
  }

  /** Areas whose content can affect a point (its own, plus neighbours within the margin). Reused array. */
  areasNear(x: number, z: number): Area[] {
    const out = this.near;
    out.length = 0;
    const rx = cellOf(x);
    const rz = cellOf(z);
    const own = this.area(rx, rz);
    out.push(own);
    const fx = x - rx * REGION;
    const fz = z - rz * REGION;
    const dx = fx < MARGIN ? -1 : fx > REGION - MARGIN ? 1 : 0;
    const dz = fz < MARGIN ? -1 : fz > REGION - MARGIN ? 1 : 0;
    if (dx || dz) {
      const add = (cx: number, cz: number): void => {
        const a = this.area(cx, cz);
        if (!out.includes(a)) out.push(a);
      };
      if (dx) add(rx + dx, rz);
      if (dz) add(rx, rz + dz);
      if (dx && dz) add(rx + dx, rz + dz);
    }
    return out;
  }

  /** Content near a point (for ecology and colouring). Reused array. */
  contentsNear(x: number, z: number): readonly WorldContent[] {
    const out = this.nearContent;
    out.length = 0;
    for (const a of this.areasNear(x, z)) out.push(a.content);
    return out;
  }
  private readonly nearContent: WorldContent[] = [];

  /** Every planned area currently cached (plus the vale). */
  get cached(): Area[] {
    return [this.valeArea, ...this.areas.values()];
  }

  /** Summit pads near a point from skeletons only (for distant terrain). */
  farPads(x: number, z: number): readonly Pad[] {
    const rx = cellOf(x);
    const rz = cellOf(z);
    if (inVale(rx, rz)) return this.vale.prePads;
    const k = key(rx, rz);
    let pads = this.skeletonPads.get(k);
    if (!pads) {
      const s = this.skeleton(rx, rz);
      pads = s && s.castles.length ? s.castles.map(castlePad) : NO_PADS;
      if (this.skeletonPads.size > 4000) this.skeletonPads.clear();
      this.skeletonPads.set(k, pads);
    }
    return pads;
  }
}

const NO_PADS: readonly Pad[] = [];

/** Final terrain over the whole world: macro → summit pads → every nearby area's roads → building pads. */
export class WorldTerrain implements TerrainLike {
  readonly roadIndex: RoadLookup;

  constructor(readonly index: WorldIndex) {
    const idx = index;
    this.roadIndex = {
      query(x: number, z: number): RoadHit | null {
        let best: RoadHit | null = null;
        for (const a of idx.areasNear(x, z)) {
          const h = a.roads.query(x, z);
          if (h && (!best || h.weight > best.weight || (h.weight === best.weight && h.dist < best.dist))) best = h;
        }
        return best;
      },
      surfaceDistance(x: number, z: number): number {
        let d = Infinity;
        for (const a of idx.areasNear(x, z)) d = Math.min(d, a.roads.surfaceDistance(x, z));
        return d;
      },
    };
  }

  get macro(): MacroField {
    return this.index.macro;
  }

  heightBeforeRoads(x: number, z: number): number {
    let h = this.index.macro.height(x, z);
    for (const a of this.index.areasNear(x, z)) if (a.content.prePads.length) h = applyPads(a.content.prePads, h, x, z);
    return h;
  }

  heightBeforeBuildings(x: number, z: number): number {
    let h = this.heightBeforeRoads(x, z);
    const hit = this.roadIndex.query(x, z);
    if (hit) h += (hit.height - h) * hit.weight;
    return h;
  }

  height(x: number, z: number): number {
    let h = this.heightBeforeBuildings(x, z);
    for (const a of this.index.areasNear(x, z)) if (a.content.pads.length) h = applyPads(a.content.pads, h, x, z);
    return h;
  }

  /** Distant terrain: macro and castle summits only (no planning needed). */
  heightFar(x: number, z: number): number {
    const pads = this.index.farPads(x, z);
    const h = this.index.macro.height(x, z);
    return pads.length ? applyPads(pads, h, x, z) : h;
  }

  normal(x: number, z: number, eps = 0.75): { x: number; y: number; z: number } {
    const hx = this.height(x + eps, z) - this.height(x - eps, z);
    const hz = this.height(x, z + eps) - this.height(x, z - eps);
    const len = Math.hypot(-hx, 2 * eps, -hz);
    return { x: -hx / len, y: (2 * eps) / len, z: -hz / len };
  }

  slope(x: number, z: number, eps = 0.75): number {
    const hx = (this.height(x + eps, z) - this.height(x - eps, z)) / (2 * eps);
    const hz = (this.height(x, z + eps) - this.height(x, z - eps)) / (2 * eps);
    return Math.hypot(hx, hz);
  }
}
