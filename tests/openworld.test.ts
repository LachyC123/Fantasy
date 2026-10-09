import { describe, expect, it } from 'vitest';
import { MacroField } from '../src/world/macro';
import { generateWorldPlan } from '../src/world/plan';
import { planRegion } from '../src/world/regionPlan';
import { cellGates, regionSkeleton, REGION, inVale } from '../src/world/regions';
import { Terrain } from '../src/world/terrain';
import { validateContent } from '../src/world/validation';
import { WorldIndex, WorldTerrain } from '../src/world/worldIndex';
import { findPath } from '../src/world/pathfind';
import { Ecology } from '../src/world/ecology';

const SEED = 'reference-valley';
const macro = new MacroField(SEED);

describe('open world: regions', () => {
  it('plans a region identically whatever order regions are generated in', () => {
    const a = JSON.stringify(planRegion(SEED, macro, 3, -1));
    // Generate neighbours first, in a different order, with a fresh macro field.
    const m2 = new MacroField(SEED);
    planRegion(SEED, m2, 4, -1);
    planRegion(SEED, m2, 3, 0);
    const b = JSON.stringify(planRegion(SEED, m2, 3, -1));
    expect(b).toBe(a);
  });

  it('differs between seeds and between regions', () => {
    const a = regionSkeleton(SEED, macro, 2, 2);
    const b = regionSkeleton('another-seed', new MacroField('another-seed'), 2, 2);
    const c = regionSkeleton(SEED, macro, 2, 3);
    expect(JSON.stringify(a.sites)).not.toBe(JSON.stringify(b.sites));
    expect(JSON.stringify(a.sites)).not.toBe(JSON.stringify(c.sites));
  });

  it('agrees with every neighbour on where roads cross the border', () => {
    for (let rx = 2; rx <= 4; rx++)
      for (let rz = -3; rz <= 1; rz++) {
        const gates = cellGates(SEED, macro, rx, rz);
        const east = cellGates(SEED, macro, rx + 1, rz);
        const south = cellGates(SEED, macro, rx, rz + 1);
        for (const g of gates) {
          if (g.x === (rx + 1) * REGION) expect(east.some((o) => o.id === g.id && o.x === g.x && o.z === g.z && o.inX === -g.inX)).toBe(true);
          if (g.z === (rz + 1) * REGION) expect(south.some((o) => o.id === g.id && o.x === g.x && o.z === g.z && o.inZ === -g.inZ)).toBe(true);
        }
      }
  });

  it('joins every gate to the road network, meeting the neighbour at the same height', () => {
    let crossings = 0;
    for (let rx = 2; rx <= 3; rx++)
      for (let rz = -2; rz <= 0; rz++) {
        const r = planRegion(SEED, macro, rx, rz);
        for (const g of r.gates) {
          const road = r.roads.find((x) => x.from === g.id);
          expect(road, `${r.id} gate ${g.id} has a road`).toBeDefined();
          // The neighbour's road through the same gate starts at the same point and height.
          const nx = rx + Math.round(-g.inX);
          const nz = rz + Math.round(-g.inZ);
          if (inVale(nx, nz)) continue;
          const n = planRegion(SEED, macro, nx, nz);
          const other = n.roads.find((x) => x.from === g.id)!;
          expect(other).toBeDefined();
          expect(Math.hypot(other.points[0]!.x - road!.points[0]!.x, other.points[0]!.z - road!.points[0]!.z)).toBeLessThan(0.01);
          expect(Math.abs(other.heights[0]! - road!.heights[0]!)).toBeLessThan(0.01);
          crossings++;
        }
      }
    expect(crossings).toBeGreaterThan(2);
  });

  it('passes spatial validation across seeds and many regions', () => {
    let regions = 0;
    let sites = 0;
    const kinds = new Set<string>();
    for (const seed of [SEED, 'amber-moss-1', 'gloam-ivy-9']) {
      const m = new MacroField(seed);
      for (let rx = -4; rx <= 3; rx += 2)
        for (let rz = -5; rz <= 2; rz += 2) {
          if (inVale(rx, rz)) continue;
          const r = planRegion(seed, m, rx, rz);
          const report = validateContent(r, new Terrain(m, r.prePads, r.roads, r.pads));
          expect(report.issues, `${r.id}`).toEqual([]);
          regions++;
          sites += r.sites.length;
          for (const s of r.sites) kinds.add(s.kind);
        }
    }
    expect(regions).toBeGreaterThan(30);
    expect(sites / regions).toBeGreaterThan(2);
    for (const k of ['village', 'farmstead', 'watchtower', 'stones', 'shrine', 'camp']) expect(kinds.has(k), k).toBe(true);
  }, 120_000);

  it('plans a region quickly enough to stream (median under 60 ms here)', () => {
    const t: number[] = [];
    const m = new MacroField('timing-seed');
    for (let i = 0; i < 12; i++) {
      const t0 = performance.now();
      planRegion('timing-seed', m, 5 + i, 3);
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    expect(t[6]!).toBeLessThan(60);
  });
});

describe('open world: the vale opens onto it', () => {
  const vale = generateWorldPlan(SEED, macro);
  it('has roads out through its border gates', () => {
    const exits = vale.roads.filter((r) => r.from.includes('/gate/'));
    expect(exits.length).toBeGreaterThanOrEqual(3);
    for (const e of exits) {
      const g = vale.gates.find((x) => x.id === e.from)!;
      expect(Math.hypot(e.points[0]!.x - g.x, e.points[0]!.z - g.z)).toBeLessThan(0.01);
    }
  });

  it('offers side places beyond the main road', () => {
    const extras = vale.sites.filter((s) => s.id.includes('/vale/'));
    expect(extras.length).toBeGreaterThan(0);
  });
});

describe('open world: terrain and ecology across borders', () => {
  const index = new WorldIndex(SEED, macro, generateWorldPlan(SEED, macro));
  const terrain = new WorldTerrain(index);
  it('is continuous across a region border', () => {
    for (let k = 0; k < 40; k++) {
      const z = -1200 + k * 25;
      const x = 3 * REGION;
      const a = terrain.height(x - 0.01, z);
      const b = terrain.height(x + 0.01, z);
      expect(Math.abs(a - b)).toBeLessThan(0.05);
    }
  });

  it('keeps distant terrain close to the planned surface (no visible jumps between detail levels)', () => {
    let worst = 0;
    for (let k = 0; k < 200; k++) {
      const x = 2200 + (k % 20) * 97;
      const z = -1800 + Math.floor(k / 20) * 211;
      worst = Math.max(worst, Math.abs(terrain.height(x, z) - terrain.heightFar(x, z)));
    }
    // Roads and building pads grade the ground by a few metres at most.
    expect(worst).toBeLessThan(12);
  });

  it('never grows trees on procedural roads or in villages', () => {
    const eco = new Ecology(SEED, terrain, index);
    const r = index.region(2, 1)!;
    for (const road of r.roads.slice(0, 4)) {
      for (let i = 0; i < road.points.length; i += 7) {
        const p = road.points[i]!;
        expect(eco.blocked(p.x, p.z, 2.2)).toBe(true);
      }
    }
    for (const b of r.buildings.slice(0, 6)) expect(eco.blocked(b.x, b.z, 2.2)).toBe(true);
  });
});

describe('road routing', () => {
  it('finds a gentle route around a hill rather than over it', () => {
    const hill = (x: number, z: number): number => 60 * Math.exp(-((x - 200) ** 2 + (z - 200) ** 2) / 8000);
    const res = findPath({ bounds: { x0: 0, z0: 0, x1: 400, z1: 400 }, cell: 16, height: hill, start: { x: 40, z: 200 }, goals: [{ x: 360, z: 200 }], goalRadius: 12, maxGrade: 0.15 })!;
    expect(res).not.toBeNull();
    const peak = Math.max(...res.points.map((p) => hill(p.x, p.z)));
    expect(peak).toBeLessThan(30);
  });
});
