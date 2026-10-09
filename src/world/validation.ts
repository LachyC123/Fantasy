/**
 * Spatial validation of a generated world (Section 56 "Generation Validation").
 * Runs at load time (issues are logged and shown in the debug overlay) and in
 * the automated test-suite across many seeds.
 */
import type { CollisionWorld } from '../player/collision';
import type { Terrain } from './terrain';
import type { WorldPlan } from './types';
import { obbCorners, obbOverlap, obbSamples } from './geometry2d';
import { maxRoadGrade } from './roads';
import { distSqToSegment } from '../core/math';
import { PLAYER } from '../player/controller';

export interface ValidationReport {
  ok: boolean;
  checks: number;
  issues: string[];
}

export function validateWorld(plan: WorldPlan, terrain: Terrain, collision?: CollisionWorld): ValidationReport {
  const issues: string[] = [];
  let checks = 0;
  const check = (cond: boolean, msg: string): void => {
    checks++;
    if (!cond) issues.push(msg);
  };
  const obb = (b: { x: number; z: number; yaw: number; width: number; depth: number }) => ({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2, hd: b.depth / 2 });

  // Buildings: seated on usable, level ground; no overlaps; clear of roads.
  for (const b of plan.buildings) {
    const o = obb(b);
    let maxDev = 0;
    for (const p of obbSamples(o, 1.5)) maxDev = Math.max(maxDev, Math.abs(terrain.height(p.x, p.z) - b.padHeight));
    check(maxDev < 0.35, `${b.id}: footprint deviates ${maxDev.toFixed(2)} m from its pad (floating or buried)`);
    for (const c of obbCorners(o)) check(terrain.roadIndex.surfaceDistance(c.x, c.z) > 0.5, `${b.id}: corner intrudes on a road surface`);
    for (const other of plan.buildings) {
      if (other === b || other.id < b.id) continue;
      check(!obbOverlap(o, obb(other), 0.5), `${b.id} overlaps ${other.id}`);
    }
    for (const f of plan.fences) {
      for (let i = 0; i < f.points.length - 1; i++) {
        const a = f.points[i]!;
        const c = f.points[i + 1]!;
        const mid = { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 };
        check(!obbOverlap(o, { x: mid.x, z: mid.z, yaw: Math.atan2(c.x - a.x, c.z - a.z), hw: 0.4, hd: Math.hypot(c.x - a.x, c.z - a.z) / 2 }, 0.2), `${f.id} crosses ${b.id}`);
      }
    }
    // The ground in front of the door must be open and walkable.
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const fx = b.x + s * (b.depth / 2 + 1.4);
    const fz = b.z + c * (b.depth / 2 + 1.4);
    check(Math.abs(terrain.height(fx, fz) - b.padHeight) < 0.8, `${b.id}: door threshold is not level with the ground`);
    if (collision) {
      const h = terrain.height(fx, fz);
      check(!collision.blocked(fx, fz, PLAYER.radius, h, h + PLAYER.height, PLAYER.step), `${b.id}: something blocks the door`);
    }
  }

  // Roads: continuous, walkable, and every end leads to a real place.
  const siteIds = new Set<string>([
    'ancient-tree',
    'watchtower',
    plan.castle.id,
    ...plan.settlements.map((s) => s.id),
    ...plan.roads.map((r) => r.id),
  ]);
  for (const r of plan.roads) {
    check(siteIds.has(r.from) && siteIds.has(r.to), `${r.id}: leads to an unknown place (${r.from} → ${r.to})`);
    let gap = 0;
    for (let i = 1; i < r.points.length; i++) gap = Math.max(gap, Math.hypot(r.points[i]!.x - r.points[i - 1]!.x, r.points[i]!.z - r.points[i - 1]!.z));
    check(gap < 2.8, `${r.id}: centreline gap ${gap.toFixed(2)} m`);
    const limit = r.kind === 'trade-road' ? 0.205 : 0.305;
    const g = maxRoadGrade(r);
    check(g <= limit, `${r.id}: grade ${g.toFixed(3)} exceeds ${limit}`);
  }
  const main = plan.roads.find((r) => r.kind === 'trade-road');
  if (main) {
    const end = main.points[main.points.length - 1]!;
    check(Math.hypot(end.x - plan.castle.gate.x, end.z - plan.castle.gate.z) < 3, 'Vale Road does not reach the castle gate');
  }
  // Side roads must actually join another road at their start.
  for (const r of plan.roads) {
    if (r.kind !== 'farm-track') continue;
    const s = r.points[0]!;
    const joined = plan.roads.some((o) => o !== r && o.points.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 3));
    check(joined, `${r.id}: does not connect to another road`);
  }
  const foot = plan.roads.find((r) => r.kind === 'footpath');
  if (foot && main) {
    const e = foot.points[foot.points.length - 1]!;
    const j = main.points[0]!;
    check(Math.hypot(e.x - j.x, e.z - j.z) < 3, 'Footpath does not meet the Vale Road');
    const s0 = foot.points[0]!;
    check(Math.hypot(s0.x - plan.spawn.x, s0.z - plan.spawn.z) < 8, 'Footpath does not start at the spawn clearing');
  }

  // Spawn: on walkable ground, unobstructed.
  const sp = plan.spawn;
  check(terrain.slope(sp.x, sp.z) < PLAYER.maxSlope * 0.6, `spawn slope ${terrain.slope(sp.x, sp.z).toFixed(2)} too steep`);
  if (collision) {
    const h = terrain.height(sp.x, sp.z);
    check(!collision.blocked(sp.x, sp.z, PLAYER.radius, h, h + PLAYER.height, PLAYER.step), 'spawn point is inside a collider');
  }

  // Fields don't cover roads; fences don't cross roads.
  for (const f of plan.fields) for (const p of obbSamples({ x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2, hd: f.depth / 2 }, 4)) check(terrain.roadIndex.surfaceDistance(p.x, p.z) > 0.5, `${f.id}: field lies on a road`);
  for (const f of plan.fences) {
    for (const r of plan.roads) {
      for (let i = 0; i < r.points.length; i += 2) {
        const p = r.points[i]!;
        for (let k = 0; k < f.points.length - 1; k++) {
          const a = f.points[k]!;
          const b = f.points[k + 1]!;
          if (Math.abs(p.x - a.x) > 60 && Math.abs(p.x - b.x) > 60) continue;
          const d = Math.sqrt(distSqToSegment(p.x, p.z, a.x, a.z, b.x, b.z).d2);
          if (d < r.halfWidth + 0.3) {
            checks++;
            issues.push(`${f.id} crosses ${r.id}`);
          }
        }
      }
    }
  }

  // Every weapon find can be reached: some standing spot 1.6 m away is open, walkable ground.
  for (const f of plan.finds ?? []) {
    for (const b of plan.buildings) check(!obbOverlap({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2, hd: b.depth / 2 }, { x: f.x, z: f.z, yaw: 0, hw: 0.05, hd: 0.05 }, 0), `${f.id} lies inside ${b.id}`);
    if (collision) {
      let open = false;
      for (let k = 0; k < 8 && !open; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = f.x + Math.cos(a) * 1.6;
        const z = f.z + Math.sin(a) * 1.6;
        const h = terrain.height(x, z);
        open = !collision.blocked(x, z, PLAYER.radius, h, h + PLAYER.height, PLAYER.step) && terrain.slope(x, z) < PLAYER.maxSlope;
      }
      check(open, `${f.id} cannot be reached on foot`);
    }
  }

  // Castle summit is flat enough to stand on and the gate is reachable on foot.
  const c = plan.castle;
  check(Math.abs(terrain.height(c.x, c.z) - c.plateauHeight) < 0.5, 'castle summit pad not applied');
  check(Math.abs(terrain.height(c.gate.x, c.gate.z) - c.plateauHeight) < 1.5, 'castle gate not level with the summit');

  return { ok: issues.length === 0, checks, issues };
}
