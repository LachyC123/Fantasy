import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { api, openGame } from './helpers';

// A landscape phone: touch only, no mouse. Touch controls are detected, not forced.
test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

type Player = { x: number; y: number; z: number; yaw: number; onGround: boolean };

async function drag(cdp: CDPSession, from: [number, number], to: [number, number], holdMs: number, page: Page): Promise<void> {
  const pt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(...from) });
  for (let i = 1; i <= 4; i++) {
    const f = i / 4;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f) });
  }
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('phone: touch menus, thumbstick walk, drag to look, jump, swing, use, pause', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('body')).toHaveClass(/touch/);
  // Phones start with the lighter quality preset (no saved settings yet).
  expect(await page.locator('#set-shadows').isChecked()).toBe(false);
  await expect(page.locator('#set-view')).toHaveValue('short');

  await page.locator('[data-action="new-journey"]').tap();
  await expect(page.locator('#new-journey')).toBeVisible();
  await page.locator('[data-action="begin"]').tap();
  await page.waitForFunction(() => (window as any).__hollowAtlas.state() === 'playing', null, { timeout: 240_000 });
  await expect(page.locator('#touch')).toBeVisible();
  await expect(page.locator('#touch .tb-swing')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);

  // Walk: thumb down on the left, slide up (forward), hold.
  const start = await api<Player>(page, 'player');
  await drag(cdp, [150, 300], [150, 230], 3000, page);
  const walked = await api<Player>(page, 'player');
  expect(Math.hypot(walked.x - start.x, walked.z - start.z)).toBeGreaterThan(0.5);

  // Look: drag on the right half turns the view.
  await drag(cdp, [600, 200], [480, 200], 600, page);
  const looked = await api<Player>(page, 'player');
  expect(Math.abs(looked.yaw - walked.yaw)).toBeGreaterThan(0.2);

  // Jump button.
  await page.locator('#touch .tb-jump').tap();
  await page.waitForFunction(() => !(window as any).__hollowAtlas.player().onGround, null, { timeout: 15_000 });
  await page.waitForFunction(() => (window as any).__hollowAtlas.player().onGround, null, { timeout: 30_000 });

  // Swing button.
  await page.locator('#touch .tb-swing').tap();
  await page.waitForFunction(() => (window as any).__hollowAtlas.viewModel.attacking === true, null, { timeout: 15_000 });

  // Use: stand at the junction signpost; the Use button appears and reads it.
  await page.evaluate(() => {
    const h = (window as any).__hollowAtlas;
    const sign = h.plan().props.find((p: any) => p.kind === 'signpost' && p.label === 'The Vale Road');
    h.teleport(sign.x + 2, sign.z + 0.5);
    const pl = h.player();
    h.look(Math.atan2(-(sign.x - pl.x), -(sign.z - pl.z)), -0.05);
  });
  await expect(page.locator('#touch .tb-use')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#hud .prompt')).toContainText('Use');
  await page.locator('#touch .tb-use').tap();
  await expect(page.locator('#hud .message')).toContainText('The Vale Road');

  // Weapon card button.
  await page.locator('#touch .tb-card').tap();
  await expect(page.locator('#hud .weapon-card')).toBeVisible();

  // Pause button; Resume returns straight to play (nothing to capture on touch).
  await page.locator('#touch .tb-pause').tap();
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#touch')).toBeHidden();
  await page.locator('[data-action="resume"]').tap();
  await page.waitForFunction(() => (window as any).__hollowAtlas.state() === 'playing');
  await expect(page.locator('#touch')).toBeVisible();

  expect(errors).toEqual([]);
  expect(await api<string[]>(page, 'errorList')).toEqual([]);
});
