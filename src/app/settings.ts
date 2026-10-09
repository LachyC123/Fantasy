/** Player settings, persisted to localStorage (small data only). */
import type { TimeOfDay } from '../rendering/atmosphere';

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
};

const KEY = 'hollow-atlas/settings/v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULT_SETTINGS, ...parsed };
    if (![180, 270, 360].includes(s.internalHeight)) s.internalHeight = 270;
    s.fov = Math.min(100, Math.max(55, Number(s.fov) || 72));
    s.mouseSensitivity = Math.min(3, Math.max(0.2, Number(s.mouseSensitivity) || 1));
    s.volume = Math.min(1, Math.max(0, Number(s.volume)));
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
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
