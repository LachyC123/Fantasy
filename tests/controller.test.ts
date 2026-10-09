import { describe, expect, it } from 'vitest';
import { CollisionWorld, pushOutBox } from '../src/player/collision';
import { CharacterController, PLAYER } from '../src/player/controller';
import { generateWorldPlan, createTerrain, REFERENCE_SEED } from '../src/world/plan';
import { buildStructures } from '../src/world/structures';
import { MaterialLibrary } from '../src/rendering/materials';

const flat = (): CollisionWorld => new CollisionWorld(() => 0);
const idle = { forward: 0, right: 0, sprint: false, jump: false };
const fwd = { forward: 1, right: 0, sprint: false, jump: false };

function run(c: CharacterController, input: typeof idle, seconds: number, yaw = 0): void {
  for (let t = 0; t < seconds; t += 1 / 60) c.update(1 / 60, input, yaw);
}

describe('collision primitives', () => {
  it('pushes a circle out of an oriented box', () => {
    const box = { x: 0, z: 0, yaw: 0.6, hw: 1, hd: 2, y0: 0, y1: 3 };
    expect(pushOutBox(box, 10, 10, 0.35)).toBeNull();
    const p = pushOutBox(box, 0.2, 0.1, 0.35)!;
    expect(p).not.toBeNull();
    expect(pushOutBox(box, p.x, p.z, 0.349)).toBeNull();
  });
});

describe('character controller', () => {
  it('walks forward along -Z at walking speed, faster when sprinting', () => {
    const c = new CharacterController(flat(), 0, 0);
    run(c, fwd, 2);
    expect(c.z).toBeLessThan(-6.5);
    expect(Math.abs(c.x)).toBeLessThan(1e-6);
    const s = new CharacterController(flat(), 0, 0);
    run(s, { ...fwd, sprint: true }, 2);
    expect(s.z).toBeLessThan(c.z - 4);
  });

  it('turns movement with the view yaw', () => {
    const c = new CharacterController(flat(), 0, 0);
    run(c, fwd, 1, Math.PI / 2); // facing -X
    expect(c.x).toBeLessThan(-2.5);
    expect(Math.abs(c.z)).toBeLessThan(1e-6);
  });

  it('cannot pass through a wall and slides along it', () => {
    const w = flat();
    w.addBox({ x: 0, z: -5, yaw: 0, hw: 10, hd: 0.5, y0: 0, y1: 3 });
    const c = new CharacterController(w, 0, 0);
    run(c, fwd, 3);
    expect(c.z).toBeGreaterThan(-4.5 + PLAYER.radius - 0.02);
    // Diagonal push slides sideways along the wall.
    run(c, { forward: 1, right: 1, sprint: false, jump: false }, 2);
    expect(c.x).toBeGreaterThan(2);
    expect(c.z).toBeGreaterThan(-4.5 + PLAYER.radius - 0.02);
  });

  it('steps up onto knee-high stones but not onto tall obstacles', () => {
    const w = flat();
    w.addBox({ x: 0, z: -3, yaw: 0, hw: 2, hd: 1, y0: 0, y1: 0.4 });
    w.addBox({ x: 6, z: -3, yaw: 0, hw: 2, hd: 1, y0: 0, y1: 1.1 });
    const a = new CharacterController(w, 0, 0);
    run(a, fwd, 0.9);
    expect(a.y).toBeCloseTo(0.4, 3);
    const b = new CharacterController(w, 6, 0);
    run(b, fwd, 2);
    expect(b.y).toBe(0);
    expect(b.z).toBeGreaterThan(-2 + PLAYER.radius - 0.02);
  });

  it('jumps and lands again on the ground', () => {
    const c = new CharacterController(flat(), 0, 0);
    c.update(1 / 60, { ...idle, jump: true }, 0);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      c.update(1 / 60, idle, 0);
      peak = Math.max(peak, c.y);
    }
    expect(peak).toBeGreaterThan(0.7);
    expect(c.y).toBe(0);
    expect(c.onGround).toBe(true);
  });

  it('refuses to climb slopes steeper than the limit but walks gentle ones', () => {
    const steep = new CharacterController(new CollisionWorld((_x, z) => Math.max(0, -z - 2) * 2.0), 0, 0);
    run(steep, fwd, 4);
    expect(steep.y).toBeLessThan(1.2);
    const gentle = new CharacterController(new CollisionWorld((_x, z) => Math.max(0, -z - 2) * 0.35), 0, 0);
    run(gentle, fwd, 4);
    expect(gentle.y).toBeGreaterThan(3);
  });

  it('spawns on solid, unobstructed ground in the reference world', () => {
    const plan = generateWorldPlan(REFERENCE_SEED);
    const terrain = createTerrain(plan);
    const world = new CollisionWorld((x, z) => terrain.height(x, z));
    buildStructures(plan, terrain, new MaterialLibrary(), world);
    const c = new CharacterController(world, plan.spawn.x, plan.spawn.z);
    run(c, idle, 0.5);
    expect(c.onGround).toBe(true);
    expect(Math.abs(c.y - terrain.height(plan.spawn.x, plan.spawn.z))).toBeLessThan(0.05);
    // Walk down the footpath for a few seconds without getting stuck.
    const path = plan.roads.find((r) => r.kind === 'footpath')!;
    const target = path.points[Math.min(path.points.length - 1, 20)]!;
    const yaw = Math.atan2(-(target.x - c.x), -(target.z - c.z));
    const start = { x: c.x, z: c.z };
    run(c, fwd, 3, yaw);
    expect(Math.hypot(c.x - start.x, c.z - start.z)).toBeGreaterThan(10);
  });
});
