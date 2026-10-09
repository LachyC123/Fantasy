/**
 * Debug: hillshaded overview of the macro height field (no sites), for checking the open world.
 * Usage: npx vite-node scripts/macromap.ts -- <seed> <out.ppm> [extent] [centerX] [centerZ]
 */
import { writeFileSync } from 'node:fs';
import { MacroField } from '../src/world/macro';

const args = process.argv.slice(2).filter((a) => a !== '--');
const seed = args[0] ?? 'reference-valley';
const out = args[1] ?? 'macro.ppm';
const extent = Number(args[2] ?? 16000);
const cx = Number(args[3] ?? 0);
const cz = Number(args[4] ?? -1000);
const N = 600;
const m = new MacroField(seed);
const img = new Uint8Array(N * N * 3);
const s = extent / N;
const t0 = performance.now();
for (let py = 0; py < N; py++)
  for (let px = 0; px < N; px++) {
    const x = cx - extent / 2 + px * s;
    const z = cz - extent / 2 + py * s;
    const h = m.height(x, z);
    const hx = m.height(x + s, z) - h;
    const hz = m.height(x, z + s) - h;
    const shade = Math.max(0.25, Math.min(1.2, 0.85 - (hx + hz) / s * 0.9));
    const slope = Math.hypot(hx, hz) / s;
    let r = 70 + h * 0.35, g = 120 + h * 0.18, b = 60 + h * 0.2;
    if (h > 300) { r = g = b = 150 + h * 0.1; }
    if (slope > 0.6) { r = g = b = 120; }
    const i = (py * N + px) * 3;
    img[i] = Math.min(255, r * shade); img[i + 1] = Math.min(255, g * shade); img[i + 2] = Math.min(255, b * shade);
  }
console.log(`${((performance.now() - t0) / (N * N * 3) * 1000).toFixed(2)} us/sample`);
// Spawn marker and 1 km grid.
for (let k = 0; k < N; k++) for (let q = 0; q < N; q++) {
  const x = cx - extent / 2 + q * s, z = cz - extent / 2 + k * s;
  if (Math.abs(((x % 1024) + 1024) % 1024) < s || Math.abs(((z % 1024) + 1024) % 1024) < s) { const i = (k * N + q) * 3; img[i] = img[i] * 0.7; img[i + 1] *= 0.7; img[i + 2] *= 0.7; }
}
writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${N} ${N} 255\n`), Buffer.from(img)]));
