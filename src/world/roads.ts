/**
 * Road construction (spline densification + graded height profile) and a
 * spatial index for fast nearest-road queries during terrain sampling.
 */
import { catmullRom, distSqToSegment, smoothstep, clamp } from '../core/math';
import type { P2, RoadKind, RoadPlan } from './types';

export interface RoadSpec {
  id: string;
  name: string;
  kind: RoadKind;
  halfWidth: number;
  blend: number;
  control: P2[];
  from: string;
  to: string;
  maxGrade: number;
  smoothRadius: number;
}

const SAMPLE_SPACING = 2;

/** Densify control points through a Catmull-Rom spline and resample uniformly. */
export function densify(control: P2[], spacing = SAMPLE_SPACING): P2[] {
  if (control.length < 2) throw new Error('Road needs at least two control points');
  const raw: P2[] = [];
  const n = control.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = control[Math.max(0, i - 1)]!;
    const p1 = control[i]!;
    const p2 = control[i + 1]!;
    const p3 = control[Math.min(n - 1, i + 2)]!;
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.max(4, Math.ceil(len / 1));
    for (let s = 0; s < steps; s++) raw.push(catmullRom(p0, p1, p2, p3, s / steps));
  }
  raw.push({ ...control[n - 1]! });

  // Uniform arc-length resample.
  const out: P2[] = [{ ...raw[0]! }];
  let carry = 0;
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]!;
    const b = raw[i]!;
    let segLen = Math.hypot(b.x - a.x, b.z - a.z);
    let ax = a.x;
    let az = a.z;
    while (carry + segLen >= spacing) {
      const need = spacing - carry;
      const t = need / segLen;
      ax = ax + (b.x - ax) * t;
      az = az + (b.z - az) * t;
      out.push({ x: ax, z: az });
      segLen -= need;
      carry = 0;
    }
    carry += segLen;
  }
  const last = control[n - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(tail.x - last.x, tail.z - last.z) > spacing * 0.35) out.push({ ...last });
  else out[out.length - 1] = { ...last };
  return out;
}

function boxSmooth(values: number[], radius: number): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = clamp(i + k, 0, n - 1);
      sum += values[j]!;
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

/** Limit grade with forward/backward passes (keeps the profile walkable). */
export function limitGrade(heights: number[], spacing: number, maxGrade: number): number[] {
  const h = heights.slice();
  const dmax = maxGrade * spacing;
  for (let i = 1; i < h.length; i++) h[i] = clamp(h[i]!, h[i - 1]! - dmax, h[i - 1]! + dmax);
  for (let i = h.length - 2; i >= 0; i--) h[i] = clamp(h[i]!, h[i + 1]! - dmax, h[i + 1]! + dmax);
  return h;
}

export interface RoadPins {
  start?: number;
  end?: number;
  /** Distance over which a pinned end eases into the natural profile. */
  ease?: number;
}

export function buildRoad(spec: RoadSpec, heightAt: (x: number, z: number) => number, pins: RoadPins = {}): RoadPlan {
  const points = densify(spec.control);
  const arc: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    arc.push(arc[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  // Sample a little across the road so the profile sits in the terrain, not on bumps.
  let heights = points.map((p) => heightAt(p.x, p.z));
  for (let pass = 0; pass < 3; pass++) heights = boxSmooth(heights, spec.smoothRadius);
  const plan: RoadPlan = {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    halfWidth: spec.halfWidth,
    blend: spec.blend,
    points,
    heights,
    arc,
    from: spec.from,
    to: spec.to,
  };
  const ease = pins.ease ?? 30;
  if (pins.start !== undefined) pinRoadEnd(plan, 'start', pins.start, ease);
  if (pins.end !== undefined) pinRoadEnd(plan, 'end', pins.end, ease);
  plan.heights = limitGradePinned(plan.heights, arc, spec.maxGrade, pins.start, pins.end);
  return plan;
}

/**
 * Grade limiting that keeps pinned ends exact: forward pass from the start,
 * backward pass from the end. If the pins are reachable within the grade
 * budget both passes leave every step within `maxGrade`.
 */
export function limitGradePinned(heights: number[], arc: number[], maxGrade: number, start?: number, end?: number): number[] {
  const h = heights.slice();
  const n = h.length;
  const dmax = (i: number): number => maxGrade * (arc[i]! - arc[i - 1]!);
  if (start !== undefined) h[0] = start;
  for (let i = 1; i < n; i++) h[i] = clamp(h[i]!, h[i - 1]! - dmax(i), h[i - 1]! + dmax(i));
  if (end !== undefined) h[n - 1] = end;
  for (let i = n - 2; i >= 0; i--) h[i] = clamp(h[i]!, h[i + 1]! - dmax(i + 1), h[i + 1]! + dmax(i + 1));
  if (start !== undefined) {
    // Re-pin the start and ease forward so the first steps stay within grade.
    h[0] = start;
    for (let i = 1; i < n; i++) {
      const c = clamp(h[i]!, h[i - 1]! - dmax(i), h[i - 1]! + dmax(i));
      if (c === h[i]) break;
      h[i] = c;
    }
  }
  return h;
}

/** Pin one end of a road to a target height, easing over `length` metres. */
export function pinRoadEnd(road: RoadPlan, end: 'start' | 'end', height: number, length: number): void {
  const n = road.heights.length;
  const total = road.arc[n - 1]!;
  for (let i = 0; i < n; i++) {
    const d = end === 'start' ? road.arc[i]! : total - road.arc[i]!;
    if (d > length) continue;
    const w = 1 - smoothstep(0, length, d);
    road.heights[i] = road.heights[i]! * (1 - w) + height * w;
  }
}

/** Maximum absolute grade along a road (rise / run). */
export function maxRoadGrade(road: RoadPlan): number {
  let g = 0;
  for (let i = 1; i < road.points.length; i++) {
    const run = road.arc[i]! - road.arc[i - 1]!;
    if (run <= 0) continue;
    g = Math.max(g, Math.abs(road.heights[i]! - road.heights[i - 1]!) / run);
  }
  return g;
}

export interface RoadHit {
  road: RoadPlan;
  roadIndex: number;
  seg: number;
  t: number;
  dist: number;
  height: number;
  /** Blend weight in [0,1] of this road's grading at the query point. */
  weight: number;
}

const CELL = 24;

/** Uniform-grid index over all road segments. */
export class RoadIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly segRoad: number[] = [];
  private readonly segIdx: number[] = [];
  private readonly reach: number;

  constructor(readonly roads: RoadPlan[]) {
    let reach = 0;
    roads.forEach((road, ri) => {
      reach = Math.max(reach, road.halfWidth + road.blend);
      for (let i = 0; i < road.points.length - 1; i++) {
        const id = this.segRoad.length;
        this.segRoad.push(ri);
        this.segIdx.push(i);
        const a = road.points[i]!;
        const b = road.points[i + 1]!;
        const pad = road.halfWidth + road.blend;
        const x0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL);
        const x1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
        const z0 = Math.floor((Math.min(a.z, b.z) - pad) / CELL);
        const z1 = Math.floor((Math.max(a.z, b.z) + pad) / CELL);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const key = cellKey(cx, cz);
            let list = this.cells.get(key);
            if (!list) this.cells.set(key, (list = []));
            list.push(id);
          }
        }
      }
    });
    this.reach = reach;
  }

  /**
   * Strongest-influence road at a point (within its blend band), or null.
   * Influence is graded by each road's own width so junctions resolve cleanly.
   */
  query(x: number, z: number): RoadHit | null {
    const list = this.cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best: RoadHit | null = null;
    for (const id of list) {
      const ri = this.segRoad[id]!;
      const si = this.segIdx[id]!;
      const road = this.roads[ri]!;
      const a = road.points[si]!;
      const b = road.points[si + 1]!;
      const { d2, t } = distSqToSegment(x, z, a.x, a.z, b.x, b.z);
      const dist = Math.sqrt(d2);
      if (dist > road.halfWidth + road.blend) continue;
      const weight = 1 - smoothstep(road.halfWidth + 0.6, road.halfWidth + road.blend, dist);
      if (!best || weight > best.weight || (weight === best.weight && dist < best.dist)) {
        const height = road.heights[si]! + (road.heights[si + 1]! - road.heights[si]!) * t;
        best = { road, roadIndex: ri, seg: si, t, dist, height, weight };
      }
    }
    return best;
  }

  /** Nearest distance to any road centreline edge (surface), capped at `reach`. */
  surfaceDistance(x: number, z: number): number {
    const list = this.cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return Infinity;
    let best = Infinity;
    for (const id of list) {
      const road = this.roads[this.segRoad[id]!]!;
      const si = this.segIdx[id]!;
      const a = road.points[si]!;
      const b = road.points[si + 1]!;
      const d = Math.sqrt(distSqToSegment(x, z, a.x, a.z, b.x, b.z).d2) - road.halfWidth;
      if (d < best) best = d;
    }
    return best;
  }

  get maxReach(): number {
    return this.reach;
  }
}

function cellKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}
