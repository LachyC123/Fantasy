/**
 * Everything needed to generate world data for one seed, without any scene
 * objects. Constructed identically on the main thread and in each worker:
 * the plan is deterministic, so every copy agrees exactly.
 */
import { generateWorldPlan, createTerrain } from './plan';
import { Ecology } from './ecology';
import { TerrainColorizer } from './terrainColor';
import { buildTerrainData, type TerrainNodeData } from './terrainStreamer';
import { treeChunk, groundChunk, grassChunk, type TreeChunkData, type GroundChunkData, type GrassChunkData } from './vegPack';
import type { Terrain } from './terrain';
import type { WorldPlan } from './types';

export type GenJob =
  | { kind: 'terrain'; x0: number; z0: number; size: number; segments: number }
  | { kind: 'trees'; cx: number; cz: number; size: number }
  | { kind: 'ground'; cx: number; cz: number; size: number }
  | { kind: 'grass'; cx: number; cz: number; size: number };

export type GenResult = TerrainNodeData | TreeChunkData | GroundChunkData | GrassChunkData;

export class GenCore {
  readonly plan: WorldPlan;
  readonly terrain: Terrain;
  readonly ecology: Ecology;
  readonly colorizer: TerrainColorizer;

  constructor(readonly seed: string, plan?: WorldPlan) {
    this.plan = plan ?? generateWorldPlan(seed);
    this.terrain = createTerrain(this.plan);
    this.ecology = new Ecology(this.plan, this.terrain);
    this.colorizer = new TerrainColorizer(this.plan, this.terrain, this.ecology);
  }

  run(job: GenJob): GenResult {
    switch (job.kind) {
      case 'terrain':
        return buildTerrainData(this.terrain, this.colorizer, job.x0, job.z0, job.size, job.segments);
      case 'trees':
        return treeChunk(this.ecology, job.cx, job.cz, job.size);
      case 'ground':
        return groundChunk(this.ecology, job.cx, job.cz, job.size);
      case 'grass':
        return grassChunk(this.ecology, job.cx, job.cz, job.size);
    }
  }
}
