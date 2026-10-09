import { describe, expect, it } from 'vitest';
import { canonicalizeSeed, deriveSeed, hashString, Rng } from '../src/core/rng';
import { Noise2D } from '../src/core/noise';

describe('seeds and random streams', () => {
  it('canonicalises seed text', () => {
    expect(canonicalizeSeed('  Reference  Valley ')).toBe('reference-valley');
    expect(canonicalizeSeed('')).toBe('reference-valley');
  });

  it('hashes deterministically and spreads values', () => {
    expect(hashString('hollow')).toBe(hashString('hollow'));
    expect(hashString('hollow')).not.toBe(hashString('hollows'));
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(hashString(`k${i}`));
    expect(seen.size).toBe(1000);
  });

  it('derives independent namespaced streams', () => {
    expect(deriveSeed('s', 'terrain')).toBe(deriveSeed('s', 'terrain'));
    expect(deriveSeed('s', 'terrain')).not.toBe(deriveSeed('s', 'vegetation'));
    expect(deriveSeed('s', 'chunk', 1, 2)).not.toBe(deriveSeed('s', 'chunk', 2, 1));
  });

  it('produces reproducible uniform sequences within range', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 5000).toBeGreaterThan(0.47);
    expect(sum / 5000).toBeLessThan(0.53);
    const r = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});

describe('noise', () => {
  it('is deterministic per seed and bounded', () => {
    const a = new Noise2D(1);
    const b = new Noise2D(1);
    const c = new Noise2D(2);
    let differs = false;
    for (let i = 0; i < 500; i++) {
      const x = i * 0.37 - 50;
      const y = i * 0.11 + 13;
      const v = a.sample(x, y);
      expect(v).toBe(b.sample(x, y));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
      if (c.sample(x, y) !== v) differs = true;
      const r = a.ridged(x, y, 4);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
    expect(differs).toBe(true);
  });
});
