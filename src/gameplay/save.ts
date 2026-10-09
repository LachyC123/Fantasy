/**
 * Journey saves: one slot in localStorage holding what a journey has changed.
 * The world itself is never saved; it rebuilds identically from the seed.
 * Weapons are saved as the recipe that generates them, not as meshes.
 */
import { GENERATOR_VERSION } from '../core/rng';
import type { SitePlan, WeaponFind } from '../world/types';

/** How to regenerate a weapon: the journey's starting blade, or a find's roll. */
export type WeaponRef = { kind: 'starter' } | { kind: 'find'; id: string; seed: number; luck: number; cls?: WeaponFind['cls'] };

export interface JourneySave {
  /** 2 since v0.7: opening vales are shaped per seed, so earlier positions no longer fit. */
  format: 2;
  generatorVersion: number;
  seed: string;
  savedAt: string;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  weapon: WeaponRef;
  /** What now lies at each find the player has swapped with. */
  swapped: Record<string, WeaponRef>;
  opened: string[];
  openDoors: string[];
  discovered: SitePlan[];
  rumoured: SitePlan[];
  explored: number[];
  travelled: number;
  told: Record<string, SitePlan>;
}

const KEY = 'hollow-atlas/journey/v1';

export function writeSave(save: JourneySave): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function readSave(): JourneySave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as JourneySave;
    // A save from another generator version would describe a different world.
    if (s.format !== 2 || s.generatorVersion !== GENERATOR_VERSION || typeof s.seed !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
