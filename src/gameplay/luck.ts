/**
 * Shared luck and rarity model for every procedurally generated thing.
 *
 * A roll produces a continuous "fortune" value with heavy tails: most results
 * cluster around ordinary, while the extremes — astonishing fortune or truly
 * wretched luck — stay possible but rare. Rarity tiers come from the high
 * tail; craft condition comes from both tails.
 */
import type { Rng } from '../core/rng';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'relic' | 'legendary' | 'mythic';
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'relic', 'legendary', 'mythic'];

/** Target probabilities (sum to 1). Mythic ≈ 1 in 2,000. */
export const RARITY_ODDS: Record<Rarity, number> = {
  common: 0.62,
  uncommon: 0.25,
  rare: 0.0945,
  relic: 0.028,
  legendary: 0.007,
  mythic: 0.0005,
};

export const RARITY_COLOURS: Record<Rarity, string> = {
  common: '#d9d2c2',
  uncommon: '#8fcf6a',
  rare: '#6fa8ff',
  relic: '#c48cff',
  legendary: '#ffb347',
  mythic: '#ff6f8e',
};

export type Condition = 'ruined' | 'rusted' | 'worn' | 'sound' | 'fine' | 'masterwork' | 'flawless';
export const CONDITIONS: readonly Condition[] = ['ruined', 'rusted', 'worn', 'sound', 'fine', 'masterwork', 'flawless'];
/** Stat multiplier for each craft condition. */
export const CONDITION_MULT: Record<Condition, number> = {
  ruined: 0.55,
  rusted: 0.75,
  worn: 0.9,
  sound: 1,
  fine: 1.1,
  masterwork: 1.22,
  flawless: 1.35,
};

/**
 * Pick a rarity. `luck` shifts the odds (0 = normal, positive = luckier,
 * negative = unluckier); a luck of +1 roughly doubles the chance of each tier
 * above common.
 */
export function rollRarity(rng: Rng, luck = 0): Rarity {
  const u = rng.next();
  const boost = Math.pow(2, luck);
  let acc = 0;
  // Walk from the rarest tier down so boosted tiers take probability from common.
  for (let i = RARITIES.length - 1; i >= 1; i--) {
    const r = RARITIES[i]!;
    acc += RARITY_ODDS[r] * boost;
    if (u < acc) return r;
  }
  return 'common';
}

/**
 * Craft condition from a fat-tailed fortune value (Student-t-like): both
 * extremes are reachable, the middle is most likely.
 */
export function rollCondition(rng: Rng, luck = 0): Condition {
  const g = rng.gaussian(0, 1);
  const chi = Math.max(0.15, Math.sqrt((rng.gaussian(0, 1) ** 2 + rng.gaussian(0, 1) ** 2 + rng.gaussian(0, 1) ** 2) / 3));
  const fortune = g / chi + luck * 0.6;
  if (fortune < -3.2) return 'ruined';
  if (fortune < -1.6) return 'rusted';
  if (fortune < -0.6) return 'worn';
  if (fortune < 0.9) return 'sound';
  if (fortune < 2.0) return 'fine';
  if (fortune < 3.6) return 'masterwork';
  return 'flawless';
}

export function rarityIndex(r: Rarity): number {
  return RARITIES.indexOf(r);
}
