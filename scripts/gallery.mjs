// Capture developer-gallery specimens. Usage: node scripts/gallery.mjs <outDir> <mode> <i0> <count> [luck]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [outDir = 'gallery-shots', mode = 'creatures', i0 = '0', count = '8', luck = '0'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173/';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?autotest&gallery`);
await page.waitForFunction(() => window.__hollowAtlas?.state() === 'gallery', null, { timeout: 240000 });
for (let k = 0; k < Number(count); k++) {
  const i = Number(i0) + k;
  const info = await page.evaluate(([m, i, l]) => {
    const h = window.__hollowAtlas;
    h.gallerySet(m, i, l);
    const c = h.gallery().current;
    return `${c.tier ?? c.rarity} | ${c.title ?? ''} | ${c.name} | ${c.plan ?? c.cls}`;
  }, [mode, i, Number(luck)]);
  await page.waitForFunction(() => window.__hollowAtlas.settled(), null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${mode}-${String(i).padStart(4, '0')}.png`, timeout: 300000 });
  console.log(i, info);
}
console.log('errors', JSON.stringify(errors));
await browser.close();
