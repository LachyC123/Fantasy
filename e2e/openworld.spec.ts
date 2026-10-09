import { test, expect } from '@playwright/test';
import { api, beginJourney, openGame } from './helpers';

type Site = { x: number; z: number; name: string; id: string };

test('open world: travel to a procedural village, discover it, read the Atlas, open a chest', async ({ page }) => {
  const errors = await openGame(page);
  await beginJourney(page);

  // A village two regions east of the vale, planned from the seed alone.
  const village = await api<Site>(page, 'nearestSite', 'village', 3000, 1500);
  expect(village).not.toBeNull();
  await api(page, 'teleport', village.x + 6, village.z + 6);
  // The region streams in (planned in a worker, raised over a few frames) and is discovered.
  await page.waitForFunction((id) => (window as any).__hollowAtlas.sites().some((s: { id: string }) => s.id === id), village.id, { timeout: 180_000, polling: 1000 });
  await page.waitForFunction((id) => (window as any).__hollowAtlas.discovered().includes(id), village.id, { timeout: 60_000, polling: 500 });
  await expect(page.locator('#hud .banner')).toContainText(village.name);
  const stats = await api<{ regionsLoaded: number }>(page, 'streamStats');
  expect(stats.regionsLoaded).toBeGreaterThan(1);

  // The Atlas opens with M, shows the place, and closes again.
  await page.keyboard.press('KeyM');
  await expect(page.locator('#atlas')).toBeVisible();
  expect(await api<string>(page, 'state')).toBe('atlas');
  await expect(page.locator('#atlas .atlas-places')).toContainText(village.name);
  await page.click('[data-atlas="out"]');
  await page.keyboard.press('KeyM');
  await expect(page.locator('#atlas')).toBeHidden();
  expect(await api<string>(page, 'state')).toBe('playing');

  // A chest somewhere near: walk up to it, open it, take what lies inside.
  const camp = await api<Site>(page, 'nearestSite', 'camp', village.x, village.z);
  expect(camp).not.toBeNull();
  await api(page, 'teleport', camp.x + 2, camp.z + 2);
  await page.waitForFunction((id) => (window as any).__hollowAtlas.finds().some((f: { id: string; pose: string }) => f.id.startsWith(id) && f.pose === 'chest'), camp.id, { timeout: 180_000, polling: 1000 });
  const chest = await page.evaluate((id) => (window as any).__hollowAtlas.finds().find((f: { id: string; pose: string }) => f.id.startsWith(id) && f.pose === 'chest'), camp.id);
  await page.evaluate((c) => {
    const h = (window as any).__hollowAtlas;
    const [ax, ay, az] = c.anchor;
    // Stand 1.8 m from the chest and look at it.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      h.teleport(ax + Math.sin(a) * 1.8, az + Math.cos(a) * 1.8);
      const p = h.player();
      if (Math.hypot(p.x - ax - Math.sin(a) * 1.8, p.z - az - Math.cos(a) * 1.8) < 0.3) break;
    }
    const p = h.player();
    const dx = ax - p.x;
    const dz = az - p.z;
    h.look(Math.atan2(-dx, -dz), Math.atan2(ay - (p.y + 1.62), Math.hypot(dx, dz)));
  }, chest);
  await expect(page.locator('#hud .prompt')).toContainText('Open chest', { timeout: 30_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#hud .weapon-card')).toBeVisible();
  await expect(page.locator('#hud .prompt')).toContainText('Take', { timeout: 30_000 });
  const before = await api<{ id: string }>(page, 'weapon');
  await page.keyboard.press('KeyE');
  await page.waitForFunction((id) => (window as any).__hollowAtlas.weapon().id !== id, before.id, { timeout: 30_000 });

  expect(errors).toEqual([]);
  expect(await api<string[]>(page, 'errorList')).toEqual([]);
});
