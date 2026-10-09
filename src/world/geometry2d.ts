/** 2D footprint helpers in the XZ plane (oriented rectangles). */
import type { P2 } from './types';

export interface Obb {
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hd: number;
}

export function obbCorners(o: Obb, margin = 0): P2[] {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const hw = o.hw + margin;
  const hd = o.hd + margin;
  const pts: P2[] = [];
  for (const [lx, lz] of [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ] as const) {
    pts.push({ x: o.x + c * lx + s * lz, z: o.z - s * lx + c * lz });
  }
  return pts;
}

function axesOf(o: Obb): P2[] {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  // Local X and Z axes expressed in world space.
  return [
    { x: c, z: -s },
    { x: s, z: c },
  ];
}

/** Separating-axis overlap test with an optional clearance margin. */
export function obbOverlap(a: Obb, b: Obb, margin = 0): boolean {
  const ca = obbCorners(a, margin);
  const cb = obbCorners(b, 0);
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const p of ca) {
      const d = p.x * axis.x + p.z * axis.z;
      minA = Math.min(minA, d);
      maxA = Math.max(maxA, d);
    }
    for (const p of cb) {
      const d = p.x * axis.x + p.z * axis.z;
      minB = Math.min(minB, d);
      maxB = Math.max(maxB, d);
    }
    if (maxA < minB || maxB < minA) return false;
  }
  return true;
}

/** Is a point inside an OBB (expanded by margin)? */
export function pointInObb(o: Obb, x: number, z: number, margin = 0): boolean {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const dx = x - o.x;
  const dz = z - o.z;
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  return Math.abs(lx) <= o.hw + margin && Math.abs(lz) <= o.hd + margin;
}

/** Sample points across an OBB on a grid (including the boundary). */
export function obbSamples(o: Obb, spacing: number): P2[] {
  const out: P2[] = [];
  const nx = Math.max(1, Math.ceil((o.hw * 2) / spacing));
  const nz = Math.max(1, Math.ceil((o.hd * 2) / spacing));
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const lx = -o.hw + (i / nx) * o.hw * 2;
      const lz = -o.hd + (j / nz) * o.hd * 2;
      out.push({ x: o.x + c * lx + s * lz, z: o.z - s * lx + c * lz });
    }
  }
  return out;
}
