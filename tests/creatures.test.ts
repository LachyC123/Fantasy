import { describe, expect, it } from 'vitest';
import { generateCreature, BODY_PLANS, type Tier } from '../src/gameplay/creatures';
import { MeshBuilder } from '../src/assets/geo';
import { buildCreature } from '../src/assets/creatureMesh';

describe('procedural creatures', () => {
  it('are a pure function of their seed', () => {
    for (let i = 0; i < 40; i++) expect(JSON.stringify(generateCreature(i * 4099))).toBe(JSON.stringify(generateCreature(i * 4099)));
  });

  it('roll threat tiers with a long, rare tail', () => {
    const counts: Record<Tier, number> = { common: 0, elite: 0, champion: 0, mythic: 0 };
    const N = 60_000;
    for (let i = 0; i < N; i++) counts[generateCreature((i * 2246822519) >>> 0).tier]++;
    expect(counts.common / N).toBeGreaterThan(0.84);
    expect(counts.elite / N).toBeGreaterThan(0.08);
    expect(counts.champion / N).toBeGreaterThan(0.025);
    expect(counts.champion / N).toBeLessThan(0.05);
    expect(counts.mythic).toBeGreaterThan(5);
    expect(counts.mythic / N).toBeLessThan(0.002);
  });

  it('scales danger with tier and gives champions proper names', () => {
    for (const plan of BODY_PLANS) {
      const common = generateCreature(11, { plan, tier: 'common' });
      const mythic = generateCreature(11, { plan, tier: 'mythic' });
      expect(mythic.stats.hp).toBeGreaterThan(common.stats.hp * 1.5);
      expect(mythic.title).toBeTruthy();
      expect(mythic.mutations.length).toBeGreaterThanOrEqual(3);
      expect(common.title).toBeNull();
    }
  });

  it('produces an effectively unlimited variety of distinct creatures', () => {
    const forms = new Set<string>();
    const names = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const g = generateCreature(i * 7907 + 3);
      forms.add([g.plan, g.covering, g.size, g.body.torsoLength.toFixed(4), g.body.legLength.toFixed(4), g.body.eyes, g.body.horns, g.palette.body].join(':'));
      names.add(g.title ?? g.name);
    }
    expect(forms.size).toBe(4000);
    expect(names.size).toBeGreaterThan(800);
  });

  it('respects biome and body-plan constraints and arms only armed plans', () => {
    for (let i = 0; i < 200; i++) {
      const g = generateCreature(i, { biome: 'fen' });
      expect(g.biomes).toContain('fen');
      if (g.plan === 'biped' || g.plan === 'brute') expect(g.weapon).not.toBeNull();
      else expect(g.weapon).toBeNull();
      expect(g.name).not.toMatch(/undefined|NaN|\s{2}/);
      expect(g.moves.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('builds a finite mesh for every body plan and tier', () => {
    for (const plan of BODY_PLANS) {
      for (const tier of ['common', 'champion', 'mythic'] as Tier[]) {
        const b = new MeshBuilder();
        const { height } = buildCreature(b, generateCreature(plan.length * 97 + tier.length, { plan, tier }));
        expect(height).toBeGreaterThan(0.3);
        for (const g of b.build().values()) {
          const p = g.getAttribute('position').array as Float32Array;
          expect(p.every((v) => Number.isFinite(v))).toBe(true);
        }
      }
    }
  });
});
