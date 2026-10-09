/**
 * What the player has seen this journey: the ground they have travelled near
 * (fog of war lifts in 64 m cells) and the places they have discovered. Lives
 * for the journey; persistent saves arrive with Milestone 4.
 */
import type { SitePlan } from '../world/types';

const CELL = 64;
const key = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

export class Exploration {
  private readonly cells = new Set<number>();
  readonly discovered: SitePlan[] = [];
  /** Places you have heard of but not yet found. */
  readonly rumoured: SitePlan[] = [];
  private lastX = Infinity;
  private lastZ = Infinity;
  /** Metres travelled (horizontal), for the Atlas. */
  travelled = 0;

  /** Lift the fog around a point (cheap to call every frame; works every 16 m). */
  visit(x: number, z: number, radius = 200): void {
    const moved = Math.hypot(x - this.lastX, z - this.lastZ);
    if (moved < 16) return;
    if (Number.isFinite(moved) && moved < 60) this.travelled += moved;
    this.lastX = x;
    this.lastZ = z;
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const px = (cx + dx + 0.5) * CELL;
        const pz = (cz + dz + 0.5) * CELL;
        if (Math.hypot(px - x, pz - z) <= radius) this.cells.add(key(cx + dx, cz + dz));
      }
  }

  explored(x: number, z: number): boolean {
    return this.cells.has(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  hear(site: SitePlan): void {
    if (this.isDiscovered(site.id) || this.rumoured.some((s) => s.id === site.id)) return;
    this.rumoured.push(site);
  }

  discover(site: SitePlan): void {
    if (this.discovered.some((s) => s.id === site.id)) return;
    this.discovered.push(site);
    const ri = this.rumoured.findIndex((s) => s.id === site.id);
    if (ri >= 0) this.rumoured.splice(ri, 1);
    // Seeing a place lifts the fog around it a little.
    const r = Math.ceil(Math.max(90, site.radius) / CELL);
    const cx = Math.floor(site.x / CELL);
    const cz = Math.floor(site.z / CELL);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) this.cells.add(key(cx + dx, cz + dz));
  }

  isDiscovered(id: string): boolean {
    return this.discovered.some((s) => s.id === id);
  }

  snapshot(): { discovered: SitePlan[]; rumoured: SitePlan[]; explored: number[]; travelled: number } {
    return { discovered: this.discovered.slice(), rumoured: this.rumoured.slice(), explored: [...this.cells], travelled: this.travelled };
  }

  static restore(s: { discovered: SitePlan[]; rumoured: SitePlan[]; explored: number[]; travelled: number }): Exploration {
    const e = new Exploration();
    for (const c of s.explored) e.cells.add(c);
    e.discovered.push(...s.discovered);
    e.rumoured.push(...s.rumoured);
    e.travelled = s.travelled;
    return e;
  }

  get exploredArea(): number {
    return this.cells.size * CELL * CELL;
  }
}
