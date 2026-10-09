/**
 * Final terrain height = macro field → castle summit pad → graded roads →
 * building pads. Every stage is a pure world-space function, so any two chunks
 * sample identical borders and generation order never matters.
 */
import { smoothstep } from '../core/math';
import type { MacroField } from './macro';
import { RoadIndex } from './roads';
import type { Pad, RoadPlan } from './types';

export function padDistance(p: Pad, x: number, z: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  if (p.circle) return Math.max(0, Math.sqrt(dx * dx + dz * dz) - p.halfW);
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  // World → local (inverse rotation about Y).
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const ox = Math.max(0, Math.abs(lx) - p.halfW);
  const oz = Math.max(0, Math.abs(lz) - p.halfD);
  return Math.sqrt(ox * ox + oz * oz);
}

/**
 * Blend pads into the ground. Inside a pad's footprint its height is exact
 * (a neighbour's falloff can never tilt it); in overlapping falloff zones the
 * pads' heights are averaged by weight so nothing steps or folds.
 */
function applyPads(pads: readonly Pad[], h: number, x: number, z: number): number {
  let sumW = 0;
  let sumWH = 0;
  let maxW = 0;
  for (const p of pads) {
    const reach = Math.max(p.halfW, p.halfD) * 1.5 + p.falloff;
    if (Math.abs(x - p.x) > reach || Math.abs(z - p.z) > reach) continue;
    const d = padDistance(p, x, z);
    if (d >= p.falloff) continue;
    if (d <= 0) return p.height;
    const w = 1 - smoothstep(0, p.falloff, d);
    sumW += w;
    sumWH += w * p.height;
    if (w > maxW) maxW = w;
  }
  if (sumW <= 0) return h;
  return h + (sumWH / sumW - h) * maxW;
}

export class Terrain {
  readonly roadIndex: RoadIndex;

  constructor(
    readonly macro: MacroField,
    readonly prePads: readonly Pad[],
    roads: RoadPlan[],
    readonly postPads: readonly Pad[],
  ) {
    this.roadIndex = new RoadIndex(roads);
  }

  /** Height before roads (used to grade road profiles). */
  heightBeforeRoads(x: number, z: number): number {
    return applyPads(this.prePads, this.macro.height(x, z), x, z);
  }

  /** Height with roads but without building pads (used to seat buildings). */
  heightBeforeBuildings(x: number, z: number): number {
    let h = this.heightBeforeRoads(x, z);
    const hit = this.roadIndex.query(x, z);
    if (hit) h += (hit.height - h) * hit.weight;
    return h;
  }

  height(x: number, z: number): number {
    return applyPads(this.postPads, this.heightBeforeBuildings(x, z), x, z);
  }

  /** Unit surface normal via central differences. */
  normal(x: number, z: number, eps = 0.75): { x: number; y: number; z: number } {
    const hx = this.height(x + eps, z) - this.height(x - eps, z);
    const hz = this.height(x, z + eps) - this.height(x, z - eps);
    const nx = -hx;
    const ny = 2 * eps;
    const nz = -hz;
    const len = Math.hypot(nx, ny, nz);
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /** Slope as rise/run magnitude. */
  slope(x: number, z: number, eps = 0.75): number {
    const hx = (this.height(x + eps, z) - this.height(x - eps, z)) / (2 * eps);
    const hz = (this.height(x, z + eps) - this.height(x, z - eps)) / (2 * eps);
    return Math.hypot(hx, hz);
  }
}
