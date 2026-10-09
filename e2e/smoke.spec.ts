import { test, expect } from '@playwright/test';
import { openGame, beginJourney, api } from './helpers';

test('title renders a living, non-blank frame and the menus work', async ({ page }) => {
  const errors = await openGame(page);
  await page.waitForTimeout(1500);
  const f = await api<{ mean: number; colours: number }>(page, 'frameStats');
  expect(f.mean).toBeGreaterThan(25);
  expect(f.colours).toBeGreaterThan(150);

  // Settings: change a value, it persists, Esc closes the panel.
  await page.click('[data-action="open-settings"]');
  await expect(page.locator('#settings')).toBeVisible();
  await page.selectOption('#set-res', '180');
  await expect(page.locator('#settings-status')).toHaveText('Saved.');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hollow-atlas/settings/v1') ?? '{}'));
  expect(stored.internalHeight).toBe(180);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeHidden();
  await page.click('[data-action="open-credits"]');
  await expect(page.locator('#credits')).toBeVisible();
  await page.click('#credits [data-action="back"]');
  await expect(page.locator('#credits')).toBeHidden();
  expect(errors).toEqual([]);
});

test('new journey: walk, jump, swing, read a sign, pause and resume', async ({ page }) => {
  const errors = await openGame(page);
  await beginJourney(page);
  await expect(page.locator('#hud')).toBeVisible();
  const start = await api<{ x: number; y: number; z: number; onGround: boolean }>(page, 'player');
  expect(start.onGround).toBe(true);

  // Walk forward with the real keyboard.
  // Hold W until the player has walked (software rendering runs at a few frames a second).
  await page.keyboard.down('KeyW');
  await page.waitForFunction((s0) => {
    const p = (window as any).__hollowAtlas.player();
    return Math.hypot(p.x - s0.x, p.z - s0.z) > 1.2;
  }, start, { timeout: 60_000, polling: 250 });
  await page.keyboard.up('KeyW');
  const moved = await api<{ x: number; z: number; onGround: boolean }>(page, 'player');
  expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(1);

  // Jump: the player leaves the ground and comes back.
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !(window as any).__hollowAtlas.player().onGround, null, { timeout: 10_000 });
  await page.waitForFunction(() => (window as any).__hollowAtlas.player().onGround, null, { timeout: 20_000 });

  // Sword swing on left click.
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => (window as any).__hollowAtlas.viewModel.attacking === true, null, { timeout: 10_000 });

  // Read the junction signpost: stand in front of it and look at it.
  await page.evaluate(() => {
    const h = (window as any).__hollowAtlas;
    const sign = h.plan().props.find((p: any) => p.kind === 'signpost' && p.label === 'The Vale Road');
    const ax = sign.x + 2;
    const az = sign.z + 0.5;
    h.teleport(ax, az);
    const pl = h.player();
    const dx = sign.x - pl.x;
    const dz = sign.z - pl.z;
    h.look(Math.atan2(-dx, -dz), -0.05);
  });
  await expect(page.locator('#hud .prompt')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#hud .prompt')).toContainText('Read signpost');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#hud .message')).toContainText('The Vale Road');

  // Pause with Esc, resume from the menu.
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  expect(await api<string>(page, 'state')).toBe('paused');
  await page.click('[data-action="resume"]');
  await page.waitForFunction(() => (window as any).__hollowAtlas.state() === 'playing');

  // Back to the title and the world is still there.
  await page.keyboard.press('Escape');
  await page.click('[data-action="to-title"]');
  await expect(page.locator('#title')).toBeVisible();
  const v = await api<{ ok: boolean; issues: string[] }>(page, 'validation');
  expect(v.issues).toEqual([]);
  expect(errors).toEqual([]);
  expect(await api<string[]>(page, 'errorList')).toEqual([]);
});

test('player cannot walk through a cottage wall', async ({ page }) => {
  await openGame(page);
  await beginJourney(page);
  // Stand 4 m in front of a hamlet cottage door and walk straight at it.
  const before = await page.evaluate(() => {
    const h = (window as any).__hollowAtlas;
    const b = h.plan().buildings.find((x: any) => x.settlementId === 'hamlet');
    const s = Math.sin(b.yaw);
    const c = Math.cos(b.yaw);
    const fx = b.x + s * (b.depth / 2 + 4);
    const fz = b.z + c * (b.depth / 2 + 4);
    h.teleport(fx, fz);
    h.look(Math.atan2(s, c), 0); // face the wall (towards -door normal)
    return { b, fx, fz };
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  await page.keyboard.up('KeyW');
  const p = await api<{ x: number; z: number }>(page, 'player');
  // Distance from the building centre along its depth axis must stay outside the wall.
  const s = Math.sin(before.b.yaw);
  const c = Math.cos(before.b.yaw);
  const along = (p.x - before.b.x) * s + (p.z - before.b.z) * c;
  expect(along).toBeGreaterThan(before.b.depth / 2);
});

test('the world still loads when worker scripts are blocked (main-thread fallback)', async ({ page }) => {
  await page.route('**/genWorker*', (r) => r.abort());
  const errors = await openGame(page);
  const stats = await api<{ vegetation: { trees: number }; terrain: { nodes: number }; workers: number }>(page, 'stats');
  expect(stats.workers).toBe(0);
  expect(stats.terrain.nodes).toBeGreaterThan(10);
  expect(stats.vegetation.trees).toBeGreaterThan(100);
  // The failed worker load is reported by the browser itself; nothing else may error.
  expect(errors.filter((e) => !/genWorker|Failed to load resource|net::ERR_FAILED/i.test(e))).toEqual([]);
  expect(await api<string[]>(page, 'errorList')).toEqual([]);
});
