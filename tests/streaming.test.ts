import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateWorldPlan, REFERENCE_SEED } from '../src/world/plan';
import { GenCore } from '../src/world/genCore';
import { GenPool } from '../src/world/genPool';
import { TerrainStreamer } from '../src/world/terrainStreamer';
import { VegetationStreamer } from '../src/world/vegetationStreamer';
import { MaterialLibrary } from '../src/rendering/materials';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Sustained travel benchmark: the real terrain and vegetation streamers walk
 * the footpath and the whole Vale Road to the castle gate. Generation runs
 * inline here (in the browser it runs in workers) and is excluded from the
 * timing; what is measured is the main-thread work a frame actually pays:
 * replanning, uploads and instance-batch rebuilds.
 */
describe('streaming', () => {
  it('keeps main-thread streaming cost low during sustained travel', async () => {
    const plan = generateWorldPlan(REFERENCE_SEED);
    const pool = new GenPool(plan.seed, new GenCore(plan.seed, plan));
    expect(pool.usingWorkers).toBe(false); // Node: inline fallback
    const terrain = new TerrainStreamer(pool, new THREE.MeshBasicMaterial());
    const veg = new VegetationStreamer(pool, new MaterialLibrary());
    const cam = new THREE.Vector3(plan.spawn.x, 0, plan.spawn.z);
    const ready = Promise.all([terrain.buildAllAsync(cam, () => undefined), veg.prepareAsync(cam, () => undefined)]);
    await pool.drain();
    await ready;

    const samples: number[] = [];
    const route = [...plan.roads[1]!.points, ...plan.roads[0]!.points];
    for (let i = 0; i < route.length; i += 3) {
      const p = route[i]!;
      cam.set(p.x, 0, p.z);
      const t0 = performance.now();
      terrain.update(cam);
      veg.update(cam); // replans, rebuilds on 32 m cells, uploads within its per-frame budget
      samples.push(performance.now() - t0);
      // Generation (worker work in the browser) — not counted.
      pool.tickInline(1e9);
      await flush();
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)]!;
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    const max = samples[samples.length - 1]!;
    console.log(`streaming main-thread ms over ${samples.length} steps: p50 ${p50.toFixed(2)} p95 ${p95.toFixed(2)} max ${max.toFixed(2)}; last list rebuild ${veg.stats.rebuildMs.toFixed(2)} ms; terrain nodes ${terrain.stats.nodes}`);
    // Every queued upload eventually lands.
    for (let k = 0; k < 200 && veg.pendingUploads > 0; k++) veg.update(cam);
    expect(veg.pendingUploads).toBe(0);
    expect(p95).toBeLessThan(8);
    expect(max).toBeLessThan(40);
    expect(terrain.stats.nodes).toBeGreaterThan(50);
    expect(veg.stats.trees).toBeGreaterThan(1000);
  }, 300_000);
});
