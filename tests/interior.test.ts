import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../src/player/collision';
import { CharacterController } from '../src/player/controller';
import { generateWorldPlan, createTerrain, REFERENCE_SEED } from '../src/world/plan';
import { buildStructures } from '../src/world/structures';
import { MaterialLibrary } from '../src/rendering/materials';
import { localToWorld } from '../src/world/castle';
import { pointInObb } from '../src/world/geometry2d';
import { MacroField } from '../src/world/macro';
import { planRegion } from '../src/world/regionPlan';

const plan = generateWorldPlan(REFERENCE_SEED);
const terrain = createTerrain(plan);
const world = new CollisionWorld((x, z) => terrain.height(x, z));
const built = buildStructures(plan, terrain, new MaterialLibrary(), world);
const inn = plan.buildings.find((b) => b.kind === 'inn')!;

function run(c: CharacterController, forward: number, right: number, seconds: number, yaw: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) c.update(1 / 60, { forward, right, sprint: false, jump: false }, yaw);
}

const inside = (x: number, z: number, margin = -0.4): boolean => pointInObb({ x: inn.x, z: inn.z, yaw: inn.yaw, hw: inn.width / 2, hd: inn.depth / 2 }, x, z, margin);

describe('the enterable inn', () => {
  it('exists in the vale hamlet with a real doorway, and in procedural villages', () => {
    expect(inn).toBeDefined();
    expect(inn.enterable).toBe(true);
    expect(inn.floors).toBe(2);
    expect(built.doors.some((d) => d.id.startsWith(inn.id))).toBe(true);
    const m = new MacroField(REFERENCE_SEED);
    const r = planRegion(REFERENCE_SEED, m, 2, 1);
    expect(r.buildings.some((b) => b.kind === 'inn' && b.enterable)).toBe(true);
    expect(r.buildings.some((b) => b.kind === 'church')).toBe(true);
  });

  it('lets you walk in through the doorway (with the door open)', () => {
    const door = built.doors.find((d) => d.id.startsWith(inn.id))!.doorway;
    // Stand outside, in front of the doorway's centre, and walk straight in.
    const along = { x: Math.cos(inn.yaw), z: -Math.sin(inn.yaw) };
    const out = { x: Math.sin(inn.yaw), z: Math.cos(inn.yaw) };
    const cx = door.hinge.x + along.x * door.width / 2;
    const cz = door.hinge.z + along.z * door.width / 2;
    const c = new CharacterController(world, cx + out.x * 2.5, cz + out.z * 2.5);
    expect(inside(c.x, c.z, 0)).toBe(false);
    const yawIn = Math.atan2(out.x, out.z); // yaw 0 looks −Z; facing −out
    run(c, 1, 0, 2.2, yawIn);
    expect(inside(c.x, c.z)).toBe(true);
    // Indoors the floor is the building's own.
    expect(Math.abs(c.y - inn.padHeight)).toBeLessThan(0.3);
  });

  it('has stairs that climb to the loft', () => {
    const side = inn.chimney === 'left' ? -1 : 1;
    const T = 0.3;
    // The stair runs along the back wall, from the side away from the hearth.
    const startLocal = { x: -side * (inn.width / 2 - T - 0.25) + side * -0.25, z: -inn.depth / 2 + T + 0.5 };
    const p = localToWorld(startLocal.x - side * 0.2, startLocal.z, inn.yaw, inn.x, inn.z);
    const c = new CharacterController(world, p.x, p.z);
    const dir = localToWorld(side, 0, inn.yaw, 0, 0);
    const yawUp = Math.atan2(-dir.x, -dir.z);
    run(c, 1, 0, 3.5, yawUp);
    expect(c.y - inn.padHeight).toBeGreaterThan(2.5);
    expect(inside(c.x, c.z)).toBe(true);
  });

  it('keeps its walls solid from inside', () => {
    // Walk from the middle of the taproom towards the back wall: you stop at it.
    const c = new CharacterController(world, inn.x, inn.z);
    const back = localToWorld(0, -1, inn.yaw, 0, 0);
    run(c, 1, 0, 4, Math.atan2(-back.x, -back.z));
    expect(inside(c.x, c.z, 0)).toBe(true);
  });

  it('puts a chest in the loft, seated on its floor', () => {
    const f = plan.finds.find((x) => x.level?.building === inn.id)!;
    expect(f).toBeDefined();
    expect(f.pose).toBe('chest');
    expect(f.y! - inn.padHeight).toBeGreaterThan(2.5);
  });
});
