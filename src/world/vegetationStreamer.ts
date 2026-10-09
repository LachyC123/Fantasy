/**
 * Vegetation streaming. Scatter data is computed per 64 m chunk (pure,
 * deterministic) and cached as packed instance matrices; every frame the
 * active chunks are concatenated into a small set of shared InstancedMeshes
 * (one per species × variant × LOD × material) so draw calls stay flat no
 * matter how far you travel.
 */
import * as THREE from 'three';
import type { Ecology, GroundLayer, Placement, TreeSpecies } from './ecology';
import { TREE_SPECIES } from './ecology';
import type { MaterialLibrary, MaterialName } from '../rendering/materials';
import { generateTree, type TreeAsset } from '../assets/trees';
import { groundAsset, type Asset } from '../assets/plants';

export const TREE_VARIANTS = 3;
const GROUND_VARIANTS = 3;
const GROUND_LAYERS: GroundLayer[] = ['bush', 'fern', 'flower', 'rock', 'boulder', 'log', 'mushroom', 'stump'];

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

interface Packed {
  matrices: Float32Array;
  colors: Float32Array;
  count: number;
}

interface ChunkData {
  cx: number;
  cz: number;
  /** key `${species}:${variant}` → packed (full density, then two thinned sets for distance). */
  trees: Map<string, Packed>;
  thin: Map<string, Packed>;
  thinner: Map<string, Packed>;
  treeList: { species: TreeSpecies; p: Placement }[];
  ground?: Map<string, Packed>;
  groundList?: { layer: GroundLayer; p: Placement }[];
  grass?: { grass: Packed; wheat: Packed[] };
}

export interface TreeCollider {
  x: number;
  z: number;
  r: number;
}

class InstanceBatch {
  readonly meshes: THREE.InstancedMesh[] = [];
  private capacity = 0;

  constructor(
    private readonly parent: THREE.Group,
    private readonly parts: [THREE.BufferGeometry, THREE.Material, THREE.Material | undefined][],
    private readonly castShadow: boolean,
    readonly name: string,
  ) {}

  /** Upload concatenated instance data; grows capacity geometrically. */
  set(chunks: Packed[]): number {
    let total = 0;
    for (const c of chunks) total += c.count;
    if (total > this.capacity) this.allocate(Math.max(64, Math.ceil(total * 1.5)));
    if (this.meshes.length === 0) return 0;
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
      m.instanceMatrix.needsUpdate = true;
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

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function pack(list: Placement[], tintRange: [number, number], tilt = 0): Packed {
  const matrices = new Float32Array(list.length * 16);
  const colors = new Float32Array(list.length * 3);
  list.forEach((pl, i) => {
    _q.setFromAxisAngle(_up, pl.yaw);
    if (tilt) _q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((pl.tint - 0.5) * tilt, 0, (pl.variant / 3 - 0.5) * tilt)));
    _m.compose(_p.set(pl.x, pl.y, pl.z), _q, _s.setScalar(pl.scale));
    _m.toArray(matrices, i * 16);
    const k = tintRange[0] + (tintRange[1] - tintRange[0]) * pl.tint;
    colors[i * 3] = k * (0.97 + pl.tint * 0.06);
    colors[i * 3 + 1] = k;
    colors[i * 3 + 2] = k * (1.02 - pl.tint * 0.06);
  });
  return { matrices, colors, count: list.length };
}

export class VegetationStreamer {
  readonly group = new THREE.Group();
  private readonly opts: VegetationOptions;
  private readonly chunks = new Map<string, ChunkData>();
  private readonly treeAssets = new Map<string, TreeAsset>();
  private readonly nearBatches = new Map<string, InstanceBatch>();
  private readonly midBatches = new Map<string, InstanceBatch>();
  private readonly farBatches = new Map<string, InstanceBatch>();
  private readonly groundBatches = new Map<string, InstanceBatch>();
  private grassBatch!: InstanceBatch;
  private wheatBatches: InstanceBatch[] = [];
  private lastCell = '';
  private pending: { cx: number; cz: number; need: 'trees' | 'ground' | 'grass' }[] = [];
  private dirty = true;
  colliders: TreeCollider[] = [];
  collidersVersion = 0;
  stats = { chunks: 0, trees: 0, ground: 0, grass: 0, pending: 0 };

  constructor(
    private readonly ecology: Ecology,
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
  }

  treeAsset(species: TreeSpecies, variant: number): TreeAsset {
    return this.treeAssets.get(`${species}:${variant % TREE_VARIANTS}`)!;
  }

  private chunkKey(cx: number, cz: number): string {
    return `${cx}:${cz}`;
  }

  private ensureTrees(cx: number, cz: number): ChunkData {
    const key = this.chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (c) return c;
    const size = this.opts.chunk;
    const scattered = this.ecology.scatterTrees(cx * size, cz * size, size);
    const trees = new Map<string, Packed>();
    const thin = new Map<string, Packed>();
    const thinner = new Map<string, Packed>();
    const treeList: ChunkData['treeList'] = [];
    for (const [species, list] of scattered) {
      const byVariant: Placement[][] = Array.from({ length: TREE_VARIANTS }, () => []);
      for (const p of list) {
        p.variant %= TREE_VARIANTS;
        byVariant[p.variant]!.push(p);
        treeList.push({ species, p });
      }
      byVariant.forEach((l, v) => {
        if (!l.length) return;
        const key = `${species}:${v}`;
        trees.set(key, pack(l, [0.82, 1.12]));
        // Distance thinning: keep a deterministic subset, scaled up to hold canopy cover.
        const t1 = l.filter((p) => p.tint < 0.42).map((p) => ({ ...p, scale: p.scale * 1.25 }));
        const t2 = l.filter((p) => p.tint < 0.26).map((p) => ({ ...p, scale: p.scale * 1.45 }));
        if (t1.length) thin.set(key, pack(t1, [0.82, 1.12]));
        if (t2.length) thinner.set(key, pack(t2, [0.82, 1.12]));
      });
    }
    c = { cx, cz, trees, thin, thinner, treeList };
    this.chunks.set(key, c);
    return c;
  }

  private ensureGround(c: ChunkData): void {
    if (c.ground) return;
    const size = this.opts.chunk;
    const scattered = this.ecology.scatterGround(c.cx * size, c.cz * size, size);
    c.ground = new Map();
    c.groundList = [];
    for (const [layer, list] of scattered) {
      const byVariant: Placement[][] = Array.from({ length: GROUND_VARIANTS }, () => []);
      for (const p of list) {
        p.variant %= GROUND_VARIANTS;
        byVariant[p.variant]!.push(p);
        c.groundList.push({ layer, p });
      }
      byVariant.forEach((l, v) => {
        if (l.length) c.ground!.set(`${layer}:${v}`, pack(l, [0.8, 1.15], layer === 'rock' ? 0.4 : 0));
      });
    }
  }

  private ensureGrass(c: ChunkData): void {
    if (c.grass) return;
    const size = this.opts.chunk;
    const { grass, wheat } = this.ecology.scatterGrass(c.cx * size, c.cz * size, size);
    c.grass = { grass: pack(grass, [0.75, 1.15]), wheat: [0, 1].map((v) => pack(wheat.filter((w) => w.variant === v), [0.85, 1.1])) };
  }

  /** Synchronously compute everything around a point (loading screen). */
  async prepareAsync(cam: THREE.Vector3, onProgress: (done: number, total: number) => void): Promise<void> {
    const list = this.requiredChunks(cam);
    let done = 0;
    let t0 = performance.now();
    for (const r of list) {
      const c = this.ensureTrees(r.cx, r.cz);
      if (r.d < this.opts.groundRadius + this.opts.chunk) this.ensureGround(c);
      if (r.d < this.opts.grassRadius + this.opts.chunk) this.ensureGrass(c);
      done++;
      if (performance.now() - t0 > 30) {
        onProgress(done, list.length);
        await new Promise((res) => setTimeout(res, 0));
        t0 = performance.now();
      }
    }
    onProgress(list.length, list.length);
    this.dirty = true;
    this.lastCell = '';
    this.update(cam, 1000);
  }

  private requiredChunks(cam: THREE.Vector3): { cx: number; cz: number; d: number }[] {
    const size = this.opts.chunk;
    const R = this.opts.treeFar;
    const ccx = Math.floor(cam.x / size);
    const ccz = Math.floor(cam.z / size);
    const rc = Math.ceil(R / size);
    const out: { cx: number; cz: number; d: number }[] = [];
    for (let dx = -rc; dx <= rc; dx++) {
      for (let dz = -rc; dz <= rc; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const d = Math.hypot((cx + 0.5) * size - cam.x, (cz + 0.5) * size - cam.z);
        if (d > R + size) continue;
        out.push({ cx, cz, d });
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  update(cam: THREE.Vector3, budgetMs: number): void {
    const size = this.opts.chunk;
    const cell = `${Math.floor(cam.x / 16)}:${Math.floor(cam.z / 16)}`;
    if (cell !== this.lastCell) {
      this.lastCell = cell;
      this.pending = [];
      for (const r of this.requiredChunks(cam)) {
        const c = this.chunks.get(this.chunkKey(r.cx, r.cz));
        if (!c) this.pending.push({ cx: r.cx, cz: r.cz, need: 'trees' });
        if (r.d < this.opts.groundRadius + size && !c?.ground) this.pending.push({ cx: r.cx, cz: r.cz, need: 'ground' });
        if (r.d < this.opts.grassRadius + size && !c?.grass) this.pending.push({ cx: r.cx, cz: r.cz, need: 'grass' });
      }
      // Nearest work first: grass and ground cover matter most up close.
      this.dirty = true;
    }
    const t0 = performance.now();
    let changed = false;
    while (this.pending.length && performance.now() - t0 < budgetMs) {
      const job = this.pending.shift()!;
      const c = this.ensureTrees(job.cx, job.cz);
      if (job.need === 'ground') this.ensureGround(c);
      if (job.need === 'grass') this.ensureGrass(c);
      changed = true;
    }
    this.stats.pending = this.pending.length;
    if (changed) this.dirty = true;
    if (this.dirty) this.rebuild(cam);
  }

  private rebuild(cam: THREE.Vector3): void {
    this.dirty = false;
    const size = this.opts.chunk;
    const nearLists = new Map<string, Packed[]>();
    const midLists = new Map<string, Packed[]>();
    const farLists = new Map<string, Packed[]>();
    const groundLists = new Map<string, Packed[]>();
    const grass: Packed[] = [];
    const wheat: Packed[][] = [[], []];
    const colliders: TreeCollider[] = [];
    let chunks = 0;
    for (const c of this.chunks.values()) {
      const d = Math.hypot((c.cx + 0.5) * size - cam.x, (c.cz + 0.5) * size - cam.z);
      if (d > this.opts.treeFar + size) continue;
      chunks++;
      const lod = d < this.opts.treeNear ? 0 : d < this.opts.treeMid ? 1 : 2;
      const source = lod < 2 ? c.trees : d < (this.opts.treeMid + this.opts.treeFar) / 2 ? c.thin : c.thinner;
      const target = lod === 0 ? nearLists : lod === 1 ? midLists : farLists;
      for (const [key, p] of source) {
        let l = target.get(key);
        if (!l) target.set(key, (l = []));
        l.push(p);
      }
      if (c.ground && d < this.opts.groundRadius + size * 0.5) {
        for (const [key, p] of c.ground) {
          let l = groundLists.get(key);
          if (!l) groundLists.set(key, (l = []));
          l.push(p);
        }
      }
      if (c.grass && d < this.opts.grassRadius + size * 0.5) {
        grass.push(c.grass.grass);
        wheat[0]!.push(c.grass.wheat[0]!);
        wheat[1]!.push(c.grass.wheat[1]!);
      }
      if (d < this.opts.colliderRadius + size) {
        for (const { species, p } of c.treeList) {
          const a = this.treeAsset(species, p.variant);
          colliders.push({ x: p.x, z: p.z, r: Math.max(0.2, a.trunkRadius * p.scale * 0.95) });
        }
        if (c.groundList) {
          for (const { layer, p } of c.groundList) {
            if (layer === 'boulder') colliders.push({ x: p.x, z: p.z, r: 1.4 * p.scale });
            else if (layer === 'stump') colliders.push({ x: p.x, z: p.z, r: 0.4 * p.scale });
          }
        }
      }
    }
    let trees = 0;
    for (const [key, b] of this.nearBatches) trees += b.set(nearLists.get(key) ?? []);
    for (const [key, b] of this.midBatches) trees += b.set(midLists.get(key) ?? []);
    for (const [key, b] of this.farBatches) trees += b.set(farLists.get(key) ?? []);
    let ground = 0;
    for (const [key, b] of this.groundBatches) ground += b.set(groundLists.get(key) ?? []);
    const g = this.grassBatch.set(grass);
    this.wheatBatches.forEach((b, i) => b.set(wheat[i]!));
    this.colliders = colliders;
    this.collidersVersion++;
    // Bound the cache.
    if (this.chunks.size > 2600) {
      for (const [k, c] of this.chunks) {
        const d = Math.hypot((c.cx + 0.5) * size - cam.x, (c.cz + 0.5) * size - cam.z);
        if (d > this.opts.treeFar * 1.6) this.chunks.delete(k);
      }
    }
    this.stats = { chunks, trees, ground, grass: g, pending: this.pending.length };
  }

  dispose(): void {
    for (const b of [...this.nearBatches.values(), ...this.midBatches.values(), ...this.farBatches.values(), ...this.groundBatches.values(), this.grassBatch, ...this.wheatBatches]) b.dispose();
    this.group.clear();
  }
}
