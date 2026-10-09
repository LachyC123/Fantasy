/**
 * Owns one generated world: plan → terrain → ecology → collision →
 * structures → terrain & vegetation streaming → ambient life.
 * Logical records (plan) are separate from the scene graph built from them.
 */
import * as THREE from 'three';
import { generateWorldPlan, createTerrain } from '../world/plan';
import { Ecology } from '../world/ecology';
import { TerrainColorizer } from '../world/terrainColor';
import { TerrainStreamer } from '../world/terrainStreamer';
import { VegetationStreamer } from '../world/vegetationStreamer';
import { buildStructures, type StructureResult } from '../world/structures';
import { CollisionWorld } from '../player/collision';
import { MaterialLibrary } from '../rendering/materials';
import { getTextures } from '../rendering/textures';
import { patchMaterial } from '../rendering/atmosphere';
import { Birds } from '../ambient/birds';
import { ChimneySmoke, AmbientMotes } from '../ambient/particles';
import type { Terrain } from '../world/terrain';
import type { WorldPlan } from '../world/types';
import { validateWorld, type ValidationReport } from '../world/validation';
import { deriveSeed } from '../core/rng';

export interface Interactable {
  id: string;
  position: THREE.Vector3;
  label: string;
  text: string;
}

export type Progress = (stage: string, fraction: number) => void;

export class WorldRuntime {
  readonly group = new THREE.Group();
  plan!: WorldPlan;
  terrain!: Terrain;
  ecology!: Ecology;
  collision!: CollisionWorld;
  terrainStreamer!: TerrainStreamer;
  vegetation!: VegetationStreamer;
  structures!: StructureResult;
  birds!: Birds;
  smoke!: ChimneySmoke;
  motes!: AmbientMotes;
  interactables: Interactable[] = [];
  validation!: ValidationReport;
  private collidersVersion = -1;
  timings: Record<string, number> = {};

  constructor(
    readonly seed: string,
    private readonly materials: MaterialLibrary,
  ) {
    this.group.name = `world ${seed}`;
  }

  async build(progress: Progress, quality: { treeFar: number }): Promise<void> {
    const yieldFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    let t = performance.now();
    const mark = (name: string): void => {
      const now = performance.now();
      this.timings[name] = Math.round(now - t);
      t = now;
    };
    progress('Charting the vale', 0.02);
    await yieldFrame();
    this.plan = generateWorldPlan(this.seed);
    this.terrain = createTerrain(this.plan);
    this.ecology = new Ecology(this.plan, this.terrain);
    this.collision = new CollisionWorld((x, z) => this.terrain.height(x, z));
    mark('plan');

    progress('Raising stone and timber', 0.08);
    await yieldFrame();
    this.structures = buildStructures(this.plan, this.terrain, this.materials, this.collision);
    this.group.add(this.structures.group);
    mark('structures');

    progress('Validating the land', 0.12);
    await yieldFrame();
    this.validation = validateWorld(this.plan, this.terrain, this.collision);
    if (!this.validation.ok) console.warn('[world] validation issues', this.validation.issues);
    mark('validation');

    const spawn = new THREE.Vector3(this.plan.spawn.x, 0, this.plan.spawn.z);
    const colorizer = new TerrainColorizer(this.plan, this.terrain, this.ecology);
    const terrainMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, map: getTextures().grass }));
    // Terrain detail texture repeats every 4 m (geometry UVs are world/4).
    this.terrainStreamer = new TerrainStreamer(this.terrain, colorizer, terrainMat);
    this.group.add(this.terrainStreamer.group);
    await this.terrainStreamer.buildAllAsync(spawn, (d, n) => progress('Shaping hills and hollows', 0.12 + 0.38 * (d / Math.max(1, n))));
    mark('terrain');

    progress('Growing the old woods', 0.5);
    await yieldFrame();
    this.vegetation = new VegetationStreamer(this.ecology, this.materials, { treeFar: quality.treeFar });
    this.group.add(this.vegetation.group);
    await this.vegetation.prepareAsync(spawn, (d, n) => progress('Growing the old woods', 0.5 + 0.45 * (d / Math.max(1, n))));
    this.syncTreeColliders();
    mark('vegetation');

    progress('Waking the birds', 0.97);
    const c = this.plan.castle;
    const hamlet = this.plan.settlements.find((s) => s.kind === 'hamlet')!;
    this.birds = new Birds(
      [
        { center: new THREE.Vector3(c.x, 0, c.z), radius: 70, height: c.plateauHeight + 110, size: 9 },
        { center: new THREE.Vector3(c.x + 40, 0, c.z + 30), radius: 120, height: c.plateauHeight + 70, size: 6 },
        { center: new THREE.Vector3(hamlet.x, 0, hamlet.z), radius: 160, height: 45, size: 7 },
        { center: new THREE.Vector3(this.plan.spawn.x + 30, 0, this.plan.spawn.z - 160), radius: 90, height: 60, size: 8 },
        { center: new THREE.Vector3(-260, 0, -520), radius: 200, height: 70, size: 5 },
      ],
      deriveSeed(this.seed, 'ambient/birds'),
    );
    this.group.add(this.birds.group);
    this.smoke = new ChimneySmoke(this.structures.smoke);
    this.group.add(this.smoke.pool.points);
    this.motes = new AmbientMotes();
    this.group.add(this.motes.pool.points);

    // Readable signs and stones.
    for (const p of this.plan.props) {
      const y = this.terrain.height(p.x, p.z);
      if (p.kind === 'signpost') {
        const toCastle = p.label === 'The Vale Road';
        this.interactables.push({
          id: p.id,
          position: new THREE.Vector3(p.x, y + 1.6, p.z),
          label: 'Read signpost',
          text: toCastle
            ? `“The Vale Road” — north to ${hamlet.name} and ${c.name}. Someone has scratched beneath it: “the bells have not rung since spring”.`
            : `“${p.label}” — the painted letters are fresh; the post beneath is very old.`,
        });
      } else if (p.kind === 'waystone') {
        this.interactables.push({
          id: p.id,
          position: new THREE.Vector3(p.x, y + 1.1, p.z),
          label: 'Examine waystone',
          text: 'A ring is carved into the stone, worn almost smooth. The same mark, you suspect, is cut somewhere else in this vale.',
        });
      } else if (p.kind === 'well') {
        this.interactables.push({ id: p.id, position: new THREE.Vector3(p.x, y + 1, p.z), label: 'Look into the well', text: 'Cold air rises from the dark. Far below, water glints.' });
      }
    }
    mark('ambient');
    progress('Ready', 1);
  }

  private syncTreeColliders(): void {
    if (this.vegetation.collidersVersion === this.collidersVersion) return;
    this.collidersVersion = this.vegetation.collidersVersion;
    this.collision.setDynamicCircles(this.vegetation.colliders.map((c) => ({ x: c.x, z: c.z, r: c.r, y0: -1e4, y1: 1e4 })));
  }

  update(dt: number, cam: THREE.Vector3, wind: THREE.Vector2, budgetMs: number): void {
    this.terrainStreamer.update(cam, budgetMs * 0.5);
    this.vegetation.update(cam, budgetMs * 0.5);
    this.syncTreeColliders();
    this.birds.update(dt);
    this.smoke.update(dt, wind);
    this.motes.update(
      dt,
      cam,
      (x, z) => this.terrain.height(x, z),
      (x, z) => this.ecology.forestBase(x, z, 0),
      wind,
    );
  }

  setPixelScale(scale: number): void {
    this.smoke.setPixelScale(scale);
    this.motes.setPixelScale(scale);
  }

  dispose(): void {
    this.terrainStreamer?.dispose();
    this.vegetation?.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && o.parent?.name === 'structures') mesh.geometry.dispose();
    });
    this.group.clear();
  }
}
