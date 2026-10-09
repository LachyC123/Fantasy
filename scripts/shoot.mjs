// Drive the game in headless Chromium and capture screenshots of named views.
// Usage: node scripts/shoot.mjs <outDir> [views.json] [baseUrl]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const outDir = process.argv[2] ?? 'shots';
const views = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : [{ name: 'spawn' }];
const base = process.argv[4] ?? 'http://localhost:5173/';
const seed = process.env.SEED ?? 'reference-valley';
const width = Number(process.env.W ?? 1280);
const height = Number(process.env.H ?? 720);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width, height } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`${base}?autotest&seed=${encodeURIComponent(seed)}`);
await page.waitForFunction(() => window.__hollowAtlas?.ready(), null, { timeout: 240000 });
console.log('world ready in', Date.now() - t0, 'ms');
if (process.env.TITLE) await page.screenshot({ path: `${outDir}/00-title.png`, timeout: 300000 });
await page.click('[data-action="new-journey"]');
await page.click('[data-action="begin"]');
await page.waitForFunction(() => window.__hollowAtlas.state() === 'playing', null, { timeout: 240000 });
for (const v of views) {
  await page.evaluate((v) => {
    const h = window.__hollowAtlas;
    const p = h.plan();
    if (v.tod) h.setTimeOfDay(v.tod);
    h.inspectViewModel(!!v.inspect);
    if (v.equip !== undefined) h.equipSeed(v.equip, v.luck ?? 0);
    let x = v.x, z = v.z;
    if (v.at === 'spawn') { x = p.spawn.x; z = p.spawn.z; }
    if (v.at === 'hamlet') { const s = p.settlements.find((s) => s.kind === 'hamlet'); x = s.x + (v.dx ?? 0); z = s.z + (v.dz ?? 0); }
    if (v.at === 'ruin') { x = p.ruins[0].x + (v.dx ?? 0); z = p.ruins[0].z + (v.dz ?? 0); }
    if (v.at === 'farm') { const s = p.settlements.find((s) => s.id === 'farm'); x = s.x + (v.dx ?? 0); z = s.z + (v.dz ?? 0); }
    if (v.at === 'house') {
      const b = p.buildings.filter((b) => b.settlementId === 'hamlet')[v.index ?? 0];
      const d = b.depth / 2 + (v.dist ?? 14);
      x = b.x + Math.sin(b.yaw) * d + Math.cos(b.yaw) * (v.side ?? 0);
      z = b.z + Math.cos(b.yaw) * d - Math.sin(b.yaw) * (v.side ?? 0);
      h.teleport(x, z);
      h.look(Math.atan2(b.x - x, b.z - z) + Math.PI, v.pitch ?? 0.05);
      x = undefined;
    }
    if (v.at === 'find') {
      const f = h.finds().find((f) => f.id.endsWith(v.id));
      const a = v.angle ?? 0.6;
      x = f.anchor[0] + Math.sin(a) * (v.dist ?? 2.6);
      z = f.anchor[2] + Math.cos(a) * (v.dist ?? 2.6);
      h.teleport(x, z);
      const pl = h.player();
      h.look(Math.atan2(-(f.anchor[0] - pl.x), -(f.anchor[2] - pl.z)), v.pitch ?? -0.35);
      return;
    }
    if (v.at === 'road') { const r = p.roads[0]; const pt = r.points[Math.floor(r.points.length * v.t)]; x = pt.x; z = pt.z; }
    if (v.at === 'foot') { const r = p.roads[1]; const pt = r.points[Math.floor(r.points.length * v.t)]; x = pt.x; z = pt.z; }
    if (x !== undefined) h.teleport(x, z);
    if (v.at === 'house') return;
    let yaw = v.yaw;
    if (v.lookAt === 'castle') { const pl = h.player(); yaw = Math.atan2(-(p.castle.x - pl.x), -(p.castle.z - pl.z)); }
    if (v.lookAt === 'spawn-dir') yaw = p.spawn.yaw;
    h.look(yaw ?? h.player().yaw, v.pitch ?? 0);
    if (v.attack) h.attack();
  }, v);
  await page.waitForFunction(() => window.__hollowAtlas.settled(), null, { timeout: 240000 }).catch(() => console.log('not settled'));
  await page.waitForTimeout(v.wait ?? 600);
  await page.screenshot({ path: `${outDir}/${v.name}.png`, timeout: 300000 });
  const st = await page.evaluate(() => window.__hollowAtlas.stats());
  console.log(v.name, JSON.stringify({ calls: st.calls, tris: st.triangles, fps: Math.round(st.fps) }));
}
const errs = await page.evaluate(() => window.__hollowAtlas.errors);
console.log('timings', JSON.stringify(await page.evaluate(() => window.__hollowAtlas.stats().timings)));
console.log('errors', JSON.stringify(errs));
console.log(logs.filter((l) => !l.includes('[vite]')).slice(0, 30).join('\n'));
await browser.close();
