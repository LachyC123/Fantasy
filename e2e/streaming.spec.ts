import { test, expect } from '@playwright/test';
import { openGame, beginJourney, api } from './helpers';

// Sustained travel through the forest, past the farm and hamlet and up to the
// castle gate. Measures CPU cost of world streaming per frame and checks that
// GPU geometry counts stay bounded (no leak) — real FPS needs real hardware.
test.use({ viewport: { width: 640, height: 360 } });

test('sustained travel streams the world without stalls or leaks', async ({ page }) => {
  const errors = await openGame(page);
  await beginJourney(page);
  // Rendering cost is irrelevant here (software WebGL); keep frames cheap so the
  // walk completes, and advance a fixed 5 m per frame — a deliberate worst case
  // (on a 60 FPS machine that would be 300 m/s, ~40× sprint speed).
  await api(page, 'setSettings', { internalHeight: 180, shadows: false });
  await api(page, 'resetPerf');
  const before = await api<{ geometries: number }>(page, 'stats');
  for (const road of [1, 0]) {
    await api(page, 'autopilot', road, 5, true);
    await page.waitForFunction(() => !(window as any).__hollowAtlas.autopilotActive(), null, { timeout: 7 * 60_000, polling: 1000 });
  }
  const perf = await api<{ samples: number; median: number; p95: number; max: number }>(page, 'perf');
  const stats = await api<{ geometries: number; terrain: { maxBuildMs: number; nodes: number }; vegetation: { trees: number } }>(page, 'stats');
  console.log('streaming cpu ms', JSON.stringify(perf), 'terrain node build max ms', stats.terrain.maxBuildMs.toFixed(1), 'geometries', before.geometries, '->', stats.geometries);
  expect(perf.samples).toBeGreaterThan(50);
  expect(perf.p95).toBeLessThan(16);
  expect(perf.max).toBeLessThan(120);
  // Geometry count stays within a bounded working set.
  expect(stats.geometries).toBeLessThan(before.geometries * 3 + 200);
  const pl = await api<{ x: number; z: number; onGround: boolean }>(page, 'player');
  const plan = await api<{ castle: { gate: { x: number; z: number } } }>(page, 'plan');
  expect(Math.hypot(pl.x - plan.castle.gate.x, pl.z - plan.castle.gate.z)).toBeLessThan(5);
  const f = await api<{ mean: number; colours: number }>(page, 'frameStats');
  expect(f.mean).toBeGreaterThan(25);
  expect(errors).toEqual([]);
});
