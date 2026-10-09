import { test, expect } from '@playwright/test';
import { api } from './helpers';

test('developer gallery shows unlimited creatures and weapons', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?autotest&gallery');
  await page.waitForFunction(() => (window as any).__hollowAtlas?.state() === 'gallery', null, { timeout: 240_000 });
  await expect(page.locator('#gallery')).toBeVisible();
  const first = await page.locator('#gallery h3').textContent();
  await page.click('[data-gallery="next"]');
  await expect(page.locator('#gallery h3')).not.toHaveText(first ?? '');
  await page.click('[data-gallery="weapons"]');
  await expect(page.locator('#gallery .gc-kicker')).toContainText('Weapon');
  await page.keyboard.press('ArrowRight');
  const g = await api<{ mode: string; index: number }>(page, 'gallery');
  expect(g.mode).toBe('weapons');
  expect(g.index).toBe(2);
  const f = await api<{ mean: number; colours: number }>(page, 'frameStats');
  expect(f.mean).toBeGreaterThan(25);
  expect(errors).toEqual([]);
});
