/**
 * Debug: render a top-down hillshaded map of the world plan to a PPM image.
 * Usage: npx vite-node scripts/worldmap.ts -- <seed> <out.ppm> [extent] [centerZ]
 */
import { writeFileSync } from 'node:fs';
import { generateWorldPlan, createTerrain } from '../src/world/plan';
import { maxRoadGrade } from '../src/world/roads';
import { obbCorners } from '../src/world/geometry2d';
import { Ecology } from '../src/world/ecology';

const args = process.argv.slice(2).filter((a) => a !== '--');
const seed = args[0] ?? 'reference-valley';
const out = args[1] ?? 'map.ppm';
const extent = Number(args[2] ?? 2400);
const centerZ = Number(args[3] ?? -900);
const centerX = Number(args[4] ?? 0);
const N = 800;

let t0 = performance.now();
const plan = generateWorldPlan(seed);
console.log(`plan: ${(performance.now() - t0).toFixed(0)} ms`);
const terrain = createTerrain(plan);
const eco = new Ecology(plan, terrain);
const img = new Uint8Array(N * N * 3);
const scale = extent / N;
const toPix = (x: number, z: number): [number, number] => [
  Math.round((x - (centerX - extent / 2)) / scale),
  Math.round((z - (centerZ - extent / 2)) / scale),
];
t0 = performance.now();
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const x = centerX - extent / 2 + px * scale;
    const z = centerZ - extent / 2 + py * scale;
    const h = terrain.height(x, z);
    const n = terrain.normal(x, z, scale * 0.5);
    const shade = Math.max(0, n.x * -0.5 + n.y * 0.7 + n.z * -0.5);
    const forest = eco.forestDensity(x, z);
    let r = 90 + h * 0.4;
    let g = 140 + h * 0.15;
    let b = 70 + h * 0.3;
    if (forest > 0.3) {
      r *= 0.45;
      g *= 0.7;
      b *= 0.45;
    }
    const k = 0.35 + shade * 0.9;
    const i = (py * N + px) * 3;
    img[i] = Math.min(255, r * k);
    img[i + 1] = Math.min(255, g * k);
    img[i + 2] = Math.min(255, b * k);
    const hit = terrain.roadIndex.query(x, z);
    if (hit && hit.dist <= hit.road.halfWidth + scale * 0.5) {
      img[i] = 235;
      img[i + 1] = 215;
      img[i + 2] = 160;
    }
  }
}
console.log(`raster: ${(performance.now() - t0).toFixed(0)} ms`);
const dot = (x: number, z: number, c: [number, number, number], rad = 1): void => {
  const [px, py] = toPix(x, z);
  for (let dy = -rad; dy <= rad; dy++)
    for (let dx = -rad; dx <= rad; dx++) {
      const qx = px + dx;
      const qy = py + dy;
      if (qx < 0 || qy < 0 || qx >= N || qy >= N) continue;
      const i = (qy * N + qx) * 3;
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
    }
};
for (const f of plan.fields) for (const p of obbCorners({ x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2, hd: f.depth / 2 })) dot(p.x, p.z, [220, 200, 60], 1);
for (const b of plan.buildings) {
  for (const p of obbCorners({ x: b.x, z: b.z, yaw: b.yaw, hw: b.width / 2, hd: b.depth / 2 })) dot(p.x, p.z, [200, 40, 30], 1);
  dot(b.x, b.z, [200, 40, 30], 1);
}
for (const fe of plan.fences) for (const p of fe.points) dot(p.x, p.z, [120, 80, 40], 0);
for (const r of plan.ruins) dot(r.x, r.z, [150, 150, 170], 3);
for (const p of plan.props) dot(p.x, p.z, [255, 255, 255], 0);
dot(plan.castle.x, plan.castle.z, [80, 60, 140], 6);
dot(plan.spawn.x, plan.spawn.z, [255, 0, 255], 3);
writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${N} ${N} 255\n`), Buffer.from(img)]));

console.log('castle', plan.castle.name, 'plateau h', plan.castle.plateauHeight.toFixed(1), 'at', plan.castle.x.toFixed(0), plan.castle.z.toFixed(0));
console.log('settlements', plan.settlements.map((s) => `${s.name}(${s.buildingIds.length})`).join(', '));
console.log('buildings', plan.buildings.length, 'fields', plan.fields.length, 'fences', plan.fences.length, 'props', plan.props.length);
for (const r of plan.roads) console.log('road', r.name, 'len', r.arc[r.arc.length - 1]!.toFixed(0), 'max grade', maxRoadGrade(r).toFixed(3));
console.log('spawn h', terrain.height(plan.spawn.x, plan.spawn.z).toFixed(1), 'valley h@(0,-800)', terrain.height(0, -800).toFixed(1));
{
  const r = plan.roads[0]!;
  let worst = 0;
  let wi = 0;
  let cut = 0;
  let ci = 0;
  for (let i = 1; i < r.points.length; i++) {
    const g = Math.abs(r.heights[i]! - r.heights[i - 1]!) / 2;
    if (g > worst) { worst = g; wi = i; }
    const p = r.points[i]!;
    const d = Math.abs(r.heights[i]! - terrain.macro.height(p.x, p.z));
    if (d > cut) { cut = d; ci = i; }
  }
  console.log('worst grade at', r.points[wi], worst.toFixed(3), 'worst cut/fill', cut.toFixed(1), 'm at', r.points[ci]);
}
