/**
 * Shared planning workspace for one area of the world (a procedural region or
 * the opening vale): staged terrain (macro → summit pads → roads), routed
 * roads that join the network at T-junctions, footprint checks, building
 * records, and the final pass that seats buildings and emits pads.
 */
import { deriveSeed, Rng } from '../core/rng';
import { distSqToSegment } from '../core/math';
import type { MacroField } from './macro';
import { buildRoad, type RoadSpec } from './roads';
import { findPath } from './pathfind';
import { Terrain } from './terrain';
import { obbOverlap, obbSamples, pointInObb, type Obb } from './geometry2d';
import { localToWorld } from './castle';
import type { BuildingKind, BuildingPlan, Bounds, CastlePlan, FencePlan, Gate, P2, Pad, RoadKind, RoadPlan, RoofMaterial, WallStyle, WorldContent } from './types';

export const castlePad = (c: CastlePlan): Pad => ({ x: c.x, z: c.z, yaw: 0, halfW: c.plateauRadius, halfD: c.plateauRadius, circle: true, height: c.plateauHeight, falloff: 28 });

export const buildingObb = (b: { x: number; z: number; yaw: number; width: number; depth: number }): Obb => ({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2, hd: b.depth / 2 });

export const facing = (fromX: number, fromZ: number, toX: number, toZ: number): number => Math.atan2(toX - fromX, toZ - fromZ);

export interface Reserve {
  id: string;
  x: number;
  z: number;
  r: number;
}

const ROAD_STYLE: Record<RoadKind, { halfWidth: number; blend: number; maxGrade: number; smoothRadius: number }> = {
  'trade-road': { halfWidth: 2.4, blend: 9, maxGrade: 0.18, smoothRadius: 6 },
  'farm-track': { halfWidth: 1.5, blend: 5, maxGrade: 0.24, smoothRadius: 3 },
  footpath: { halfWidth: 1.1, blend: 4, maxGrade: 0.28, smoothRadius: 3 },
};

export interface RouteOptions {
  id: string;
  name: string;
  kind: RoadKind;
  from: string;
  /** Start point (a site) — or a border gate, entered straight along its normal. */
  start: P2;
  gate?: Gate;
  /** Height to pin the start to (defaults to the graded ground there). */
  startHeight?: number;
  /** Reserves the road may enter (its own site). */
  allow?: string[];
  /** Explicit goal points (defaults to the existing road network). */
  goals?: { p: P2; h: number; id: string }[];
  /** Fixed control points to prepend after the start (e.g. a castle gate approach). */
  lead?: P2[];
}

export interface Junction {
  road: RoadPlan | null;
  index: number;
  p: P2;
}

export class ContentBuilder {
  readonly c: WorldContent;
  reserves: Reserve[] = [];
  private stage: Terrain | null = null;
  private stageA: Terrain | null = null;
  private readonly hCache = new Map<number, number>();
  /** Junctions made by `route` (for signposts). */
  readonly junctions: { at: P2; road: RoadPlan; towards: string; name: string }[] = [];

  constructor(
    readonly seed: string,
    readonly macro: MacroField,
    id: string,
    bounds: Bounds,
    init: Partial<WorldContent> = {},
  ) {
    this.c = {
      id,
      bounds,
      castles: init.castles ?? [],
      ruins: init.ruins ?? [],
      settlements: init.settlements ?? [],
      buildings: init.buildings ?? [],
      roads: init.roads ?? [],
      fields: init.fields ?? [],
      fences: init.fences ?? [],
      pads: init.pads ?? [],
      clearings: init.clearings ?? [],
      props: init.props ?? [],
      finds: init.finds ?? [],
      prePads: init.prePads ?? (init.castles ?? []).map(castlePad),
      sites: init.sites ?? [],
      gates: init.gates ?? [],
      sightline: init.sightline,
    };
  }

  /** Ground before roads (macro + summit pads). */
  get terrainA(): Terrain {
    return (this.stageA ??= new Terrain(this.macro, this.c.prePads, [], []));
  }

  /** Ground with the current roads graded in (no building pads yet). */
  get terrain(): Terrain {
    return (this.stage ??= new Terrain(this.macro, this.c.prePads, this.c.roads, []));
  }

  heightA(x: number, z: number): number {
    // Route searches revisit grid points; cache them (grid points are whole metres).
    const key = Math.round(x) * 1048576 + Math.round(z);
    let h = this.hCache.get(key);
    if (h === undefined) {
      h = this.terrainA.heightBeforeRoads(x, z);
      if (this.hCache.size > 60000) this.hCache.clear();
      this.hCache.set(key, h);
    }
    return h;
  }

  heightB(x: number, z: number): number {
    return this.terrain.heightBeforeBuildings(x, z);
  }

  addRoad(r: RoadPlan): void {
    this.c.roads.push(r);
    this.stage = null;
  }

  removeRoad(id: string): void {
    const i = this.c.roads.findIndex((r) => r.id === id);
    if (i >= 0) {
      this.c.roads.splice(i, 1);
      this.stage = null;
    }
  }

  addCastle(c: CastlePlan): void {
    this.c.castles.push(c);
    this.c.prePads.push(castlePad(c));
    this.stage = null;
    this.stageA = null;
    this.hCache.clear();
  }

  /** Every 3rd sample of every road: where new roads may join. */
  networkGoals(exclude?: (r: RoadPlan) => boolean): { p: P2; h: number; id: string; road: RoadPlan; index: number }[] {
    const out: { p: P2; h: number; id: string; road: RoadPlan; index: number }[] = [];
    for (const r of this.c.roads) {
      if (exclude?.(r)) continue;
      // Join at least ~10 m from a road's ends so junctions never pile onto gates or doors.
      for (let i = 5; i < r.points.length - 5; i += 3) out.push({ p: r.points[i]!, h: r.heights[i]!, id: r.id, road: r, index: i });
    }
    return out;
  }

  get hasNetwork(): boolean {
    return this.c.roads.some((r) => r.kind !== 'farm-track' && r.kind !== 'footpath') || this.c.roads.length > 0;
  }

  /** Nearest point on the network (any road). */
  nearestRoadPoint(x: number, z: number, kinds?: RoadKind[]): { road: RoadPlan; index: number; p: P2; dist: number } | null {
    let best: { road: RoadPlan; index: number; p: P2; dist: number } | null = null;
    for (const r of this.c.roads) {
      if (kinds && !kinds.includes(r.kind)) continue;
      for (let i = 0; i < r.points.length; i++) {
        const p = r.points[i]!;
        const d = Math.hypot(p.x - x, p.z - z);
        if (!best || d < best.dist) best = { road: r, index: i, p, dist: d };
      }
    }
    return best;
  }

  /** Cost multiplier for routing a road over this point. */
  private penalty(x: number, z: number, allow: Set<string>): number {
    const b = this.c.bounds;
    for (const r of this.reserves) {
      if (allow.has(r.id)) continue;
      const dx = x - r.x;
      const dz = z - r.z;
      if (dx * dx + dz * dz < r.r * r.r) return Infinity;
    }
    for (const bd of this.c.buildings) {
      if (Math.abs(bd.x - x) > 30 || Math.abs(bd.z - z) > 30) continue;
      if (pointInObb(buildingObb(bd), x, z, 6)) return Infinity;
    }
    for (const f of this.c.fields) {
      if (Math.abs(f.x - x) > 50 || Math.abs(f.z - z) > 50) continue;
      if (pointInObb({ x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2, hd: f.depth / 2 }, x, z, 5)) return Infinity;
    }
    for (const ru of this.c.ruins) if (Math.hypot(ru.x - x, ru.z - z) < ru.radius + 8) return Infinity;
    for (const c of this.c.castles) if (!allow.has(c.id) && Math.hypot(c.x - x, c.z - z) < c.plateauRadius + 10) return Infinity;
    for (const fe of this.c.fences) {
      for (let i = 0; i < fe.points.length - 1; i++) {
        const a = fe.points[i]!;
        const q = fe.points[i + 1]!;
        if (Math.min(a.x, q.x) - 6 > x || Math.max(a.x, q.x) + 6 < x || Math.min(a.z, q.z) - 6 > z || Math.max(a.z, q.z) + 6 < z) continue;
        if (distSqToSegment(x, z, a.x, a.z, q.x, q.z).d2 < 16) return Infinity;
      }
    }
    // Keep roads away from region borders except where they cross at gates.
    const edge = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
    if (edge < 40) return 4;
    return 1;
  }

  /**
   * Route a road from `start` to the network (or explicit goals) and add it.
   * Returns null if no route exists.
   */
  route(o: RouteOptions): RoadPlan | null {
    const all = o.goals ?? this.networkGoals();
    // Join the network only where its road runs near natural ground level, so the new road
    // can meet it without a step (never onto a raised causeway or into a deep cutting).
    let goals = o.goals ? all : all.filter((g) => Math.abs(g.h - this.heightA(g.p.x, g.p.z)) < 2.5);
    for (let attempt = 0; attempt < 3 && goals.length; attempt++) {
      const res = this.tryRoute(o, goals);
      if (res.road) {
        this.addRoad(res.road);
        return res.road;
      }
      if (!res.goal) return null;
      // Try again, avoiding the part of the network that could not be joined cleanly.
      const bad = res.goal;
      goals = goals.filter((g) => Math.hypot(g.p.x - bad.x, g.p.z - bad.z) > 160);
    }
    return null;
  }

  private tryRoute(o: RouteOptions, goals: { p: P2; h: number; id: string }[]): { road: RoadPlan | null; goal: P2 | null } {
    const style = ROAD_STYLE[o.kind];
    const allow = new Set(o.allow ?? []);
    const lead: P2[] = [];
    let searchFrom = o.start;
    if (o.gate) {
      // Enter straight through the gate so both regions' roads line up across the border.
      const g = o.gate;
      lead.push({ x: g.x + g.inX * 14, z: g.z + g.inZ * 14 });
      searchFrom = { x: g.x + g.inX * 30, z: g.z + g.inZ * 30 };
      lead.push(searchFrom);
    } else if (o.lead) {
      lead.push(...o.lead);
      searchFrom = o.lead[o.lead.length - 1]!;
    }
    const b = this.c.bounds;
    const path = findPath({
      bounds: { x0: b.x0 + 8, z0: b.z0 + 8, x1: b.x1 - 8, z1: b.z1 - 8 },
      cell: 16,
      height: (x, z) => this.heightA(x, z),
      start: searchFrom,
      goals: goals.map((g) => g.p),
      goalRadius: 12,
      penalty: (x, z) => {
        // The search may start inside its own site's reserve.
        if (Math.hypot(x - searchFrom.x, z - searchFrom.z) < 20) return 1;
        return this.penalty(x, z, allow);
      },
      maxGrade: style.maxGrade * 0.8,
    });
    if (!path) return { road: null, goal: null };
    const goal = goals[path.goalIndex]!;
    const edge = (p: P2): number => Math.min(p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z);
    // Searched points near the border are dropped so the spline cannot swing outside the area.
    const searched = path.points.slice(1, -1).filter((p) => edge(p) > 30);
    const control = [o.start, ...lead, ...searched, path.points[path.points.length - 1]!];
    // Drop control points that crowd each other (spline overshoot).
    const ctl: P2[] = [];
    for (const p of control) {
      const q = ctl[ctl.length - 1];
      if (!q || Math.hypot(p.x - q.x, p.z - q.z) > 6 || p === control[control.length - 1]) ctl.push(p);
    }
    if (ctl.length < 2) return { road: null, goal: goal.p };
    const spec: RoadSpec = { id: o.id, name: o.name, kind: o.kind, ...style, control: ctl, from: o.from, to: goal.id };
    const pinStart = o.startHeight !== undefined || o.gate !== undefined;
    const startH = o.startHeight ?? (o.gate ? this.macro.height(o.gate.x, o.gate.z) : undefined);
    const road = buildRoad(spec, (x, z) => this.heightB(x, z), { start: startH, end: goal.h, ease: o.kind === 'trade-road' ? 24 : 12 });
    // Reject roads that cannot honour their pins, leave the area, or brush a building.
    const n = road.heights.length;
    const ok =
      Math.abs(road.heights[n - 1]! - goal.h) < 0.4 &&
      (!pinStart || Math.abs(road.heights[0]! - startH!) < 0.4) &&
      road.points.every((p) => edge(p) > -0.3) &&
      !this.c.buildings.some((bd) => {
        if (Math.abs(bd.x - road.points[0]!.x) > 2000) return false;
        const o2 = buildingObb(bd);
        return road.points.some((p) => Math.abs(p.x - bd.x) < 25 && Math.abs(p.z - bd.z) < 25 && pointInObb(o2, p.x, p.z, road.halfWidth + 1.2));
      });
    return { road: ok ? road : null, goal: goal.p };
  }

  canPlace(o: Obb, roadClear: number, maxSlope: number): boolean {
    const b = this.c.bounds;
    const r = Math.hypot(o.hw, o.hd);
    if (o.x - r < b.x0 + 20 || o.x + r > b.x1 - 20 || o.z - r < b.z0 + 20 || o.z + r > b.z1 - 20) return false;
    for (const bd of this.c.buildings) if (obbOverlap(o, buildingObb(bd), 3)) return false;
    for (const f of this.c.fields) if (obbOverlap(o, { x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2, hd: f.depth / 2 }, 2)) return false;
    for (const ru of this.c.ruins) if (Math.hypot(o.x - ru.x, o.z - ru.z) < ru.radius + r + 8) return false;
    for (const c of this.c.castles) if (Math.hypot(o.x - c.x, o.z - c.z) < c.plateauRadius + r + 20) return false;
    for (const p of this.c.props) if (Math.abs(p.x - o.x) < r + 1.5 && Math.abs(p.z - o.z) < r + 1.5 && pointInObb(o, p.x, p.z, 1.2)) return false;
    for (const fe of this.c.fences)
      for (let i = 0; i < fe.points.length - 1; i++) {
        const a = fe.points[i]!;
        const q = fe.points[i + 1]!;
        if (distSqToSegment(o.x, o.z, a.x, a.z, q.x, q.z).d2 < (r + 1.5) ** 2) return false;
      }
    const t = this.terrain;
    let minH = Infinity;
    let maxH = -Infinity;
    for (const p of obbSamples(o, 2.5)) {
      if (t.roadIndex.surfaceDistance(p.x, p.z) < roadClear) return false;
      const h = t.heightBeforeBuildings(p.x, p.z);
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
    }
    return (maxH - minH) / (Math.max(o.hw, o.hd) * 2) <= maxSlope;
  }

  seatHeight(o: Obb): number {
    const pts = obbSamples(o, 2);
    let sum = 0;
    for (const p of pts) sum += this.heightB(p.x, p.z);
    return sum / pts.length + 0.1;
  }

  makeBuilding(settlementId: string, kind: BuildingKind, x: number, z: number, yaw: number, width: number, depth: number, rng: Rng): BuildingPlan {
    const isBarn = kind === 'barn' || kind === 'shed';
    const civic = kind === 'church';
    const wallStyle: WallStyle = civic ? 'stone' : isBarn ? rng.pick<WallStyle>(['timber', 'stone']) : rng.weighted<WallStyle>(['stone', 'plaster', 'timber'], kind === 'inn' ? [3, 5, 1] : [4, 4, 1]);
    const floors = civic || kind === 'shed' || kind === 'barn' ? 1 : kind === 'inn' ? 2 : rng.chance(kind === 'farmhouse' ? 0.75 : 0.45) ? 2 : 1;
    const roof: RoofMaterial = civic ? 'slate' : isBarn ? rng.pick<RoofMaterial>(['thatch', 'tile']) : rng.weighted<RoofMaterial>(['tile', 'slate', 'thatch'], [5, 3, 2]);
    const plan: BuildingPlan = {
      id: `${this.c.id}/${settlementId}/b${this.c.buildings.length}`,
      kind,
      x,
      z,
      yaw,
      width,
      depth,
      floors,
      wallStyle,
      upperStyle: floors > 1 && wallStyle !== 'timber' ? rng.weighted<WallStyle>(['plaster', 'timber', 'stone'], [5, 2, 1]) : wallStyle,
      roof,
      roofPitch: civic ? rng.range(1.15, 1.35) : rng.range(0.75, 1.05) * (roof === 'thatch' ? 1.1 : 1),
      chimney: civic || isBarn ? 'none' : rng.chance(0.5) ? 'left' : 'right',
      padHeight: 0,
      seed: rng.int(0, 2 ** 31),
      enterable: false,
      settlementId,
      inhabited: !isBarn && !civic && rng.chance(0.85),
    };
    plan.padHeight = this.seatHeight(buildingObb(plan));
    return plan;
  }

  /** Try to place and add a building; returns it or null. */
  tryBuilding(settlementId: string, kind: BuildingKind, x: number, z: number, yaw: number, width: number, depth: number, rng: Rng, roadClear: number, maxSlope: number): BuildingPlan | null {
    const o: Obb = { x, z, yaw, hw: width / 2, hd: depth / 2 };
    if (!this.canPlace(o, roadClear, maxSlope)) return null;
    const b = this.makeBuilding(settlementId, kind, x, z, yaw, width, depth, rng);
    this.c.buildings.push(b);
    return b;
  }

  /** Frame (point, tangent, right-hand normal) at a road sample. */
  static frame(road: RoadPlan, i: number): { p: P2; tx: number; tz: number; nx: number; nz: number } {
    const a = road.points[Math.max(0, i - 2)]!;
    const b = road.points[Math.min(road.points.length - 1, i + 2)]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const tx = (b.x - a.x) / len;
    const tz = (b.z - a.z) / len;
    return { p: road.points[i]!, tx, tz, nx: -tz, nz: tx };
  }

  local(lx: number, lz: number, yaw: number, ox: number, oz: number): P2 {
    return localToWorld(lx, lz, yaw, ox, oz);
  }

  rng(label: string, ...k: number[]): Rng {
    return new Rng(deriveSeed(this.seed, `${this.c.id}/${label}`, ...k));
  }

  /** Walls, hedges and fences open wherever a road passes through them. */
  private cutFences(): void {
    const t = this.terrain;
    const out: FencePlan[] = [];
    for (const fe of this.c.fences) {
      // Resample, then keep runs of points well clear of every road surface.
      const pts: P2[] = [];
      for (let i = 0; i < fe.points.length - 1; i++) {
        const a = fe.points[i]!;
        const b = fe.points[i + 1]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.2));
        for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      }
      pts.push(fe.points[fe.points.length - 1]!);
      let run: P2[] = [];
      let piece = 0;
      let cut = false;
      const flush = (): void => {
        if (run.length >= 3) out.push({ ...fe, id: piece === 0 && !cut ? fe.id : `${fe.id}~${piece}`, points: simplifyLine(run) });
        piece++;
        run = [];
      };
      for (const p of pts) {
        if (t.roadIndex.surfaceDistance(p.x, p.z) < 1.6) {
          cut = true;
          flush();
        } else run.push(p);
      }
      if (!cut) {
        out.push(fe);
        continue;
      }
      flush();
    }
    this.c.fences = out;
  }

  /** Final pass: seat buildings and ruins on the graded ground and emit pads. */
  finalize(extraPads: Pad[] = []): WorldContent {
    this.cutFences();
    const t = this.terrain;
    for (const b of this.c.buildings) b.padHeight = this.seatHeight(buildingObb(b));
    for (const r of this.c.ruins) r.padHeight = t.heightBeforeBuildings(r.x, r.z) + 0.05;
    const pads: Pad[] = [];
    for (const b of this.c.buildings) pads.push({ x: b.x, z: b.z, yaw: b.yaw, halfW: b.width / 2 + 1.4, halfD: b.depth / 2 + 1.4, circle: false, height: b.padHeight, falloff: 7 });
    for (const r of this.c.ruins) pads.push({ x: r.x, z: r.z, yaw: 0, halfW: r.radius + 3, halfD: r.radius + 3, circle: true, height: r.padHeight, falloff: 6 });
    this.c.pads = [...pads, ...extraPads];
    return this.c;
  }
}

/** Drop collinear points from a resampled fence line. */
function simplifyLine(pts: P2[]): P2[] {
  if (pts.length < 3) return pts;
  const out: P2[] = [pts[0]!];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    if (cross > 0.05 || Math.hypot(b.x - a.x, b.z - a.z) > 12) out.push(b);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}
