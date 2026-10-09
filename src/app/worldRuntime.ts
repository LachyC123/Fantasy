/**
 * Owns one generated world: the vale and the endless procedural regions
 * around it. Logical records (plans) are separate from the scene graph built
 * from them. Regions are planned in workers, then their structures,
 * colliders, finds and readable things stream in around the player and out
 * again behind; castles are landmarks built from kilometres away.
 */
import * as THREE from 'three';
import { generateWorldPlan } from '../world/plan';
import { MacroField } from '../world/macro';
import { Ecology } from '../world/ecology';
import { GenCore } from '../world/genCore';
import { GenPool } from '../world/genPool';
import { TerrainStreamer } from '../world/terrainStreamer';
import { VegetationStreamer, type VegetationOptions } from '../world/vegetationStreamer';
import { buildStructures, buildStructureSteps, buildCastleStructure, type StructureResult } from '../world/structures';
import { CollisionWorld } from '../player/collision';
import { MaterialLibrary } from '../rendering/materials';
import { getTextures } from '../rendering/textures';
import { patchMaterial } from '../rendering/atmosphere';
import { Birds } from '../ambient/birds';
import { ChimneySmoke, AmbientMotes } from '../ambient/particles';
import type { CastlePlan, RegionPlan, SitePlan, WorldContent, WorldPlan } from '../world/types';
import { validateWorld, type ValidationReport } from '../world/validation';
import { deriveSeed } from '../core/rng';
import { LootSystem } from '../gameplay/loot';
import { WorldIndex, WorldTerrain } from '../world/worldIndex';
import { REGION, cellOf, inVale, VALE_BOUNDS } from '../world/regions';
import type { Bounds } from '../world/types';

export interface Interactable {
  id: string;
  position: THREE.Vector3;
  label: string;
  text: string;
}

export type Progress = (stage: string, fraction: number) => void;

/** Structures for a planned area are built within this distance (metres to the area's edge). */
const LOAD_RADIUS = 1150;
/** …and dropped beyond this one. */
const UNLOAD_RADIUS = 1700;
/** Castles are seen from afar. */
const LANDMARK_RADIUS = 5200;
const LANDMARK_UNLOAD = 6400;

interface LoadedArea {
  id: string;
  content: WorldContent;
  group: THREE.Group;
  smoke: THREE.Vector3[];
  interactables: Interactable[];
}

const distToBounds = (b: Bounds, x: number, z: number): number => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

export class WorldRuntime {
  readonly group = new THREE.Group();
  plan!: WorldPlan;
  macro!: MacroField;
  index!: WorldIndex;
  terrain!: WorldTerrain;
  ecology!: Ecology;
  collision!: CollisionWorld;
  terrainStreamer!: TerrainStreamer;
  vegetation!: VegetationStreamer;
  birds!: Birds;
  smoke!: ChimneySmoke;
  motes!: AmbientMotes;
  loot!: LootSystem;
  validation!: ValidationReport;
  pool!: GenPool;
  private collidersVersion = -1;
  timings: Record<string, number> = {};
  private readonly loaded = new Map<string, LoadedArea>();
  private readonly landmarks = new Map<string, { group: THREE.Group; castle: CastlePlan }>();
  private readonly requested = new Set<string>();
  /** A region being raised over several frames. */
  private building: { id: string; content: WorldContent; steps: Generator<void, StructureResult, void>; ms: number } | null = null;
  /** Main-thread time per frame for raising streamed structures. */
  buildBudgetMs = 4;
  private interactableCache: Interactable[] | null = null;
  private streamTimer = 0;
  /** Streaming counters for the debug overlay and tests. */
  readonly streamStats = { regionsLoaded: 0, regionsPlannedHere: 0, landmarks: 0, lastBuildMs: 0, maxBuildMs: 0 };

  constructor(
    readonly seed: string,
    private readonly materials: MaterialLibrary,
  ) {
    this.group.name = `world ${seed}`;
  }

  async build(progress: Progress, quality: Partial<VegetationOptions> = {}): Promise<void> {
    const yieldFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    let t = performance.now();
    const mark = (name: string): void => {
      const now = performance.now();
      this.timings[name] = Math.round(now - t);
      t = now;
    };
    progress('Charting the vale', 0.02);
    await yieldFrame();
    this.macro = new MacroField(this.seed);
    this.plan = generateWorldPlan(this.seed, this.macro);
    this.index = new WorldIndex(this.seed, this.macro, this.plan);
    this.index.onPlanned = () => this.streamStats.regionsPlannedHere++;
    this.terrain = new WorldTerrain(this.index);
    this.ecology = new Ecology(this.seed, this.terrain, this.index);
    this.collision = new CollisionWorld((x, z) => this.terrain.height(x, z));
    mark('plan');

    progress('Raising stone and timber', 0.06);
    await yieldFrame();
    this.loot = new LootSystem(this.terrain, this.materials);
    this.group.add(this.loot.group);
    this.smoke = new ChimneySmoke([]);
    this.group.add(this.smoke.pool.points);
    const spawn = new THREE.Vector3(this.plan.spawn.x, 0, this.plan.spawn.z);
    // Everything near the spawn is planned and built before the journey begins.
    this.loadArea('vale', this.plan);
    for (const [rx, rz] of this.cellsWithin(spawn.x, spawn.z, LOAD_RADIUS)) {
      const r = this.index.region(rx, rz);
      if (r) this.loadArea(r.id, r);
    }
    mark('structures');

    progress('Raising distant towers', 0.1);
    await yieldFrame();
    this.updateLandmarks(spawn, Infinity);
    mark('landmarks');

    progress('Validating the land', 0.12);
    await yieldFrame();
    this.validation = validateWorld(this.plan, this.terrain, this.collision);
    if (!this.validation.ok) console.warn('[world] validation issues', this.validation.issues);
    mark('validation');

    // Generation workers rebuild the same deterministic world from the seed.
    this.pool = new GenPool(this.seed, new GenCore(this.seed, this.plan, this.index));
    const terrainMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, map: getTextures().grass }));
    // Terrain detail texture repeats every 4 m (geometry UVs are world/4).
    this.terrainStreamer = new TerrainStreamer(this.pool, terrainMat);
    this.group.add(this.terrainStreamer.group);
    const terrainDone = this.terrainStreamer.buildAllAsync(spawn, (d, n) => progress('Shaping hills and hollows', 0.12 + 0.38 * (d / Math.max(1, n))));
    await Promise.all([terrainDone, this.pool.drain()]);
    mark('terrain');

    progress('Growing the old woods', 0.5);
    await yieldFrame();
    this.vegetation = new VegetationStreamer(this.pool, this.materials, quality);
    this.group.add(this.vegetation.group);
    const vegDone = this.vegetation.prepareAsync(spawn, (d, n) => progress('Growing the old woods', 0.5 + 0.45 * (d / Math.max(1, n))));
    await Promise.all([vegDone, this.pool.drain()]);
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
    this.motes = new AmbientMotes();
    this.group.add(this.motes.pool.points);
    mark('ambient');
    progress('Ready', 1);
  }

  /** Region cells whose square comes within `r` metres of a point (the vale's cells excluded). */
  private cellsWithin(x: number, z: number, r: number): [number, number][] {
    const out: [number, number][] = [];
    for (let rx = cellOf(x - r); rx <= cellOf(x + r); rx++)
      for (let rz = cellOf(z - r); rz <= cellOf(z + r); rz++) {
        if (inVale(rx, rz)) continue;
        const b = { x0: rx * REGION, z0: rz * REGION, x1: (rx + 1) * REGION, z1: (rz + 1) * REGION };
        if (distToBounds(b, x, z) <= r) out.push([rx, rz]);
      }
    return out;
  }

  /** Build an area's structures, colliders, finds and readable things (all at once: loading). */
  private loadArea(id: string, content: WorldContent): void {
    if (this.loaded.has(id)) return;
    const t0 = performance.now();
    this.collision.group = id;
    const s = buildStructures(content, this.terrain, this.materials, this.collision, content === this.plan ? { ancientTree: this.plan.ancientTree } : {});
    this.collision.group = undefined;
    this.finishArea(id, content, s, performance.now() - t0);
  }

  /** Continue raising the area under construction within the frame budget. */
  private continueBuild(): void {
    const b = this.building;
    if (!b) return;
    const t0 = performance.now();
    this.collision.group = b.id;
    let res: IteratorResult<void, StructureResult>;
    do res = b.steps.next();
    while (!res.done && performance.now() - t0 < this.buildBudgetMs);
    this.collision.group = undefined;
    b.ms += performance.now() - t0;
    if (res.done) {
      this.building = null;
      this.finishArea(b.id, b.content, res.value, b.ms);
    }
  }

  private finishArea(id: string, content: WorldContent, s: StructureResult, ms: number): void {
    const t0 = performance.now();
    s.group.name = `area ${id}`;
    this.group.add(s.group);
    this.loot.addArea(id, content.finds, content.props);
    const area: LoadedArea = { id, content, group: s.group, smoke: s.smoke, interactables: this.readables(content) };
    this.loaded.set(id, area);
    this.interactableCache = null;
    this.smoke.setEmitters([...this.loaded.values()].flatMap((a) => a.smoke));
    ms += performance.now() - t0;
    this.streamStats.lastBuildMs = ms;
    this.streamStats.maxBuildMs = Math.max(this.streamStats.maxBuildMs, ms);
    this.streamStats.regionsLoaded = this.loaded.size;
  }

  private unloadArea(id: string): void {
    if (this.building?.id === id) {
      // Abandon a half-raised area: its colliders go with its group.
      this.building = null;
      this.collision.removeGroup(id);
    }
    const a = this.loaded.get(id);
    if (!a) return;
    this.group.remove(a.group);
    a.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.collision.removeGroup(id);
    this.loot.removeArea(id);
    this.loaded.delete(id);
    this.interactableCache = null;
    this.smoke.setEmitters([...this.loaded.values()].flatMap((x) => x.smoke));
    this.streamStats.regionsLoaded = this.loaded.size;
  }

  /** Castles within sight, built from skeletons alone (no full plan needed). */
  private updateLandmarks(cam: THREE.Vector3, budget: number): void {
    const want = new Map<string, CastlePlan>();
    for (const c of this.plan.castles) want.set(c.id, c);
    for (const [rx, rz] of this.cellsWithin(cam.x, cam.z, LANDMARK_RADIUS)) {
      const sk = this.index.skeleton(rx, rz);
      if (sk) for (const c of sk.castles) want.set(c.id, c);
    }
    let built = 0;
    for (const [id, c] of want) {
      if (this.landmarks.has(id) || built >= budget) continue;
      this.collision.group = `castle:${id}`;
      const s = buildCastleStructure(c, this.materials, this.collision);
      this.collision.group = undefined;
      this.group.add(s.group);
      this.landmarks.set(id, { group: s.group, castle: c });
      built++;
    }
    for (const [id, l] of [...this.landmarks]) {
      if (this.plan.castles.includes(l.castle)) continue;
      if (Math.hypot(l.castle.x - cam.x, l.castle.z - cam.z) < LANDMARK_UNLOAD) continue;
      this.group.remove(l.group);
      l.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      this.collision.removeGroup(`castle:${id}`);
      this.landmarks.delete(id);
    }
    this.streamStats.landmarks = this.landmarks.size;
  }

  /** Keep the right areas planned and built around the player. One build per call keeps frames smooth. */
  private stream(cam: THREE.Vector3): void {
    // Unload what is far behind.
    for (const [id, a] of [...this.loaded]) if (distToBounds(a.content.bounds, cam.x, cam.z) > UNLOAD_RADIUS) this.unloadArea(id);
    if (this.building) {
      if (distToBounds(this.building.content.bounds, cam.x, cam.z) > UNLOAD_RADIUS) this.unloadArea(this.building.id);
      return;
    }
    if (!this.loaded.has('vale') && distToBounds(VALE_BOUNDS, cam.x, cam.z) < LOAD_RADIUS) {
      this.startBuild('vale', this.plan);
      return;
    }
    const cells = this.cellsWithin(cam.x, cam.z, LOAD_RADIUS).sort((a, b) => this.cellDist(a, cam) - this.cellDist(b, cam));
    for (const [rx, rz] of cells) {
      const key = `${rx},${rz}`;
      if (this.index.has(rx, rz)) {
        const r = this.index.region(rx, rz)!;
        if (!this.loaded.has(r.id)) {
          this.startBuild(r.id, r);
          return;
        }
        continue;
      }
      // Plan in a worker; adopt the identical plan when it arrives.
      if (!this.requested.has(key)) {
        this.requested.add(key);
        const req = this.pool.request<RegionPlan>({ kind: 'region', rx, rz }, -1e6 + this.cellDist([rx, rz], cam));
        req.promise
          .then((plan) => this.index.adopt(plan))
          .catch((e: unknown) => console.warn('[world] region plan failed', rx, rz, e))
          .finally(() => this.requested.delete(key));
      }
    }
  }

  private startBuild(id: string, content: WorldContent): void {
    this.building = { id, content, ms: 0, steps: buildStructureSteps(content, this.terrain, this.materials, this.collision, content === this.plan ? { ancientTree: this.plan.ancientTree } : {}) };
  }

  private cellDist([rx, rz]: [number, number], cam: THREE.Vector3): number {
    return distToBounds({ x0: rx * REGION, z0: rz * REGION, x1: (rx + 1) * REGION, z1: (rz + 1) * REGION }, cam.x, cam.z);
  }

  /** Signs, stones, wells and shrines the player can read. */
  private readables(content: WorldContent): Interactable[] {
    const out: Interactable[] = [];
    const vale = content === this.plan;
    const hamlet = vale ? this.plan.settlements.find((s) => s.kind === 'hamlet') : undefined;
    for (const p of content.props) {
      const y = this.terrain.height(p.x, p.z);
      if (p.kind === 'signpost') {
        const toCastle = vale && p.label === 'The Vale Road';
        out.push({
          id: p.id,
          position: new THREE.Vector3(p.x, y + 1.6, p.z),
          label: 'Read signpost',
          text:
            p.text ??
            (toCastle
              ? `“The Vale Road” — north to ${hamlet?.name ?? 'the hamlet'} and ${this.plan.castle.name}. Someone has scratched beneath it: “the bells have not rung since spring”.`
              : `“${p.label}” — the painted letters are fresh; the post beneath is very old.`),
        });
      } else if (p.kind === 'waystone') {
        out.push({ id: p.id, position: new THREE.Vector3(p.x, y + 1.1, p.z), label: 'Examine waystone', text: p.text ?? 'A ring is carved into the stone, worn almost smooth. The same mark, you suspect, is cut somewhere else in this land.' });
      } else if (p.kind === 'well') {
        out.push({ id: p.id, position: new THREE.Vector3(p.x, y + 1, p.z), label: 'Look into the well', text: 'Cold air rises from the dark. Far below, water glints.' });
      } else if (p.kind === 'shrine') {
        out.push({ id: p.id, position: new THREE.Vector3(p.x, y + 1.2, p.z), label: 'Examine shrine', text: p.text ?? 'A small stone shrine. Someone still leaves candles here.' });
      }
    }
    return out;
  }

  get interactables(): Interactable[] {
    return (this.interactableCache ??= [...this.loaded.values()].flatMap((a) => a.interactables));
  }

  /** Named places in every planned area (for discovery and the Atlas). */
  get sites(): SitePlan[] {
    return [...this.loaded.values()].flatMap((a) => a.content.sites);
  }

  /** The name of the region at a point ("The Ashen Downs"). */
  regionNameAt(x: number, z: number): string {
    const rx = cellOf(x);
    const rz = cellOf(z);
    if (inVale(rx, rz)) return this.plan.regionName;
    const n = this.index.skeleton(rx, rz)?.name ?? 'the wilds';
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  /** Planned content around a point (settlements, ruins …). */
  contentsNear(x: number, z: number): readonly WorldContent[] {
    return this.index.contentsNear(x, z);
  }

  /** Every loaded area (vale and regions). */
  get loadedAreas(): WorldContent[] {
    return [...this.loaded.values()].map((a) => a.content);
  }

  private syncTreeColliders(): void {
    if (this.vegetation.collidersVersion === this.collidersVersion) return;
    this.collidersVersion = this.vegetation.collidersVersion;
    this.collision.setDynamicCircles(this.vegetation.colliders.map((c) => ({ x: c.x, z: c.z, r: c.r, y0: -1e4, y1: 1e4 })));
  }

  update(dt: number, cam: THREE.Vector3, wind: THREE.Vector2, budgetMs: number): void {
    this.pool.tickInline(budgetMs); // only does work when workers are unavailable
    this.streamTimer -= dt;
    if (this.streamTimer <= 0) {
      this.streamTimer = 0.25;
      this.stream(cam);
      this.updateLandmarks(cam, 1);
    }
    this.continueBuild();
    this.terrainStreamer.update(cam);
    this.vegetation.update(cam);
    this.syncTreeColliders();
    this.birds.update(dt);
    this.loot.update(dt, cam);
    this.smoke.update(dt, wind, cam);
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
    this.pool?.dispose();
    this.terrainStreamer?.dispose();
    this.vegetation?.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (o.parent?.name.startsWith('area ') || o.parent?.name.startsWith('castle '))) mesh.geometry.dispose();
    });
    this.group.clear();
  }
}
