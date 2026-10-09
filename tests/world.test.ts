import { describe, expect, it } from 'vitest';
import { generateWorldPlan, createTerrain, REFERENCE_SEED } from '../src/world/plan';
import { validateWorld } from '../src/world/validation';
import { Ecology, singleSource } from '../src/world/ecology';
import { TerrainColorizer } from '../src/world/terrainColor';
import { buildTerrainGeometry } from '../src/world/terrainStreamer';
import { CollisionWorld } from '../src/player/collision';
import { buildStructures } from '../src/world/structures';
import { MaterialLibrary } from '../src/rendering/materials';
import { maxRoadGrade } from '../src/world/roads';
import { obbSamples } from '../src/world/geometry2d';

const plan = generateWorldPlan(REFERENCE_SEED);
const terrain = createTerrain(plan);
const ecology = new Ecology(plan.seed, terrain, singleSource(plan));

describe('world plan determinism', () => {
  it('reproduces the same plan for the same seed', () => {
    const again = generateWorldPlan(REFERENCE_SEED);
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });

  it('records seed and generator version', () => {
    expect(plan.seed).toBe(REFERENCE_SEED);
    expect(plan.generatorVersion).toBeGreaterThanOrEqual(1);
  });

  it('varies settlements between seeds while keeping the anchor composition', () => {
    const other = generateWorldPlan('another-seed');
    const hamletA = plan.settlements.find((s) => s.kind === 'hamlet')!;
    const hamletB = other.settlements.find((s) => s.kind === 'hamlet')!;
    const layoutA = plan.buildings.map((b) => `${b.kind}:${b.x.toFixed(1)}:${b.z.toFixed(1)}:${b.wallStyle}:${b.roof}`).join('|');
    const layoutB = other.buildings.map((b) => `${b.kind}:${b.x.toFixed(1)}:${b.z.toFixed(1)}:${b.wallStyle}:${b.roof}`).join('|');
    expect(layoutA).not.toBe(layoutB);
    // Composition constraints: castle north of the spawn, hamlet between them.
    for (const p of [plan, other]) {
      const h = p.settlements.find((s) => s.kind === 'hamlet')!;
      expect(p.castle.z).toBeLessThan(h.z);
      expect(h.z).toBeLessThan(p.spawn.z);
    }
    expect(hamletA.id).toBe(hamletB.id);
  });

  it('gives every building a distinct identity, not copies', () => {
    const recipes = new Set(plan.buildings.map((b) => `${b.width.toFixed(2)}x${b.depth.toFixed(2)}:${b.floors}:${b.wallStyle}:${b.upperStyle}:${b.roof}:${b.roofPitch.toFixed(2)}`));
    expect(recipes.size).toBe(plan.buildings.length);
  });
});

describe('terrain', () => {
  it('is seamless across adjacent terrain nodes (shared border vertices match)', () => {
    const colorizer = new TerrainColorizer(terrain, ecology);
    const size = 64;
    const n = 16;
    const a = buildTerrainGeometry(terrain, colorizer, 0, -128, size, n);
    const b = buildTerrainGeometry(terrain, colorizer, size, -128, size, n);
    const pa = a.getAttribute('position');
    const pb = b.getAttribute('position');
    const na = a.getAttribute('normal');
    const nb = b.getAttribute('normal');
    for (let j = 0; j <= n; j++) {
      const ia = j * (n + 1) + n; // right edge of A
      const ib = j * (n + 1); // left edge of B
      expect(pa.getX(ia)).toBeCloseTo(pb.getX(ib), 5);
      expect(pa.getZ(ia)).toBeCloseTo(pb.getZ(ib), 5);
      expect(pa.getY(ia)).toBe(pb.getY(ib));
      expect(na.getY(ia)).toBeCloseTo(nb.getY(ib), 5);
    }
  });

  it('seats every building exactly on its levelled pad', () => {
    for (const b of plan.buildings) {
      for (const p of obbSamples({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2, hd: b.depth / 2 }, 1)) {
        expect(Math.abs(terrain.height(p.x, p.z) - b.padHeight)).toBeLessThan(0.05);
      }
    }
  });

  it('keeps the castle summit flat and the spawn walkable', () => {
    expect(terrain.height(plan.castle.x, plan.castle.z)).toBeCloseTo(plan.castle.plateauHeight, 3);
    expect(terrain.slope(plan.spawn.x, plan.spawn.z)).toBeLessThan(0.4);
  });
});

describe('roads', () => {
  it('connect real places with walkable grades', () => {
    const main = plan.roads.find((r) => r.kind === 'trade-road')!;
    const foot = plan.roads.find((r) => r.kind === 'footpath')!;
    const end = main.points[main.points.length - 1]!;
    expect(Math.hypot(end.x - plan.castle.gate.x, end.z - plan.castle.gate.z)).toBeLessThan(1);
    expect(Math.hypot(foot.points[0]!.x - plan.spawn.x, foot.points[0]!.z - plan.spawn.z)).toBeLessThan(6);
    expect(maxRoadGrade(main)).toBeLessThanOrEqual(0.2001);
    for (const r of plan.roads) expect(maxRoadGrade(r)).toBeLessThanOrEqual(0.3001);
  });

  it('grades the terrain to the road surface', () => {
    const main = plan.roads[0]!;
    for (let i = 0; i < main.points.length; i += 25) {
      const p = main.points[i]!;
      // Building pads near the road may lift the verge slightly; the crown matches.
      expect(Math.abs(terrain.height(p.x, p.z) - main.heights[i]!)).toBeLessThan(0.3);
    }
  });
});

describe('ecology', () => {
  it('scatters identically regardless of chunk size or load order', () => {
    const x0 = 64;
    const z0 = -448;
    const big = ecology.scatterTrees(x0, z0, 128);
    const parts = [
      [x0 + 64, z0 + 64],
      [x0, z0],
      [x0 + 64, z0],
      [x0, z0 + 64],
    ].map(([x, z]) => ecology.scatterTrees(x!, z!, 64));
    const flatten = (m: Map<string, { x: number; z: number }[]>[]): string[] =>
      m.flatMap((mm) => [...mm.entries()].flatMap(([k, l]) => l.map((p) => `${k}:${p.x.toFixed(3)}:${p.z.toFixed(3)}`))).sort();
    expect(flatten(parts)).toEqual(flatten([big]));
    const g = (x: number, z: number, size: number) => ecology.scatterGround(x, z, size);
    expect(flatten([g(x0, z0, 64), g(x0 + 64, z0, 64), g(x0, z0 + 64, 64), g(x0 + 64, z0 + 64, 64)])).toEqual(flatten([g(x0, z0, 128)]));
    const grass = (x: number, z: number, size: number) => new Map([['grass', ecology.scatterGrass(x, z, size).grass]]);
    expect(flatten([grass(x0 + 64, z0, 64), grass(x0, z0, 64), grass(x0, z0 + 64, 64), grass(x0 + 64, z0 + 64, 64)])).toEqual(flatten([grass(x0, z0, 128)]));
  });

  it('never grows trees on roads, buildings or the castle summit', () => {
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -16; cz <= 2; cz++) {
        for (const [, list] of ecology.scatterTrees(cx * 64, cz * 64, 64)) {
          for (const p of list) {
            expect(terrain.roadIndex.surfaceDistance(p.x, p.z)).toBeGreaterThan(1.5);
            expect(Math.hypot(p.x - plan.castle.x, p.z - plan.castle.z)).toBeGreaterThan(plan.castle.plateauRadius);
          }
        }
      }
    }
  });

  it('keeps the spawn sightline towards the castle clear of trees', () => {
    const s = plan.sightline;
    for (let t = 0.05; t <= 0.6; t += 0.05) {
      const x = s.from.x + (s.to.x - s.from.x) * t;
      const z = s.from.z + (s.to.z - s.from.z) * t;
      expect(ecology.forestDensity(x, z)).toBeLessThan(0.05);
    }
  });
});

describe('validation across seeds', () => {
  const materials = new MaterialLibrary();
  const seeds = [REFERENCE_SEED, 'amber-thorn-101', 'gloam', 'seed-3', 'seed-9', 'seed-23', 'willow-rook-777', 'x'];
  for (const seed of seeds) {
    it(`generates a valid world for "${seed}"`, () => {
      const p = generateWorldPlan(seed);
      const t = createTerrain(p);
      const world = new CollisionWorld((x, z) => t.height(x, z));
      buildStructures(p, t, materials, world);
      const report = validateWorld(p, t, world);
      expect(report.issues).toEqual([]);
      expect(report.checks).toBeGreaterThan(500);
      expect(p.buildings.length).toBeGreaterThanOrEqual(10);
    });
  }
});
