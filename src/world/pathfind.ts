/**
 * Road route finding: Dijkstra over a coarse grid (8 neighbours) whose costs
 * prefer gentle slopes and avoid reserved ground. The search stops at the
 * first node that touches any goal point, so a new road always ends where it
 * meets the existing network (a T-junction) instead of crossing it.
 */
import type { Bounds, P2 } from './types';

export interface PathRequest {
  /** Searchable area (nodes outside are never visited). */
  bounds: Bounds;
  /** Grid spacing in metres. */
  cell: number;
  height: (x: number, z: number) => number;
  start: P2;
  /** Any of these points ends the search (within `goalRadius`). */
  goals: P2[];
  goalRadius: number;
  /** Extra cost multiplier (≥ 1) or Infinity for ground the road must not cross. */
  penalty?: (x: number, z: number) => number;
  /** Grade above which ground is strongly avoided. */
  maxGrade: number;
}

export interface PathResult {
  points: P2[];
  /** The goal point that was reached. */
  goal: P2;
  goalIndex: number;
  cost: number;
}

class MinHeap {
  private readonly keys: number[] = [];
  private readonly vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0]!;
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= k.length) break;
        const r = l + 1;
        const c = r < k.length && k[r]! < k[l]! ? r : l;
        if (k[c]! >= lk) break;
        k[i] = k[c]!;
        v[i] = v[c]!;
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function findPath(req: PathRequest): PathResult | null {
  const { bounds, cell } = req;
  const nx = Math.max(2, Math.floor((bounds.x1 - bounds.x0) / cell) + 1);
  const nz = Math.max(2, Math.floor((bounds.z1 - bounds.z0) / cell) + 1);
  const N = nx * nz;
  const px = (i: number): number => bounds.x0 + (i % nx) * cell;
  const pz = (i: number): number => bounds.z0 + Math.floor(i / nx) * cell;
  const heights = new Float32Array(N).fill(NaN);
  const hAt = (i: number): number => {
    let h = heights[i]!;
    if (Number.isNaN(h)) heights[i] = h = req.height(px(i), pz(i));
    return h;
  };
  const penalty = new Float32Array(N).fill(NaN);
  const penAt = (i: number): number => {
    let p = penalty[i]!;
    if (Number.isNaN(p)) penalty[i] = p = req.penalty ? req.penalty(px(i), pz(i)) : 1;
    return p;
  };
  const node = (x: number, z: number): number => {
    const ix = Math.min(nx - 1, Math.max(0, Math.round((x - bounds.x0) / cell)));
    const iz = Math.min(nz - 1, Math.max(0, Math.round((z - bounds.z0) / cell)));
    return iz * nx + ix;
  };

  // Goal mask: nodes within reach of a goal point remember which goal.
  const goalOf = new Int32Array(N).fill(-1);
  const gr = Math.ceil(req.goalRadius / cell);
  req.goals.forEach((g, gi) => {
    const c = node(g.x, g.z);
    const cx = c % nx;
    const cz = Math.floor(c / nx);
    for (let dz = -gr; dz <= gr; dz++)
      for (let dx = -gr; dx <= gr; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
        const i = z * nx + x;
        const d = Math.hypot(px(i) - g.x, pz(i) - g.z);
        if (d > req.goalRadius) continue;
        const prev = goalOf[i]!;
        if (prev < 0 || d < Math.hypot(px(i) - req.goals[prev]!.x, pz(i) - req.goals[prev]!.z)) goalOf[i] = gi;
      }
  });

  const dist = new Float64Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const start = node(req.start.x, req.start.z);
  dist[start] = 0;
  const heap = new MinHeap();
  heap.push(0, start);
  let found = -1;
  while (heap.size) {
    const i = heap.pop();
    const d = dist[i]!;
    if (goalOf[i]! >= 0) {
      found = i;
      break;
    }
    const ix = i % nx;
    const iz = Math.floor(i / nx);
    const h0 = hAt(i);
    for (const [dx, dz] of DIRS) {
      const x = ix + dx;
      const z = iz + dz;
      if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
      const j = z * nx + x;
      const p = penAt(j);
      if (!Number.isFinite(p)) continue;
      const len = dx && dz ? cell * Math.SQRT2 : cell;
      const grade = Math.abs(hAt(j) - h0) / len;
      const over = Math.max(0, grade - req.maxGrade);
      const c = len * p * (1 + 18 * grade * grade + 400 * over * over);
      const nd = d + c;
      if (nd < dist[j]!) {
        dist[j] = nd;
        from[j] = i;
        heap.push(nd, j);
      }
    }
  }
  if (found < 0) return null;
  const nodes: number[] = [];
  for (let i = found; i >= 0; i = from[i]!) nodes.push(i);
  nodes.reverse();
  const points: P2[] = nodes.map((i) => ({ x: px(i), z: pz(i) }));
  points[0] = { x: req.start.x, z: req.start.z };
  const goalIndex = goalOf[found]!;
  const goal = req.goals[goalIndex]!;
  points.push({ x: goal.x, z: goal.z });
  return { points: simplify(dedupe(points), cell * 0.45), goal, goalIndex, cost: dist[found]! };
}

function dedupe(pts: P2[]): P2[] {
  const out: P2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.z - q.z) > 0.5) out.push(p);
  }
  return out;
}

/** Ramer–Douglas–Peucker simplification (keeps both ends). */
export function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a]!;
    const B = pts[b]!;
    const lx = B.x - A.x;
    const lz = B.z - A.z;
    const ll = Math.hypot(lx, lz) || 1;
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i]!;
      const d = Math.abs((P.x - A.x) * lz - (P.z - A.z) * lx) / ll;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
