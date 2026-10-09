/**
 * Deterministic seeding and random streams.
 *
 * Every piece of persistent world content must derive its randomness from the
 * world seed through a named namespace (e.g. `terrain/v1`, `vegetation/v1`) so
 * that results never depend on load order or on `Math.random()`.
 */

export const GENERATOR_VERSION = 1;

/** Canonicalise user seed input: trims, lower-cases, collapses whitespace. */
export function canonicalizeSeed(input: string): string {
  const s = input.trim().toLowerCase().replace(/\s+/g, '-');
  return s.length > 0 ? s : 'reference-valley';
}

/** 32-bit string hash (cyrb53 folded to 32 bits). Stable across platforms. */
export function hashString(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Integer avalanche mix (lowbias32). */
export function mix32(x: number): number {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash a base seed with any number of integer coordinates. */
export function hashInts(seed: number, ...ints: number[]): number {
  let h = mix32(seed ^ 0x9e3779b9);
  for (const v of ints) {
    h = mix32(h ^ mix32((v | 0) + 0x632be5ab));
  }
  return h;
}

/** Derive an independent 32-bit seed for a namespace and optional integer keys. */
export function deriveSeed(worldSeed: string, namespace: string, ...ints: number[]): number {
  const base = hashString(`${worldSeed}|${namespace}|v${GENERATOR_VERSION}`);
  return ints.length ? hashInts(base, ...ints) : base;
}

/** Hash-based uniform float in [0,1) for a seed and coordinates; no state. */
export function hashFloat(seed: number, ...ints: number[]): number {
  return hashInts(seed, ...ints) / 4294967296;
}

/** Small fast seeded PRNG stream (mulberry32). */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0,1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Weighted pick; weights need not be normalised. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  /** Approximately normal distribution (Irwin–Hall, 3 samples). */
  gaussian(mean = 0, sd = 1): number {
    return mean + sd * ((this.next() + this.next() + this.next()) * 2 - 3);
  }

  /** Fork an independent child stream. */
  fork(label: number): Rng {
    return new Rng(hashInts(this.state, label));
  }
}

export function rngFor(worldSeed: string, namespace: string, ...ints: number[]): Rng {
  return new Rng(deriveSeed(worldSeed, namespace, ...ints));
}
