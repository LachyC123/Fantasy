/**
 * Collision world for the first-person capsule: the analytic terrain height
 * field plus static oriented boxes and vertical cylinders (buildings, walls,
 * towers, fences, ruins) and a streamed set of tree-trunk cylinders.
 * Obstacles have vertical extents, so low walls can be stepped onto and
 * stood upon while tall ones block.
 */

export interface BoxShape {
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hd: number;
  y0: number;
  y1: number;
  /** Optional tag for debugging (e.g. building id). */
  tag?: string;
  /** Owning group (a streamed region); removed together. */
  group?: string;
}

export interface CircleShape {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
  tag?: string;
  group?: string;
}

const CELL = 16;
const key = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

export class CollisionWorld {
  private readonly boxes: BoxShape[] = [];
  private readonly circles: CircleShape[] = [];
  private readonly grid = new Map<number, { b: number[]; c: number[] }>();
  private dynamicCircles: CircleShape[] = [];
  private dynamicGrid = new Map<number, number[]>();

  /** Group stamped on shapes added from now on (streamed regions add and remove theirs together). */
  group: string | undefined = undefined;

  constructor(readonly heightAt: (x: number, z: number) => number) {}

  /** Remove every static shape of a group and rebuild the grid. */
  removeGroup(group: string): void {
    const keepB = this.boxes.filter((b) => b.group !== group);
    const keepC = this.circles.filter((c) => c.group !== group);
    if (keepB.length === this.boxes.length && keepC.length === this.circles.length) return;
    this.boxes.length = 0;
    this.circles.length = 0;
    this.grid.clear();
    const g = this.group;
    for (const b of keepB) {
      this.group = b.group;
      this.addBox(b);
    }
    for (const c of keepC) {
      this.group = c.group;
      this.addCircle(c);
    }
    this.group = g;
  }

  private cell(cx: number, cz: number): { b: number[]; c: number[] } {
    const k = key(cx, cz);
    let e = this.grid.get(k);
    if (!e) this.grid.set(k, (e = { b: [], c: [] }));
    return e;
  }

  addBox(b: BoxShape): void {
    const i = this.boxes.length;
    if (this.group !== undefined && b.group === undefined) b = { ...b, group: this.group };
    this.boxes.push(b);
    const r = Math.hypot(b.hw, b.hd);
    for (let cx = Math.floor((b.x - r) / CELL); cx <= Math.floor((b.x + r) / CELL); cx++)
      for (let cz = Math.floor((b.z - r) / CELL); cz <= Math.floor((b.z + r) / CELL); cz++) this.cell(cx, cz).b.push(i);
  }

  addCircle(c: CircleShape): void {
    const i = this.circles.length;
    if (this.group !== undefined && c.group === undefined) c = { ...c, group: this.group };
    this.circles.push(c);
    for (let cx = Math.floor((c.x - c.r) / CELL); cx <= Math.floor((c.x + c.r) / CELL); cx++)
      for (let cz = Math.floor((c.z - c.r) / CELL); cz <= Math.floor((c.z + c.r) / CELL); cz++) this.cell(cx, cz).c.push(i);
  }

  /** Replace the streamed tree-trunk set (no allocation churn on the static grid). */
  setDynamicCircles(list: CircleShape[]): void {
    this.dynamicCircles = list;
    this.dynamicGrid = new Map();
    list.forEach((c, i) => {
      for (let cx = Math.floor((c.x - c.r) / CELL); cx <= Math.floor((c.x + c.r) / CELL); cx++)
        for (let cz = Math.floor((c.z - c.r) / CELL); cz <= Math.floor((c.z + c.r) / CELL); cz++) {
          const k = key(cx, cz);
          let l = this.dynamicGrid.get(k);
          if (!l) this.dynamicGrid.set(k, (l = []));
          l.push(i);
        }
    });
  }

  get counts(): { boxes: number; circles: number; dynamic: number } {
    return { boxes: this.boxes.length, circles: this.circles.length, dynamic: this.dynamicCircles.length };
  }

  /** Visit candidate shapes near a point (deduplicated per call). */
  private near(x: number, z: number, reach: number, fb: (b: BoxShape) => void, fc: (c: CircleShape) => void): void {
    const seenB = new Set<number>();
    const seenC = new Set<number>();
    const seenD = new Set<number>();
    for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
      for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
        const e = this.grid.get(key(cx, cz));
        if (e) {
          for (const i of e.b) if (!seenB.has(i)) (seenB.add(i), fb(this.boxes[i]!));
          for (const i of e.c) if (!seenC.has(i)) (seenC.add(i), fc(this.circles[i]!));
        }
        const d = this.dynamicGrid.get(key(cx, cz));
        if (d) for (const i of d) if (!seenD.has(i)) (seenD.add(i), fc(this.dynamicCircles[i]!));
      }
    }
  }

  /**
   * Highest walkable surface under a point that is not above `maxY`
   * (terrain, or the top of a box / cylinder the point lies within).
   */
  groundAt(x: number, z: number, maxY: number, radius = 0): number {
    let g = this.heightAt(x, z);
    this.near(
      x,
      z,
      radius + 1,
      (b) => {
        if (b.y1 > maxY || b.y1 <= g) return;
        if (insideBox(b, x, z, radius * 0.5)) g = b.y1;
      },
      (c) => {
        if (c.y1 > maxY || c.y1 <= g) return;
        if ((c.x - x) ** 2 + (c.z - z) ** 2 <= (c.r + radius * 0.5) ** 2) g = c.y1;
      },
    );
    return g;
  }

  /**
   * Push a vertical capsule (radius, feet..head) out of any obstacle whose
   * vertical span overlaps [feet + step, head]. Returns the corrected XZ.
   */
  resolve(x: number, z: number, radius: number, feet: number, head: number, step: number): { x: number; z: number; hit: boolean } {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.near(
        x,
        z,
        radius + 2,
        (b) => {
          if (b.y1 <= feet + step || b.y0 >= head) return;
          const p = pushOutBox(b, x, z, radius);
          if (p) {
            x = p.x;
            z = p.z;
            moved = hit = true;
          }
        },
        (c) => {
          if (c.y1 <= feet + step || c.y0 >= head) return;
          const dx = x - c.x;
          const dz = z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + radius;
          if (d < min) {
            const nx = d > 1e-6 ? dx / d : 1;
            const nz = d > 1e-6 ? dz / d : 0;
            x = c.x + nx * min;
            z = c.z + nz * min;
            moved = hit = true;
          }
        },
      );
      if (!moved) break;
    }
    return { x, z, hit };
  }

  /** Is the capsule overlapping any solid obstacle (used by spawn validation)? */
  blocked(x: number, z: number, radius: number, feet: number, head: number, step: number): boolean {
    const r = this.resolve(x, z, radius, feet, head, step);
    return r.hit;
  }
}

export function insideBox(b: BoxShape, x: number, z: number, margin = 0): boolean {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  return Math.abs(lx) <= b.hw + margin && Math.abs(lz) <= b.hd + margin;
}

/** Push a circle out of an oriented box; null if not overlapping. */
export function pushOutBox(b: BoxShape, x: number, z: number, r: number): { x: number; z: number } | null {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  // World → box local.
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const qx = Math.max(-b.hw, Math.min(b.hw, lx));
  const qz = Math.max(-b.hd, Math.min(b.hd, lz));
  let ox = lx - qx;
  let oz = lz - qz;
  const d2 = ox * ox + oz * oz;
  let nlx: number;
  let nlz: number;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    if (d >= r) return null;
    ox /= d;
    oz /= d;
    nlx = qx + ox * r;
    nlz = qz + oz * r;
  } else {
    // Centre inside the box: exit through the nearest face.
    const px = b.hw - Math.abs(lx);
    const pz = b.hd - Math.abs(lz);
    if (px < pz) {
      nlx = Math.sign(lx || 1) * (b.hw + r);
      nlz = lz;
    } else {
      nlx = lx;
      nlz = Math.sign(lz || 1) * (b.hd + r);
    }
  }
  // Local → world.
  return { x: b.x + c * nlx + s * nlz, z: b.z - s * nlx + c * nlz };
}
