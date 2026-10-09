import { describe, expect, it } from 'vitest';
import { generateWorldPlan, REFERENCE_SEED } from '../src/world/plan';
import { MacroField } from '../src/world/macro';
import { planRegion } from '../src/world/regionPlan';
import { planVillagers, rumourLine } from '../src/gameplay/villagers';
import { pointInObb } from '../src/world/geometry2d';
import { Terrain } from '../src/world/terrain';

const vale = generateWorldPlan(REFERENCE_SEED);

describe('villagers', () => {
  it('are planned deterministically for every settlement', () => {
    const a = planVillagers(vale);
    const b = planVillagers(generateWorldPlan(REFERENCE_SEED));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(new Set(a.map((v) => v.id)).size).toBe(a.length);
  });

  it('keeps the innkeeper inside the inn, behind the counter', () => {
    const inn = vale.buildings.find((b) => b.kind === 'inn')!;
    const keeper = planVillagers(vale).find((v) => v.trade === 'innkeeper')!;
    expect(keeper.post).toBeDefined();
    expect(pointInObb({ x: inn.x, z: inn.z, yaw: inn.yaw, hw: inn.width / 2 - 0.3, hd: inn.depth / 2 - 0.3 }, keeper.post!.x, keeper.post!.z)).toBe(true);
    expect(Math.abs(keeper.post!.y! - inn.padHeight)).toBeLessThan(0.2);
  });

  it('stroll along streets, never through buildings', () => {
    const m = new MacroField(REFERENCE_SEED);
    for (const [rx, rz] of [
      [2, 1],
      [2, 3],
      [3, -3],
    ] as const) {
      const r = planRegion(REFERENCE_SEED, m, rx, rz);
      const t = new Terrain(m, r.prePads, r.roads, r.pads);
      for (const v of planVillagers(r)) {
        for (const p of v.route ?? []) {
          for (const b of r.buildings) expect(pointInObb({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2, hd: b.depth / 2 }, p.x, p.z, 0.2), `${v.id} walks into ${b.id}`).toBe(false);
          // Street strollers keep to the road surface (farmers walk their yards).
          if (v.trade !== 'farmer') expect(t.roadIndex.surfaceDistance(p.x, p.z)).toBeLessThan(0.5);
        }
      }
    }
  });

  it('pass on rumours that name the place, its direction and distance', () => {
    const v = planVillagers(vale)[0]!;
    const line = rumourLine(v, { kind: 'stones', name: 'the Whispering Ring' }, 1200, 'north-east', 1.5);
    expect(line).toContain('the Whispering Ring');
    expect(line).toContain('north-east');
    expect(line).toContain('an hour’s walk');
    expect(line).toContain('Luck runs strong');
  });
});
