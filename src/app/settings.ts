/** Player settings, persisted to localStorage (small data only). */
import type { TimeOfDay } from '../rendering/atmosphere';
import { isTouchDevice } from './device';

export type ViewDistance = 'short' | 'medium' | 'long';

/** Vegetation ranges (metres) per view distance; terrain and buildings always reach the horizon. */
export const VIEW_DISTANCES: Record<ViewDistance, { treeFar: number; treeMid: number; treeNear: number; groundRadius: number; grassRadius: number }> = {
  short: { treeFar: 700, treeMid: 280, treeNear: 75, groundRadius: 95, grassRadius: 42 },
  medium: { treeFar: 1000, treeMid: 380, treeNear: 95, groundRadius: 125, grassRadius: 56 },
  long: { treeFar: 1300, treeMid: 460, treeNear: 110, groundRadius: 150, grassRadius: 70 },
};

export interface Settings {
  internalHeight: 180 | 270 | 360;
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  headBob: boolean;
  volume: number;
  timeOfDay: TimeOfDay;
  shadows: boolean;
  outlines: boolean;
  viewDistance: ViewDistance;
}

export const DEFAULT_SETTINGS: Settings = {
  internalHeight: 270,
  mouseSensitivity: 1,
  invertY: false,
  fov: 72,
  headBob: true,
  volume: 0.8,
  timeOfDay: 'golden',
  shadows: true,
  outlines: true,
  viewDistance: 'long',
};

/** Phones and tablets start lighter: no shadow pass and shorter vegetation ranges. */
export const TOUCH_DEFAULTS: Settings = { ...DEFAULT_SETTINGS, shadows: false, viewDistance: 'short', fov: 75 };

function defaults(): Settings {
  return isTouchDevice() ? { ...TOUCH_DEFAULTS } : { ...DEFAULT_SETTINGS };
}

const KEY = 'hollow-atlas/settings/v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...defaults(), ...parsed };
    if (!(s.viewDistance in VIEW_DISTANCES)) s.viewDistance = defaults().viewDistance;
    if (![180, 270, 360].includes(s.internalHeight)) s.internalHeight = 270;
    s.fov = Math.min(100, Math.max(55, Number(s.fov) || 72));
    s.mouseSensitivity = Math.min(3, Math.max(0.2, Number(s.mouseSensitivity) || 1));
    s.volume = Math.min(1, Math.max(0, Number(s.volume)));
    return s;
  } catch {
    return defaults();
  }
}

export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
