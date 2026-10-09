import { generateTree } from '../src/assets/trees';
import { groundAsset } from '../src/assets/plants';
import { TREE_SPECIES, Ecology } from '../src/world/ecology';
import { generateWorldPlan, createTerrain } from '../src/world/plan';
const tris = (m: Map<string, any>) => [...m.values()].reduce((n, g) => n + g.getAttribute('position').count / 3, 0);
for (const s of [...TREE_SPECIES, 'ancient'] as const) {
  const a = generateTree(s as any, 0);
  console.log(s.padEnd(8), 'near', tris(a.near), 'far', tris(a.far), 'h', a.height.toFixed(1));
}
for (const l of ['grass', 'wheat', 'bush', 'fern', 'flower', 'rock', 'boulder', 'log', 'mushroom', 'stump'] as const) console.log(l.padEnd(8), tris(groundAsset(l, 0)));
const plan = generateWorldPlan('reference-valley');
const terrain = createTerrain(plan);
const eco = new Ecology(plan, terrain);
const t0 = performance.now();
const rings = [110, 170, 450, 800, 1300];
const counts = rings.map(() => 0);
let ground = new Map<string, number>();
const sx = plan.spawn.x, sz = plan.spawn.z;
for (let cx = -21; cx <= 20; cx++) for (let cz = -21; cz <= 20; cz++) {
  const x0 = sx + cx * 64, z0 = sz + cz * 64;
  const d = Math.hypot(x0 + 32 - sx, z0 + 32 - sz);
  if (d > 1360) continue;
  for (const [, list] of eco.scatterTrees(x0, z0, 64)) for (const p of list) {
    const dd = Math.hypot(p.x - sx, p.z - sz);
    const i = rings.findIndex((r) => dd < r);
    if (i >= 0) counts[i]++;
  }
  if (d < 260) for (const [k, list] of eco.scatterGround(x0, z0, 64)) ground.set(k, (ground.get(k) ?? 0) + list.length);
}
console.log('trees by ring', rings.map((r, i) => `<${r}:${counts[i]}`).join(' '), (performance.now() - t0).toFixed(0), 'ms');
console.log('ground <260', JSON.stringify(Object.fromEntries(ground)));
