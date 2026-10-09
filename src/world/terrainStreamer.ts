/**
 * Quadtree terrain LOD with skirts and a time-budgeted build queue.
 *
 * Leaves are square nodes (64 m … 4096 m) sampled on a fixed 32×32 grid from
 * the continuous world height function, so equal-LOD neighbours share exact
 * border vertices; skirts hide T-junction cracks between LOD levels.
 * The displayed set only switches once every node of the new set is ready,
 * so the ground never shows holes while streaming.
 */
import * as THREE from 'three';
import type { Terrain } from './terrain';
import type { TerrainColorizer } from './terrainColor';

export interface TerrainStreamerOptions {
  segments: number;
  minSize: number;
  rootSize: number;
  viewRange: number;
  splitFactor: number;
}

interface NodeKey {
  key: string;
  x0: number;
  z0: number;
  size: number;
}

const DEFAULTS: TerrainStreamerOptions = { segments: 32, minSize: 64, rootSize: 4096, viewRange: 7200, splitFactor: 1.35 };

export function buildTerrainGeometry(terrain: Terrain, colorizer: TerrainColorizer, x0: number, z0: number, size: number, segments: number): THREE.BufferGeometry {
  const n = segments;
  const step = size / n;
  const stride = n + 3; // one-sample border on each side for normals
  const hs = new Float32Array(stride * stride);
  for (let j = 0; j < stride; j++) {
    for (let i = 0; i < stride; i++) {
      hs[j * stride + i] = terrain.height(x0 + (i - 1) * step, z0 + (j - 1) * step);
    }
  }
  const vCount = (n + 1) * (n + 1);
  const skirtCount = 4 * (n + 1);
  const pos = new Float32Array((vCount + skirtCount) * 3);
  const nrm = new Float32Array((vCount + skirtCount) * 3);
  const colr = new Float32Array((vCount + skirtCount) * 3);
  const uv = new Float32Array((vCount + skirtCount) * 2);
  const detailed = size <= 256;
  const c = new THREE.Color();
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const v = j * (n + 1) + i;
      const x = x0 + i * step;
      const z = z0 + j * step;
      const h = hs[(j + 1) * stride + (i + 1)]!;
      const hl = hs[(j + 1) * stride + i]!;
      const hr = hs[(j + 1) * stride + i + 2]!;
      const hd = hs[j * stride + i + 1]!;
      const hu = hs[(j + 2) * stride + i + 1]!;
      let nx = hl - hr;
      let ny = 2 * step;
      let nz = hd - hu;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      pos[v * 3] = x;
      pos[v * 3 + 1] = h;
      pos[v * 3 + 2] = z;
      nrm[v * 3] = nx;
      nrm[v * 3 + 1] = ny;
      nrm[v * 3 + 2] = nz;
      colorizer.color(x, z, h, ny, detailed, c);
      colr[v * 3] = c.r;
      colr[v * 3 + 1] = c.g;
      colr[v * 3 + 2] = c.b;
      uv[v * 2] = x / 4;
      uv[v * 2 + 1] = z / 4;
    }
  }
  // Skirt vertices: copies of the border, dropped down.
  const drop = 1.5 + size * 0.012;
  const border: number[] = [];
  for (let i = 0; i <= n; i++) border.push(i); // z0 edge
  for (let j = 0; j <= n; j++) border.push(j * (n + 1) + n); // x1 edge
  for (let i = n; i >= 0; i--) border.push(n * (n + 1) + i); // z1 edge
  for (let j = n; j >= 0; j--) border.push(j * (n + 1)); // x0 edge
  border.forEach((src, k) => {
    const v = vCount + k;
    pos[v * 3] = pos[src * 3]!;
    pos[v * 3 + 1] = pos[src * 3 + 1]! - drop;
    pos[v * 3 + 2] = pos[src * 3 + 2]!;
    nrm[v * 3] = nrm[src * 3]!;
    nrm[v * 3 + 1] = nrm[src * 3 + 1]!;
    nrm[v * 3 + 2] = nrm[src * 3 + 2]!;
    colr[v * 3] = colr[src * 3]!;
    colr[v * 3 + 1] = colr[src * 3 + 1]!;
    colr[v * 3 + 2] = colr[src * 3 + 2]!;
    uv[v * 2] = uv[src * 2]!;
    uv[v * 2 + 1] = uv[src * 2 + 1]!;
  });
  const idx: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const d = a + (n + 1);
      const e = d + 1;
      // Alternate diagonals for a less regular, more natural mesh.
      if ((i + j) % 2 === 0) idx.push(a, d, b, b, d, e);
      else idx.push(a, d, e, a, e, b);
    }
  }
  // Skirt quads along each edge (double-sided by emitting both windings).
  for (let k = 0; k < border.length - 1; k++) {
    const top0 = border[k]!;
    const top1 = border[k + 1]!;
    const bot0 = vCount + k;
    const bot1 = vCount + k + 1;
    if (top0 === top1) continue;
    idx.push(top0, bot0, top1, top1, bot0, bot1);
    idx.push(top0, top1, bot0, top1, bot1, bot0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export class TerrainStreamer {
  readonly group = new THREE.Group();
  private readonly opts: TerrainStreamerOptions;
  private readonly built = new Map<string, THREE.Mesh>();
  private displayed = new Set<string>();
  private target: NodeKey[] = [];
  private queue: NodeKey[] = [];
  private lastCam = new THREE.Vector3(Infinity, 0, Infinity);
  stats = { nodes: 0, queued: 0, lastBuildMs: 0, maxBuildMs: 0 };

  constructor(
    private readonly terrain: Terrain,
    private readonly colorizer: TerrainColorizer,
    private readonly material: THREE.Material,
    opts: Partial<TerrainStreamerOptions> = {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
    this.group.name = 'terrain';
  }

  private leaves(cam: THREE.Vector3): NodeKey[] {
    const o = this.opts;
    const out: NodeKey[] = [];
    const r0x = Math.floor((cam.x - o.viewRange) / o.rootSize);
    const r1x = Math.floor((cam.x + o.viewRange) / o.rootSize);
    const r0z = Math.floor((cam.z - o.viewRange) / o.rootSize);
    const r1z = Math.floor((cam.z + o.viewRange) / o.rootSize);
    const visit = (x0: number, z0: number, size: number): void => {
      const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + size));
      const dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + size));
      const d = Math.hypot(dx, dz);
      if (d > o.viewRange) return;
      if (size > o.minSize && d < size * o.splitFactor) {
        const h = size / 2;
        visit(x0, z0, h);
        visit(x0 + h, z0, h);
        visit(x0, z0 + h, h);
        visit(x0 + h, z0 + h, h);
        return;
      }
      out.push({ key: `${size}:${x0}:${z0}`, x0, z0, size });
    };
    for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) visit(rx * o.rootSize, rz * o.rootSize, o.rootSize);
    return out;
  }

  private buildNode(n: NodeKey): void {
    const t0 = performance.now();
    const geo = buildTerrainGeometry(this.terrain, this.colorizer, n.x0, n.z0, n.size, this.opts.segments);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.name = `terrain ${n.key}`;
    this.built.set(n.key, mesh);
    const dt = performance.now() - t0;
    this.stats.lastBuildMs = dt;
    this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, dt);
  }

  /** Re-plan the desired leaf set when the camera has moved enough. */
  private replan(cam: THREE.Vector3, force: boolean): void {
    if (!force && Math.hypot(cam.x - this.lastCam.x, cam.z - this.lastCam.z) < 12) return;
    this.lastCam.copy(cam);
    this.target = this.leaves(cam);
    // Priority: nearest first, then those in front of the camera.
    this.queue = this.target
      .filter((n) => !this.built.has(n.key))
      .sort((a, b) => a.size - b.size || dist(cam, a) - dist(cam, b));
  }

  /** Build everything required right now (loading screen). */
  buildAll(cam: THREE.Vector3, onProgress?: (done: number, total: number) => void): void {
    this.replan(cam, true);
    const total = this.queue.length;
    let done = 0;
    for (const n of this.queue) {
      this.buildNode(n);
      onProgress?.(++done, total);
    }
    this.queue = [];
    this.swap();
  }

  /** Incremental async build used by the loading screen without freezing. */
  async buildAllAsync(cam: THREE.Vector3, onProgress: (done: number, total: number) => void): Promise<void> {
    this.replan(cam, true);
    const total = this.queue.length;
    let done = 0;
    let t0 = performance.now();
    for (const n of this.queue) {
      this.buildNode(n);
      done++;
      if (performance.now() - t0 > 30) {
        onProgress(done, total);
        await new Promise((r) => setTimeout(r, 0));
        t0 = performance.now();
      }
    }
    onProgress(total, total);
    this.queue = [];
    this.swap();
  }

  update(cam: THREE.Vector3, budgetMs: number): void {
    this.replan(cam, false);
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const n = this.queue.shift()!;
      if (!this.built.has(n.key)) this.buildNode(n);
    }
    if (this.queue.length === 0) this.swap();
    this.stats.queued = this.queue.length;
  }

  private swap(): void {
    const next = new Set(this.target.map((n) => n.key));
    if (setsEqual(next, this.displayed)) return;
    for (const key of this.displayed) {
      if (next.has(key)) continue;
      const m = this.built.get(key);
      if (m) this.group.remove(m);
    }
    for (const key of next) {
      if (this.displayed.has(key)) continue;
      const m = this.built.get(key);
      if (m) {
        m.updateMatrix();
        this.group.add(m);
      }
    }
    this.displayed = next;
    // Evict cached nodes that are far from use to bound memory.
    if (this.built.size > next.size * 2 + 64) {
      for (const [key, m] of this.built) {
        if (next.has(key)) continue;
        m.geometry.dispose();
        this.built.delete(key);
      }
    }
    this.stats.nodes = this.displayed.size;
  }

  dispose(): void {
    for (const m of this.built.values()) m.geometry.dispose();
    this.built.clear();
    this.group.clear();
  }
}

function dist(cam: THREE.Vector3, n: NodeKey): number {
  return Math.hypot(n.x0 + n.size / 2 - cam.x, n.z0 + n.size / 2 - cam.z);
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}
