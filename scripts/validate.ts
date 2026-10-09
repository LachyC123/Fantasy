/** Validate world generation across seeds. Usage: npx vite-node scripts/validate.ts -- [n] */
import { generateWorldPlan, createTerrain } from '../src/world/plan';
import { validateWorld } from '../src/world/validation';
import { CollisionWorld } from '../src/player/collision';
import { buildStructures } from '../src/world/structures';
import { MaterialLibrary } from '../src/rendering/materials';

const n = Number(process.argv.slice(2).filter((a) => a !== '--')[0] ?? 8);
const mats = new MaterialLibrary();
let failed = 0;
for (let i = 0; i < n; i++) {
  const seed = i === 0 ? 'reference-valley' : `seed-${i}`;
  const t0 = performance.now();
  const plan = generateWorldPlan(seed);
  const terrain = createTerrain(plan);
  const world = new CollisionWorld((x, z) => terrain.height(x, z));
  const s = buildStructures(plan, terrain, mats, world);
  const r = validateWorld(plan, terrain, world);
  const ms = performance.now() - t0;
  console.log(`${seed}: ${r.ok ? 'OK' : 'FAIL'} checks=${r.checks} buildings=${plan.buildings.length} tris=${s.stats.triangles} colliders=${s.stats.colliders} ${ms.toFixed(0)}ms`);
  for (const issue of r.issues.slice(0, 12)) console.log('   -', issue);
  if (!r.ok) failed++;
}
console.log(`${n - failed}/${n} seeds valid`);
