/**
 * Vegetation streaming. Scatter data is generated per 64 m chunk in the
 * generation workers (pure, deterministic) and arrives as packed instance
 * matrices. Active chunks are concatenated into a small set of shared
 * InstancedMeshes (one per species × variant × LOD × material), so draw calls
 * stay flat however far you travel. A batch is only re-uploaded when the set
 * of chunks feeding it changes.
 */
import * as THREE from 'three';
import type { TreeSpecies } from './ecology';
import { TREE_SPECIES } from './ecology';
import type { MaterialLibrary, MaterialName } from '../rendering/materials';
import { generateTree, type TreeAsset } from '../assets/trees';
import { groundAsset, type Asset } from '../assets/plants';
import { GROUND_LAYERS, GROUND_VARIANTS, TREE_VARIANTS, type GrassChunkData, type GroundChunkData, type Packed, type TreeChunkData } from './vegPack';
import type { GenPool } from './genPool';

export { TREE_VARIANTS } from './vegPack';

export interface VegetationOptions {
  chunk: number;
  treeFar: number;
  treeMid: number;
  treeNear: number;
  groundRadius: number;
  grassRadius: number;
  colliderRadius: number;
}

const DEFAULTS: VegetationOptions = { chunk: 64, treeFar: 1300, treeMid: 460, treeNear: 110, groundRadius: 150, grassRadius: 70, colliderRadius: 90 };

interface ChunkData {
  cx: number;
  cz: number;
  trees?: TreeChunkData;
  /** Packed instances tagged with their batch index (no string lookups per frame). */
  treeSets?: { full: Tagged[]; thin: Tagged[]; thinner: Tagged[] };
  ground?: GroundChunkData;
  groundSet?: Tagged[];
  grass?: GrassChunkData;
}

interface Tagged {
  bi: number;
  p: Packed;
}

const ckey = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

export interface TreeCollider {
  x: number;
  z: number;
  r: number;
}

class InstanceBatch {
  readonly meshes: THREE.InstancedMesh[] = [];
  private capacity = 0;
  private signature = -1;

  constructor(
    private readonly parent: THREE.Group,
    private readonly parts: [THREE.BufferGeometry, THREE.Material, THREE.Material | undefined][],
    private readonly castShadow: boolean,
    readonly name: string,
  ) {}

  /** Instances currently uploaded. */
  count = 0;

  changed(signature: number): boolean {
    return signature !== this.signature;
  }

  /** Upload concatenated instance data (call only when `changed`). */
  set(chunks: Packed[], signature: number): number {
    let total = 0;
    for (const c of chunks) total += c.count;
    this.count = total;
    if (signature === this.signature) return total;
    this.signature = signature;
    if (total > this.capacity) this.allocate(Math.max(64, Math.ceil(total * 1.5)));
    for (const m of this.meshes) {
      const mat = m.instanceMatrix.array as Float32Array;
      const colr = m.instanceColor!.array as Float32Array;
      let off = 0;
      for (const c of chunks) {
        mat.set(c.matrices.subarray(0, c.count * 16), off * 16);
        colr.set(c.colors.subarray(0, c.count * 3), off * 3);
        off += c.count;
      }
      m.count = total;
      // Upload only the used range.
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, Math.max(1, total) * 16);
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.clearUpdateRanges();
      m.instanceColor!.addUpdateRange(0, Math.max(1, total) * 3);
      m.instanceColor!.needsUpdate = true;
      m.visible = total > 0;
    }
    return total;
  }

  private allocate(cap: number): void {
    for (const m of this.meshes) {
      this.parent.remove(m);
      m.dispose();
    }
    this.meshes.length = 0;
    this.capacity = cap;
    for (const [geo, mat, depth] of this.parts) {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = this.castShadow;
      m.receiveShadow = true;
      if (depth) m.customDepthMaterial = depth;
      m.count = 0;
      m.name = this.name;
      this.meshes.push(m);
      this.parent.add(m);
    }
  }

  dispose(): void {
    for (const m of this.meshes) {
      this.parent.remove(m);
      m.dispose();
    }
  }
}

type Need = 'trees' | 'ground' | 'grass';

/** Vegetation jobs rank after terrain's near nodes (terrain uses log2(size)·1e5 + distance). */
const VEG_PRIORITY = 600000;

export class VegetationStreamer {
  readonly group = new THREE.Group();
  private readonly opts: VegetationOptions;
  private readonly chunks = new Map<number, ChunkData>();
  /** Batch key → index, and index → batches per LOD (built once). */
  private readonly treeIndex = new Map<string, number>();
  private readonly groundIndex = new Map<string, number>();
  private treeBatchList: InstanceBatch[][] = [[], [], []];
  private groundBatchList: InstanceBatch[] = [];
  private readonly requested = new Set<string>();
  private readonly treeAssets = new Map<string, TreeAsset>();
  private readonly nearBatches = new Map<string, InstanceBatch>();
  private readonly midBatches = new Map<string, InstanceBatch>();
  private readonly farBatches = new Map<string, InstanceBatch>();
  private readonly groundBatches = new Map<string, InstanceBatch>();
  private readonly grassBatch: InstanceBatch;
  private readonly wheatBatches: InstanceBatch[];
  private lastCell = '';
  private dirty = true;
  private lastRebuild = 0;
  private lodCell = '';
  /** Batches waiting to upload, applied a few at a time so no frame stalls. */
  private uploads = new Map<InstanceBatch, { list: Packed[]; sig: number; growth: number }>();
  /** Per-frame upload budget in milliseconds. */
  uploadBudgetMs = 2;
  colliders: TreeCollider[] = [];
  collidersVersion = 0;
  stats = { chunks: 0, trees: 0, ground: 0, grass: 0, pending: 0, rebuildMs: 0 };

  constructor(
    private readonly pool: GenPool,
    materials: MaterialLibrary,
    opts: Partial<VegetationOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
    this.group.name = 'vegetation';
    const parts = (asset: Asset): [THREE.BufferGeometry, THREE.Material, THREE.Material | undefined][] =>
      [...asset.entries()].map(([k, g]) => [g, materials.get(k as MaterialName), materials.depth(k as MaterialName)]);
    for (const species of TREE_SPECIES) {
      for (let v = 0; v < TREE_VARIANTS; v++) {
        const asset = generateTree(species, v);
        const key = `${species}:${v}`;
        this.treeAssets.set(key, asset);
        this.nearBatches.set(key, new InstanceBatch(this.group, parts(asset.near), true, `tree-near ${key}`));
        this.midBatches.set(key, new InstanceBatch(this.group, parts(asset.mid), false, `tree-mid ${key}`));
        this.farBatches.set(key, new InstanceBatch(this.group, parts(asset.far), false, `tree-far ${key}`));
      }
    }
    for (const layer of GROUND_LAYERS) {
      for (let v = 0; v < GROUND_VARIANTS; v++) {
        const key = `${layer}:${v}`;
        const cast = layer === 'boulder' || layer === 'bush' || layer === 'log';
        this.groundBatches.set(key, new InstanceBatch(this.group, parts(groundAsset(layer, v)), cast, `ground ${key}`));
      }
    }
    this.grassBatch = new InstanceBatch(this.group, parts(groundAsset('grass', 0)), false, 'grass');
    this.wheatBatches = [0, 1].map((v) => new InstanceBatch(this.group, parts(groundAsset('wheat', v)), false, `crop ${v}`));
    for (const key of this.nearBatches.keys()) {
      this.treeIndex.set(key, this.treeIndex.size);
      this.treeBatchList[0]!.push(this.nearBatches.get(key)!);
      this.treeBatchList[1]!.push(this.midBatches.get(key)!);
      this.treeBatchList[2]!.push(this.farBatches.get(key)!);
    }
    for (const [key, b] of this.groundBatches) {
      this.groundIndex.set(key, this.groundIndex.size);
      this.groundBatchList.push(b);
    }
  }

  /** Change vegetation ranges at runtime (the view distance setting); the next frame rebuilds. */
  setRange(r: Partial<Pick<VegetationOptions, 'treeFar' | 'treeMid' | 'treeNear' | 'groundRadius' | 'grassRadius'>>): void {
    Object.assign(this.opts, r);
    this.dirty = true;
    this.lodCell = '';
  }

  treeAsset(species: TreeSpecies, variant: number): TreeAsset {
    return this.treeAssets.get(`${species}:${variant % TREE_VARIANTS}`)!;
  }

  private chunk(cx: number, cz: number): ChunkData {
    const key = ckey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) this.chunks.set(key, (c = { cx, cz }));
    return c;
  }

  /** Work each chunk still needs at this camera position, with priorities. */
  private plan(cam: THREE.Vector3): { cx: number; cz: number; need: Need; pr: number }[] {
    const size = this.opts.chunk;
    const R = this.opts.treeFar;
    const ccx = Math.floor(cam.x / size);
    const ccz = Math.floor(cam.z / size);
    const rc = Math.ceil(R / size);
    const out: { cx: number; cz: number; need: Need; pr: number }[] = [];
    for (let dx = -rc; dx <= rc; dx++) {
      for (let dz = -rc; dz <= rc; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const d = Math.hypot((cx + 0.5) * size - cam.x, (cz + 0.5) * size - cam.z);
        if (d > R + size) continue;
        const c = this.chunks.get(ckey(cx, cz));
        if (!c?.trees) out.push({ cx, cz, need: 'trees', pr: d });
        if (d < this.opts.groundRadius + size && !c?.ground) out.push({ cx, cz, need: 'ground', pr: d * 0.8 });
        if (d < this.opts.grassRadius + size && !c?.grass) out.push({ cx, cz, need: 'grass', pr: d * 0.6 });
      }
    }
    return out;
  }

  private request(cx: number, cz: number, need: Need, pr: number): Promise<void> {
    const key = `${need}:${cx}:${cz}`;
    this.requested.add(key);
    const req = this.pool.request<TreeChunkData | GroundChunkData | GrassChunkData>({ kind: need, cx, cz, size: this.opts.chunk }, VEG_PRIORITY + pr);
    return req.promise.then((data) => {
      this.requested.delete(key);
      const c = this.chunk(cx, cz);
      if (need === 'trees') {
        const t = data as TreeChunkData;
        c.trees = t;
        const tag = (list: [string, Packed][]): Tagged[] => list.map(([k, p]) => ({ bi: this.treeIndex.get(k)!, p }));
        c.treeSets = { full: tag(t.trees), thin: tag(t.thin), thinner: tag(t.thinner) };
      } else if (need === 'ground') {
        const g = data as GroundChunkData;
        c.ground = g;
        c.groundSet = g.ground.map(([k, p]) => ({ bi: this.groundIndex.get(k)!, p }));
      } else c.grass = data as GrassChunkData;
      this.dirty = true;
    });
  }

  /** Generate everything needed around a point (loading screen). */
  async prepareAsync(cam: THREE.Vector3, onProgress: (done: number, total: number) => void): Promise<void> {
    const jobs = this.plan(cam);
    let done = 0;
    await Promise.all(
      jobs.map((j) =>
        this.request(j.cx, j.cz, j.need, j.pr).then(() => {
          done++;
          if (done % 16 === 0 || done === jobs.length) onProgress(done, jobs.length);
        }),
      ),
    );
    this.lastCell = '';
    this.update(cam);
    this.rebuildNow(cam);
  }

  update(cam: THREE.Vector3): void {
    const cell = `${Math.floor(cam.x / 16)}:${Math.floor(cam.z / 16)}`;
    if (cell !== this.lastCell) {
      this.lastCell = cell;
      const jobs = this.plan(cam);
      const wanted = new Map(jobs.map((j) => [`${j.need}:${j.cx}:${j.cz}`, j.pr]));
      // Drop queued chunk work that is no longer needed; re-rank the rest.
      this.pool.reprioritise((job) => {
        if (job.kind === 'terrain') return undefined;
        const key = `${job.kind}:${job.cx}:${job.cz}`;
        const pr = wanted.get(key);
        if (pr === undefined) {
          this.requested.delete(key);
          return null;
        }
        return VEG_PRIORITY + pr;
      });
      for (const j of jobs) {
        if (!this.requested.has(`${j.need}:${j.cx}:${j.cz}`)) void this.request(j.cx, j.cz, j.need, j.pr);
      }
      this.dirty = true;
    }
    this.stats.pending = this.requested.size;
    // Ring membership follows the camera on a 32 m grid, which limits churn.
    const lodCell = `${Math.floor(cam.x / 32)}:${Math.floor(cam.z / 32)}`;
    const now = performance.now();
    if (lodCell !== this.lodCell || (this.dirty && now - this.lastRebuild > 250)) {
      this.lodCell = lodCell;
      this.rebuild(cam);
    }
    this.flushUploads(this.uploadBudgetMs);
  }

  /** Apply pending batch uploads within a time budget (growing batches first). */
  private flushUploads(budgetMs: number): void {
    if (!this.uploads.size) return;
    const t0 = performance.now();
    const order = [...this.uploads.entries()].sort((a, b) => b[1].growth - a[1].growth);
    for (const [batch, u] of order) {
      batch.set(u.list, u.sig);
      this.uploads.delete(batch);
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  get pendingUploads(): number {
    return this.uploads.size;
  }

  /** Rebuild and upload everything now (loading; tests). */
  rebuildNow(cam: THREE.Vector3): void {
    this.rebuild(cam);
    this.flushUploads(Infinity);
  }

  private rebuild(cam: THREE.Vector3): void {
    const t0 = performance.now();
    this.dirty = false;
    this.lastRebuild = t0;
    const size = this.opts.chunk;
    const nT = this.treeIndex.size;
    const nG = this.groundIndex.size;
    // lists[lod][batch] and FNV-style numeric signatures per batch.
    const treeLists: Packed[][][] = [0, 1, 2].map(() => Array.from({ length: nT }, () => []));
    const treeSigs = [0, 1, 2].map(() => new Uint32Array(nT).fill(2166136261));
    const groundLists: Packed[][] = Array.from({ length: nG }, () => []);
    const groundSigs = new Uint32Array(nG).fill(2166136261);
    const mixSig = (h: number, v: number): number => Math.imul(h ^ (v | 0), 16777619) >>> 0;
    const grass: Packed[] = [];
    const wheat: Packed[][] = [[], []];
    let grassSig = 2166136261;
    const colliders: TreeCollider[] = [];
    let chunks = 0;
    // Walk only the ring of chunks in range, in a fixed order (no sorting, no cache scan).
    const R = this.opts.treeFar + size;
    const ccx = Math.floor(cam.x / size);
    const ccz = Math.floor(cam.z / size);
    const rc = Math.ceil(R / size);
    const midFar = (this.opts.treeMid + this.opts.treeFar) / 2;
    for (let dx = -rc; dx <= rc; dx++) {
      for (let dz = -rc; dz <= rc; dz++) {
        const c = this.chunks.get(ckey(ccx + dx, ccz + dz));
        if (!c) continue;
        const ddx = (c.cx + 0.5) * size - cam.x;
        const ddz = (c.cz + 0.5) * size - cam.z;
        const d = Math.sqrt(ddx * ddx + ddz * ddz);
        if (d > R) continue;
        chunks++;
        const tag = (c.cx * 73856093) ^ (c.cz * 19349663);
        if (c.treeSets) {
          const lod = d < this.opts.treeNear ? 0 : d < this.opts.treeMid ? 1 : 2;
          const thinner = d >= midFar;
          const source = lod < 2 ? c.treeSets.full : thinner ? c.treeSets.thinner : c.treeSets.thin;
          const stag = tag ^ (lod < 2 ? 0 : thinner ? 0x5bd1e995 : 0x27d4eb2d);
          const lists = treeLists[lod]!;
          const sigs = treeSigs[lod]!;
          for (const t of source) {
            lists[t.bi]!.push(t.p);
            sigs[t.bi] = mixSig(sigs[t.bi]!, stag);
          }
        }
        if (c.groundSet && d < this.opts.groundRadius + size * 0.5) {
          for (const t of c.groundSet) {
            groundLists[t.bi]!.push(t.p);
            groundSigs[t.bi] = mixSig(groundSigs[t.bi]!, tag);
          }
        }
        if (c.grass && d < this.opts.grassRadius + size * 0.5) {
          grass.push(c.grass.grass);
          wheat[0]!.push(c.grass.wheat[0]!);
          wheat[1]!.push(c.grass.wheat[1]!);
          grassSig = mixSig(grassSig, tag);
        }
        if (d < this.opts.colliderRadius + size) {
          const l = c.trees?.list;
          if (l) {
            for (let i = 0; i < l.length; i += 5) {
              const asset = this.treeAsset(TREE_SPECIES[l[i]!]!, l[i + 1]!);
              colliders.push({ x: l[i + 2]!, z: l[i + 3]!, r: Math.max(0.2, asset.trunkRadius * l[i + 4]! * 0.95) });
            }
          }
          const s = c.ground?.solids;
          if (s) for (let i = 0; i < s.length; i += 4) colliders.push({ x: s[i + 1]!, z: s[i + 2]!, r: (GROUND_LAYERS[s[i]!] === 'boulder' ? 1.4 : 0.4) * s[i + 3]! });
        }
      }
    }
    // Queue only the batches whose contributing chunks changed.
    const queue = (b: InstanceBatch, list: Packed[], sig: number): number => {
      let total = 0;
      for (const p of list) total += p.count;
      if (b.changed(sig)) this.uploads.set(b, { list, sig, growth: total - b.count });
      else this.uploads.delete(b);
      return total;
    };
    let trees = 0;
    for (let lod = 0; lod < 3; lod++) for (let i = 0; i < nT; i++) trees += queue(this.treeBatchList[lod]![i]!, treeLists[lod]![i]!, treeSigs[lod]![i]!);
    let ground = 0;
    for (let i = 0; i < nG; i++) ground += queue(this.groundBatchList[i]!, groundLists[i]!, groundSigs[i]!);
    const g = queue(this.grassBatch, grass, grassSig);
    this.wheatBatches.forEach((b, i) => queue(b, wheat[i]!, grassSig));
    if (colliders.length !== this.colliders.length || colliders.some((c, i) => c.x !== this.colliders[i]!.x || c.z !== this.colliders[i]!.z)) {
      this.colliders = colliders;
      this.collidersVersion++;
    }
    // Bound the cache (scanned rarely: only when it has grown large).
    if (this.chunks.size > 2600) {
      for (const [k, c] of this.chunks) {
        const d = Math.hypot((c.cx + 0.5) * size - cam.x, (c.cz + 0.5) * size - cam.z);
        if (d > this.opts.treeFar * 1.6) this.chunks.delete(k);
      }
    }
    this.stats = { chunks, trees, ground, grass: g, pending: this.requested.size, rebuildMs: performance.now() - t0 };
  }

  dispose(): void {
    for (const b of [...this.nearBatches.values(), ...this.midBatches.values(), ...this.farBatches.values(), ...this.groundBatches.values(), this.grassBatch, ...this.wheatBatches]) b.dispose();
    this.group.clear();
  }
}
