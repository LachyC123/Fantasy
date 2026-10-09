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
  const waitFor = await page.evaluate((v) => {
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
    // The vale inn: from outside its open door, or inside its taproom.
    if (v.at === 'inn-door' || v.at === 'inn-inside') {
      const inn = p.buildings.find((b) => b.kind === 'inn');
      const d = h.doors().find((x) => x.id.startsWith(inn.id));
      if (v.open && !d.open) h.toggleDoor(d.id);
      const out = { x: Math.sin(inn.yaw), z: Math.cos(inn.yaw) };
      if (v.at === 'inn-door') {
        h.teleport(d.center[0] + out.x * (v.dist ?? 4), d.center[2] + out.z * (v.dist ?? 4));
        h.look(Math.atan2(out.x, out.z) + (v.yawOffset ?? 0), v.pitch ?? 0);
      } else {
        const side = inn.chimney === 'left' ? -1 : 1;
        const lx = -side * (inn.width / 2 - 2.2);
        const lz = inn.depth / 2 - 1.2;
        h.teleport(inn.x + Math.cos(inn.yaw) * lx + Math.sin(inn.yaw) * lz, inn.z - Math.sin(inn.yaw) * lx + Math.cos(inn.yaw) * lz, undefined, undefined, inn.padHeight + (v.loft ? 2.9 : 0.05));
        const pl = h.player();
        h.look(Math.atan2(-(inn.x - pl.x), -(inn.z - pl.z)) + (v.yawOffset ?? 0), v.pitch ?? -0.05);
      }
      return null;
    }
    // Procedural places beyond the vale: found from the seed, then framed.
    if (v.at === 'site' || v.at === 'street') {
      const s = h.nearestSite(v.kind, v.from?.[0] ?? 0, v.from?.[1] ?? 0);
      if (!s) return null;
      let px = s.x + Math.sin(v.angle ?? 0.8) * (v.dist ?? 40);
      let pz = s.z + Math.cos(v.angle ?? 0.8) * (v.dist ?? 40);
      if (v.at === 'street') {
        const r = h.regionPlan(Math.floor(s.x / 1024), Math.floor(s.z / 1024));
        const st = r.roads.find((r2) => r2.id.endsWith('/street'));
        const pt = st.points[Math.floor(st.points.length * (v.t ?? 0.15))];
        px = pt.x;
        pz = pt.z;
      }
      h.teleport(px, pz);
      const pl = h.player();
      h.look(Math.atan2(-(s.x - pl.x), -(s.z - pl.z)) + (v.yawOffset ?? 0), v.pitch ?? 0);
      return s.id;
    }
    if (v.at === 'find') {
      const f = h.finds().find((f) => f.id.endsWith(v.id));
      const a = v.angle ?? 0.6;
      x = f.anchor[0] + Math.sin(a) * (v.dist ?? 2.6);
      z = f.anchor[2] + Math.cos(a) * (v.dist ?? 2.6);
      h.teleport(x, z);
      const pl = h.player();
      h.look(Math.atan2(-(f.anchor[0] - pl.x), -(f.anchor[2] - pl.z)), v.pitch ?? -0.35);
      return null;
    }
    if (v.at === 'road') { const r = p.roads[0]; const pt = r.points[Math.floor(r.points.length * v.t)]; x = pt.x; z = pt.z; }
    if (v.at === 'foot') { const r = p.roads[1]; const pt = r.points[Math.floor(r.points.length * v.t)]; x = pt.x; z = pt.z; }
    if (x !== undefined) h.teleport(x, z);
    if (v.at === 'house') return null;
    let yaw = v.yaw;
    if (v.lookAt === 'castle') { const pl = h.player(); yaw = Math.atan2(-(p.castle.x - pl.x), -(p.castle.z - pl.z)); }
    if (v.lookAt === 'spawn-dir') yaw = p.spawn.yaw;
    h.look(yaw ?? h.player().yaw, v.pitch ?? 0);
    if (v.attack) h.attack();
    return null;
  }, v);
  // A procedural place is ready once its region has streamed in.
  if (waitFor) await page.waitForFunction((id) => window.__hollowAtlas.sites().some((s) => s.id === id), waitFor, { timeout: 300000, polling: 1000 }).catch(() => console.log('region not loaded'));
  if (v.atlas) {
    await page.waitForTimeout(v.wait ?? 600);
    await page.keyboard.press('KeyM');
    for (let k = 0; k < (v.zoomOut ?? 0); k++) await page.click('[data-atlas="out"]');
  }
  await page.waitForFunction(() => window.__hollowAtlas.settled(), null, { timeout: 240000 }).catch(() => console.log('not settled'));
  await page.waitForTimeout(v.wait ?? 600);
  await page.screenshot({ path: `${outDir}/${v.name}.png`, timeout: 300000 });
  if (v.atlas) await page.keyboard.press('KeyM');
  const st = await page.evaluate(() => window.__hollowAtlas.stats());
  console.log(v.name, JSON.stringify({ calls: st.calls, tris: st.triangles, fps: Math.round(st.fps) }));
}
const errs = await page.evaluate(() => window.__hollowAtlas.errors);
console.log('timings', JSON.stringify(await page.evaluate(() => window.__hollowAtlas.stats().timings)));
console.log('errors', JSON.stringify(errs));
console.log(logs.filter((l) => !l.includes('[vite]')).slice(0, 30).join('\n'));
await browser.close();
