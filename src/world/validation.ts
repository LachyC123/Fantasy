/**
 * Spatial validation of a generated world (Section 56 "Generation Validation").
 * Runs at load time (issues are logged and shown in the debug overlay) and in
 * the automated test-suite across many seeds.
 */
import type { CollisionWorld } from '../player/collision';
import type { TerrainLike } from './terrain';
import type { WorldContent, WorldPlan } from './types';
import { obbCorners, obbOverlap, obbSamples } from './geometry2d';
import { maxRoadGrade } from './roads';
import { distSqToSegment } from '../core/math';
import { PLAYER } from '../player/controller';

export interface ValidationReport {
  ok: boolean;
  checks: number;
  issues: string[];
}

/** Checks shared by every area: buildings, roads, fields, fences, finds, castles. */
export function validateContent(plan: WorldContent, terrain: TerrainLike, collision?: CollisionWorld, knownIds: string[] = []): ValidationReport {
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
    ...knownIds,
    ...plan.castles.map((c) => c.id),
    ...plan.settlements.map((s) => s.id),
    ...plan.sites.map((s) => s.id),
    ...plan.roads.map((r) => r.id),
    ...plan.gates.map((g) => g.id),
  ]);
  const b = plan.bounds;
  for (const r of plan.roads) {
    check(siteIds.has(r.from) && siteIds.has(r.to), `${r.id}: leads to an unknown place (${r.from} → ${r.to})`);
    let gap = 0;
    for (let i = 1; i < r.points.length; i++) gap = Math.max(gap, Math.hypot(r.points[i]!.x - r.points[i - 1]!.x, r.points[i]!.z - r.points[i - 1]!.z));
    check(gap < 2.8, `${r.id}: centreline gap ${gap.toFixed(2)} m`);
    const limit = r.kind === 'trade-road' ? 0.205 : 0.305;
    const g = maxRoadGrade(r);
    check(g <= limit, `${r.id}: grade ${g.toFixed(3)} exceeds ${limit}`);
    // Roads stay inside their area (a gate crossing sits exactly on the border).
    let outside = 0;
    for (const p of r.points) outside = Math.max(outside, b.x0 - p.x, p.x - b.x1, b.z0 - p.z, p.z - b.z1);
    check(outside < 0.5, `${r.id}: leaves its area by ${outside.toFixed(1)} m`);
  }
  // Roads that end (or start) on another road must actually meet it, at the same height.
  const byId = new Map(plan.roads.map((r) => [r.id, r] as const));
  for (const r of plan.roads) {
    const startOn = byId.get(r.from);
    if (startOn) {
      const s0 = r.points[0]!;
      check(startOn.points.some((p) => Math.hypot(p.x - s0.x, p.z - s0.z) < 3), `${r.id}: does not start on ${startOn.id}`);
    }
    const target = byId.get(r.to);
    if (!target) continue;
    const e = r.points[r.points.length - 1]!;
    let best = Infinity;
    let bh = 0;
    target.points.forEach((p, i) => {
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < best) {
        best = d;
        bh = target.heights[i]!;
      }
    });
    check(best < 3, `${r.id}: ends ${best.toFixed(1)} m from ${target.id}`);
    check(Math.abs(bh - r.heights[r.heights.length - 1]!) < 0.6, `${r.id}: meets ${target.id} at a ${Math.abs(bh - r.heights[r.heights.length - 1]!).toFixed(2)} m step`);
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
    if (f.level) {
      // Indoors: it must stand inside its (enterable) building, at a set height.
      const b = plan.buildings.find((x) => x.id === f.level!.building);
      check(!!b && b.enterable && f.y !== undefined, `${f.id}: indoor find without an enterable building`);
      if (b) check(obbOverlap({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2 - 0.3, hd: b.depth / 2 - 0.3 }, { x: f.x, z: f.z, yaw: 0, hw: 0.05, hd: 0.05 }, 0), `${f.id}: not inside ${b.id}`);
      continue;
    }
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

  // Castle summits are flat enough to stand on and gates are reachable on foot.
  for (const c of plan.castles) {
    check(Math.abs(terrain.height(c.x, c.z) - c.plateauHeight) < 0.5, `${c.id}: summit pad not applied`);
    check(Math.abs(terrain.height(c.gate.x, c.gate.z) - c.plateauHeight) < 1.5, `${c.id}: gate not level with the summit`);
  }
  // Sites and buildings stay inside the area.
  for (const st of plan.sites) check(st.x > b.x0 && st.x < b.x1 && st.z > b.z0 && st.z < b.z1, `${st.id}: outside its area`);

  return { ok: issues.length === 0, checks, issues };
}

/** The vale: shared checks plus its authored promises (spawn, footpath, the road to the castle). */
export function validateWorld(plan: WorldPlan, terrain: TerrainLike, collision?: CollisionWorld): ValidationReport {
  const base = validateContent(plan, terrain, collision, ['ancient-tree', 'watchtower']);
  const issues = base.issues;
  let checks = base.checks;
  const check = (cond: boolean, msg: string): void => {
    checks++;
    if (!cond) issues.push(msg);
  };
  const main = plan.roads.find((r) => r.kind === 'trade-road');
  if (main) {
    const end = main.points[main.points.length - 1]!;
    check(Math.hypot(end.x - plan.castle.gate.x, end.z - plan.castle.gate.z) < 3, 'Vale Road does not reach the castle gate');
  }
  const foot = plan.roads.find((r) => r.kind === 'footpath');
  if (foot && main) {
    const e = foot.points[foot.points.length - 1]!;
    const j = main.points[0]!;
    check(Math.hypot(e.x - j.x, e.z - j.z) < 3, 'Footpath does not meet the Vale Road');
    const s0 = foot.points[0]!;
    check(Math.hypot(s0.x - plan.spawn.x, s0.z - plan.spawn.z) < 8, 'Footpath does not start at the spawn clearing');
  }
  check(plan.roads.some((r) => r.id.includes('/gate/')), 'the vale has no road out to the wider world');
  const sp = plan.spawn;
  check(terrain.slope(sp.x, sp.z) < PLAYER.maxSlope * 0.6, `spawn slope ${terrain.slope(sp.x, sp.z).toFixed(2)} too steep`);
  if (collision) {
    const h = terrain.height(sp.x, sp.z);
    check(!collision.blocked(sp.x, sp.z, PLAYER.radius, h, h + PLAYER.height, PLAYER.step), 'spawn point is inside a collider');
  }
  return { ok: issues.length === 0, checks, issues };
}
