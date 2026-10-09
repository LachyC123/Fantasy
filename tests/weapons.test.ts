import { describe, expect, it } from 'vitest';
import { generateWeapon, WEAPON_CLASSES } from '../src/gameplay/weapons';
import { RARITIES, RARITY_ODDS, rollRarity } from '../src/gameplay/luck';
import { Rng } from '../src/core/rng';
import { starterWeapon, findWeapon } from '../src/gameplay/loot';
import { generateWorldPlan, REFERENCE_SEED } from '../src/world/plan';
import { MeshBuilder } from '../src/assets/geo';
import { buildWeapon } from '../src/assets/weaponMesh';

describe('procedural weapons', () => {
  it('are a pure function of their seed', () => {
    for (let i = 0; i < 50; i++) expect(JSON.stringify(generateWeapon(i * 977))).toBe(JSON.stringify(generateWeapon(i * 977)));
  });

  it('follow the rarity odds, including the 1-in-2,000 mythic tail', () => {
    const N = 120_000;
    const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<string, number>;
    for (let i = 0; i < N; i++) counts[generateWeapon((i * 2654435761) >>> 0).rarity]!++;
    for (const r of RARITIES) {
      const expected = RARITY_ODDS[r] * N;
      const tolerance = 5 * Math.sqrt(expected) + 2;
      expect(Math.abs(counts[r]! - expected)).toBeLessThan(tolerance);
    }
    expect(counts.mythic).toBeGreaterThan(20);
  });

  it('lets luck shift the odds both ways', () => {
    const rate = (luck: number): number => {
      const rng = new Rng(99);
      let rare = 0;
      for (let i = 0; i < 40_000; i++) {
        const r = rollRarity(rng, luck);
        if (r !== 'common' && r !== 'uncommon') rare++;
      }
      return rare;
    };
    expect(rate(1.5)).toBeGreaterThan(rate(0) * 1.5);
    expect(rate(-1.5)).toBeLessThan(rate(0) * 0.7);
  });

  it('produces an effectively unlimited, distinct variety', () => {
    const names = new Set<string>();
    const shapes = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const w = generateWeapon(i * 7919 + 13);
      names.add(w.title ?? w.name);
      const sh = w.shape;
      shapes.add([w.cls, sh.bladeLength, sh.bladeWidth, sh.curve, sh.gripLength, sh.headSize, sh.taper, sh.guardSpan].map((v) => (typeof v === 'number' ? v.toFixed(4) : v)).join(':'));
    }
    expect(shapes.size).toBe(5000);
    expect(names.size).toBeGreaterThan(1500);
  });

  it('keeps stats and names sane for every class', () => {
    for (const cls of WEAPON_CLASSES) {
      for (let i = 0; i < 60; i++) {
        const w = generateWeapon(i * 31 + cls.length, { cls });
        expect(w.cls).toBe(cls);
        expect(w.name.length).toBeGreaterThan(3);
        expect(w.name).not.toMatch(/undefined|NaN|\s{2}/);
        expect(w.stats.damage).toBeGreaterThan(3);
        expect(w.stats.damage).toBeLessThan(250);
        expect(w.stats.speed).toBeGreaterThan(0.3);
        expect(w.stats.weight).toBeGreaterThan(0.1);
        if (w.rarity === 'legendary' || w.rarity === 'mythic') expect(w.title).toBeTruthy();
      }
    }
  });

  it('builds a mesh for every class without NaNs', () => {
    for (const cls of WEAPON_CLASSES) {
      for (let i = 0; i < 6; i++) {
        const b = new MeshBuilder();
        buildWeapon(b, generateWeapon(i * 101 + cls.length * 7, { cls, luck: i - 2 }));
        const geos = b.build();
        expect(geos.size).toBeGreaterThan(0);
        for (const g of geos.values()) {
          const p = g.getAttribute('position').array as Float32Array;
          expect(p.length).toBeGreaterThan(9);
          expect(p.every((v) => Number.isFinite(v))).toBe(true);
        }
      }
    }
  });

  it('gives each journey a humble starting blade and deterministic finds', () => {
    const s = starterWeapon(REFERENCE_SEED);
    expect(s.cls).toBe('longsword');
    expect(s.rarity).toBe('common');
    // Other journeys begin with other plain arms, always common.
    const starts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x) => starterWeapon(x));
    expect(new Set(starts.map((w) => w.cls)).size).toBeGreaterThan(2);
    for (const w of starts) expect(w.rarity).toBe('common');
    expect(starterWeapon('a').name).toBe(starterWeapon('a').name);
    const plan = generateWorldPlan(REFERENCE_SEED);
    expect(plan.finds.length).toBeGreaterThanOrEqual(4);
    const a = plan.finds.map((f) => findWeapon(f).name);
    const b = generateWorldPlan(REFERENCE_SEED).finds.map((f) => findWeapon(f).name);
    expect(a).toEqual(b);
    const other = generateWorldPlan('other-seed').finds.map((f) => findWeapon(f).name);
    expect(other).not.toEqual(a);
  });
});
