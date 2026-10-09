/**
 * Everything needed to generate world data for one seed, without any scene
 * objects. Constructed identically on the main thread and in each worker:
 * every area is planned deterministically, so every copy agrees exactly.
 */
import { generateWorldPlan } from './plan';
import { MacroField } from './macro';
import { Ecology } from './ecology';
import { TerrainColorizer } from './terrainColor';
import { buildTerrainData, type TerrainNodeData } from './terrainStreamer';
import { treeChunk, groundChunk, grassChunk, type TreeChunkData, type GroundChunkData, type GrassChunkData } from './vegPack';
import { WorldIndex, WorldTerrain } from './worldIndex';
import type { RegionPlan, WorldPlan } from './types';

export type GenJob =
  | { kind: 'terrain'; x0: number; z0: number; size: number; segments: number }
  | { kind: 'trees'; cx: number; cz: number; size: number }
  | { kind: 'ground'; cx: number; cz: number; size: number }
  | { kind: 'grass'; cx: number; cz: number; size: number }
  | { kind: 'region'; rx: number; rz: number };

export type GenResult = TerrainNodeData | TreeChunkData | GroundChunkData | GrassChunkData | RegionPlan;

export class GenCore {
  readonly plan: WorldPlan;
  readonly macro: MacroField;
  readonly index: WorldIndex;
  readonly terrain: WorldTerrain;
  readonly ecology: Ecology;
  readonly colorizer: TerrainColorizer;

  constructor(
    readonly seed: string,
    plan?: WorldPlan,
    index?: WorldIndex,
  ) {
    this.macro = index?.macro ?? new MacroField(seed);
    this.plan = plan ?? index?.vale ?? generateWorldPlan(seed, this.macro);
    this.index = index ?? new WorldIndex(seed, this.macro, this.plan);
    this.terrain = new WorldTerrain(this.index);
    this.ecology = new Ecology(seed, this.terrain, this.index);
    this.colorizer = new TerrainColorizer(this.terrain, this.ecology);
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
      case 'region':
        return this.index.area(job.rx, job.rz).content as RegionPlan;
    }
  }
}
