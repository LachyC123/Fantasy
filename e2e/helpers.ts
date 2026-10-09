import { expect, type Page } from '@playwright/test';

export interface Api {
  state(): string;
  ready(): boolean;
  [k: string]: unknown;
}

export async function openGame(page: Page, seed = 'reference-valley'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(`/?autotest&seed=${seed}`);
  await expect(page.locator('#title h1')).toHaveText('Hollow Atlas');
  await page.waitForFunction(() => (window as any).__hollowAtlas?.ready(), null, { timeout: 240_000 });
  return errors;
}

export async function beginJourney(page: Page): Promise<void> {
  await page.click('[data-action="new-journey"]');
  await expect(page.locator('#new-journey')).toBeVisible();
  await page.click('[data-action="begin"]');
  await page.waitForFunction(() => (window as any).__hollowAtlas.state() === 'playing', null, { timeout: 240_000 });
}

export const api = <T>(page: Page, fn: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([f, a]) => ((window as any).__hollowAtlas[f as string] as (...x: unknown[]) => T)(...(a as unknown[])), [fn, args] as const);
