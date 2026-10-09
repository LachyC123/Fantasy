import { test, expect } from '@playwright/test';
import { openGame, beginJourney, api } from './helpers';

test.use({ viewport: { width: 640, height: 360 } });

// Browser travel check: walk out of the forest and down the Vale Road past the
// farm while terrain and vegetation stream in from the generation workers.
// Headless Chromium here renders with SwiftShader at well under 1 FPS, so this
// checks correctness (streaming completes, nothing breaks, memory stays bounded);
// main-thread streaming cost is benchmarked deterministically in tests/streaming.test.ts.
test('travel streams the world in a real browser without errors or leaks', async ({ page }) => {
  const errors = await openGame(page);
  await beginJourney(page);
  await api(page, 'setSettings', { internalHeight: 180, shadows: false });
  const before = await api<{ geometries: number }>(page, 'stats');
  await api(page, 'autopilot', 1, 6, true, 1);
  await page.waitForFunction(() => !(window as any).__hollowAtlas.autopilotActive(), null, { timeout: 6 * 60_000, polling: 1000 });
  await api(page, 'autopilot', 0, 6, true, 0.3);
  await page.waitForFunction(() => !(window as any).__hollowAtlas.autopilotActive(), null, { timeout: 6 * 60_000, polling: 1000 });
  const stats = await api<{ geometries: number; vegetation: { trees: number; chunks: number } }>(page, 'stats');
  console.log('geometries', before.geometries, '->', stats.geometries, 'trees', stats.vegetation.trees, 'chunks', stats.vegetation.chunks);
  expect(stats.vegetation.trees).toBeGreaterThan(1000);
  expect(stats.geometries).toBeLessThan(before.geometries * 3 + 200);
  const f = await api<{ mean: number; colours: number }>(page, 'frameStats');
  expect(f.mean).toBeGreaterThan(25);
  expect(errors).toEqual([]);
  expect(await api<string[]>(page, 'errorList')).toEqual([]);
});
