/**
 * Packing of scattered placements into instance matrices/colours, and the
 * per-chunk vegetation jobs. Pure functions over typed arrays, so they run
 * identically on the main thread or inside a generation worker.
 */
import * as THREE from 'three';
import type { Ecology, GroundLayer, Placement, TreeSpecies } from './ecology';
import { TREE_SPECIES } from './ecology';

export const TREE_VARIANTS = 3;
export const GROUND_VARIANTS = 3;
export const GROUND_LAYERS: GroundLayer[] = ['bush', 'fern', 'flower', 'rock', 'boulder', 'log', 'mushroom', 'stump'];

export interface Packed {
  matrices: Float32Array;
  colors: Float32Array;
  count: number;
}

export interface TreeChunkData {
  /** key `${species}:${variant}` → instances at full, thinned and thinner density. */
  trees: [string, Packed][];
  thin: [string, Packed][];
  thinner: [string, Packed][];
  /** Collider seeds: [speciesIndex, variant, x, z, scale] per tree. */
  list: Float32Array;
}

export interface GroundChunkData {
  ground: [string, Packed][];
  /** [layerIndex, x, z, scale] per placement that needs a collider. */
  solids: Float32Array;
}

export interface GrassChunkData {
  grass: Packed;
  wheat: Packed[];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function pack(list: Placement[], tintRange: [number, number], tilt = 0): Packed {
  const matrices = new Float32Array(list.length * 16);
  const colors = new Float32Array(list.length * 3);
  list.forEach((pl, i) => {
    _q.setFromAxisAngle(_up, pl.yaw);
    if (tilt) _q.multiply(_q2.setFromEuler(_e.set((pl.tint - 0.5) * tilt, 0, (pl.variant / 3 - 0.5) * tilt)));
    _m.compose(_p.set(pl.x, pl.y, pl.z), _q, _s.setScalar(pl.scale));
    _m.toArray(matrices, i * 16);
    const k = tintRange[0] + (tintRange[1] - tintRange[0]) * pl.tint;
    colors[i * 3] = k * (0.97 + pl.tint * 0.06);
    colors[i * 3 + 1] = k;
    colors[i * 3 + 2] = k * (1.02 - pl.tint * 0.06);
  });
  return { matrices, colors, count: list.length };
}

export function treeChunk(eco: Ecology, cx: number, cz: number, size: number): TreeChunkData {
  const scattered = eco.scatterTrees(cx * size, cz * size, size);
  const trees: [string, Packed][] = [];
  const thin: [string, Packed][] = [];
  const thinner: [string, Packed][] = [];
  const list: number[] = [];
  for (const [species, items] of scattered) {
    const byVariant: Placement[][] = Array.from({ length: TREE_VARIANTS }, () => []);
    for (const p of items) {
      p.variant %= TREE_VARIANTS;
      byVariant[p.variant]!.push(p);
      list.push(TREE_SPECIES.indexOf(species as TreeSpecies), p.variant, p.x, p.z, p.scale);
    }
    byVariant.forEach((l, v) => {
      if (!l.length) return;
      const key = `${species}:${v}`;
      trees.push([key, pack(l, [0.82, 1.12])]);
      // Distance thinning keeps a deterministic subset, scaled up to hold canopy cover.
      const t1 = l.filter((p) => p.tint < 0.42).map((p) => ({ ...p, scale: p.scale * 1.25 }));
      const t2 = l.filter((p) => p.tint < 0.26).map((p) => ({ ...p, scale: p.scale * 1.45 }));
      if (t1.length) thin.push([key, pack(t1, [0.82, 1.12])]);
      if (t2.length) thinner.push([key, pack(t2, [0.82, 1.12])]);
    });
  }
  return { trees, thin, thinner, list: new Float32Array(list) };
}

export function groundChunk(eco: Ecology, cx: number, cz: number, size: number): GroundChunkData {
  const scattered = eco.scatterGround(cx * size, cz * size, size);
  const ground: [string, Packed][] = [];
  const solids: number[] = [];
  for (const [layer, items] of scattered) {
    const byVariant: Placement[][] = Array.from({ length: GROUND_VARIANTS }, () => []);
    for (const p of items) {
      p.variant %= GROUND_VARIANTS;
      byVariant[p.variant]!.push(p);
      if (layer === 'boulder' || layer === 'stump') solids.push(GROUND_LAYERS.indexOf(layer), p.x, p.z, p.scale);
    }
    byVariant.forEach((l, v) => {
      if (l.length) ground.push([`${layer}:${v}`, pack(l, [0.8, 1.15], layer === 'rock' ? 0.4 : 0)]);
    });
  }
  return { ground, solids: new Float32Array(solids) };
}

export function grassChunk(eco: Ecology, cx: number, cz: number, size: number): GrassChunkData {
  const { grass, wheat } = eco.scatterGrass(cx * size, cz * size, size);
  return { grass: pack(grass, [0.75, 1.15]), wheat: [0, 1].map((v) => pack(wheat.filter((w) => w.variant === v), [0.85, 1.1])) };
}

/** Collect transferable buffers from any job result. */
export function transferables(data: unknown): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (ArrayBuffer.isView(v)) {
      const b = v.buffer as ArrayBuffer;
      if (!seen.has(b)) {
        seen.add(b);
        out.push(b);
      }
      return;
    }
    if (Array.isArray(v)) v.forEach(walk);
    else Object.values(v).forEach(walk);
  };
  walk(data);
  return out;
}
