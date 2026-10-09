/**
 * Ground-cover kit: grass tufts, crops, bushes, ferns, flowers, rocks,
 * boulders, fallen logs, mushrooms and stumps — each with several variants
 * whose shapes differ (not just scale).
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { Noise2D } from '../core/noise';
import { MeshBuilder, col, trs } from './geo';
import type { GroundLayer } from '../world/ecology';
import type { MaterialName } from '../rendering/materials';

export type Asset = Map<MaterialName, THREE.BufferGeometry>;
const UP = new THREE.Vector3(0, 1, 0);
const noise = new Noise2D(0xbeef);

function blade(b: MeshBuilder, key: MaterialName, base: THREE.Vector3, dir: THREE.Vector3, h: number, w: number, bend: number, c0: THREE.Color, c1: THREE.Color): void {
  const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(w / 2);
  const mid = base.clone().addScaledVector(UP, h * 0.55).addScaledVector(dir, bend * 0.35);
  const tip = base.clone().addScaledVector(UP, h).addScaledVector(dir, bend);
  const cm = c0.clone().lerp(c1, 0.5);
  const n = UP.clone().addScaledVector(dir, -0.3).normalize();
  b.smoothTri(key, [base.clone().sub(side), base.clone().add(side), mid.clone().add(side.clone().multiplyScalar(0.6))], [n, n, n], [[0, 0], [1, 0], [1, 0.5]], [c0, c0, cm]);
  b.smoothTri(key, [base.clone().sub(side), mid.clone().add(side.clone().multiplyScalar(0.6)), mid.clone().sub(side.clone().multiplyScalar(0.6))], [n, n, n], [[0, 0], [1, 0.5], [0, 0.5]], [c0, cm, cm]);
  b.smoothTri(key, [mid.clone().sub(side.clone().multiplyScalar(0.6)), mid.clone().add(side.clone().multiplyScalar(0.6)), tip], [n, n, n], [[0, 0.5], [1, 0.5], [0.5, 1]], [cm, cm, c1]);
}

export function grassTuft(variant: number): Asset {
  const rng = new Rng(0x6a55 + variant);
  const b = new MeshBuilder();
  const blades = rng.int(6, 9);
  // Base matches the meadow colour so tufts read as texture, not dark specks.
  const dark = col(variant % 2 ? '#557f2e' : '#5e8a32');
  const light = col(variant % 2 ? '#a9c65a' : '#b9cc62');
  for (let i = 0; i < blades; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.22);
    const base = new THREE.Vector3(Math.cos(a) * r, -0.05, Math.sin(a) * r);
    const dir = new THREE.Vector3(Math.cos(a + rng.range(-0.6, 0.6)), 0, Math.sin(a + rng.range(-0.6, 0.6)));
    blade(b, 'grass', base, dir, rng.range(0.35, 0.7), rng.range(0.07, 0.12), rng.range(0.08, 0.25), dark, light.clone().lerp(dark, rng.range(0, 0.3)));
  }
  return b.build() as Asset;
}

export function cropTuft(variant: number): Asset {
  const rng = new Rng(0xc409 + variant);
  const b = new MeshBuilder();
  const stem = col(variant === 0 ? '#9a8a3c' : '#8a9440');
  const head = col(variant === 0 ? '#e6c46a' : '#d2c87a');
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.25);
    const base = new THREE.Vector3(Math.cos(a) * r, -0.05, Math.sin(a) * r);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const h = rng.range(0.75, 1.0);
    blade(b, 'grass', base, dir, h, 0.06, 0.08, stem, head);
    // Ear of grain.
    const tip = base.clone().addScaledVector(UP, h).addScaledVector(dir, 0.08);
    b.box('grass', trs(tip.x, tip.y, tip.z, a, 1, 1, 1, 0.25), 0, 0.06, 0, 0.07, 0.18, 0.07, { color: head });
  }
  return b.build() as Asset;
}

function lumpy(b: MeshBuilder, key: MaterialName, center: THREE.Vector3, radius: number, squash: THREE.Vector3, detail: number, colorFn: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color, seed: number, rough = 0.25, flatBottom = false): void {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const n = noise.sample(v.x * 1.9 + seed, v.z * 1.9 + v.y * 1.4 - seed) * 0.7 + noise.sample(v.x * 4.1 - seed, v.y * 4.1 + seed) * 0.3;
    const r = radius * (1 + rough * n);
    let y = v.y * r * squash.y;
    if (flatBottom && y < -radius * 0.15) y = -radius * 0.15 + (y + radius * 0.15) * 0.2;
    pos.setXYZ(i, v.x * r * squash.x + center.x, y + center.y, v.z * r * squash.z + center.z);
  }
  geo.computeVertexNormals();
  b.geometry(key, geo, new THREE.Matrix4(), colorFn);
  geo.dispose();
}

export function bush(variant: number): Asset {
  const rng = new Rng(0xb05 + variant);
  const b = new MeshBuilder();
  const pal = [col('#22401c'), col('#4a7428'), col('#93b04a')];
  const n = rng.int(2, 4);
  const H = rng.range(0.9, 1.6);
  const center = new THREE.Vector3(0, H * 0.45, 0);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const c = new THREE.Vector3(Math.cos(a) * rng.range(0, 0.6), H * rng.range(0.35, 0.6), Math.sin(a) * rng.range(0, 0.6));
    lumpy(b, 'leaves', c, rng.range(0.55, 0.85) * H, new THREE.Vector3(1, 0.75, 1), 1, (p) => {
      const k = THREE.MathUtils.clamp((p.y - center.y) / H + 0.55, 0, 1);
      return k < 0.5 ? pal[0]!.clone().lerp(pal[1]!, k * 2) : pal[1]!.clone().lerp(pal[2]!, (k - 0.5) * 2);
    }, rng.range(0, 50), 0.3);
  }
  // Optional berries / blossoms for variety.
  if (variant % 2 === 1) {
    const bloom = col(variant === 1 ? '#f2eee2' : '#d65c6a');
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.5, 0.9) * H;
      b.box('plain', trs(Math.cos(a) * r * 0.9, H * rng.range(0.5, 0.95), Math.sin(a) * r * 0.9, a), 0, 0, 0, 0.12, 0.1, 0.12, { color: bloom });
    }
  }
  return b.build() as Asset;
}

export function fern(variant: number): Asset {
  const rng = new Rng(0xfe2 + variant);
  const b = new MeshBuilder();
  const fronds = rng.int(6, 9);
  const dark = col('#1f3d1c');
  const light = col(variant % 2 ? '#6f9a38' : '#5d8a30');
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const len = rng.range(0.6, 1.0);
    const segs = 4;
    let prev = new THREE.Vector3(0, 0.05, 0);
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const p = dir.clone().multiplyScalar(len * t).add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.8) * 0.45 * len, 0));
      const w0 = 0.16 * (1 - (t - 1 / segs) * 0.8);
      const w1 = 0.16 * (1 - t * 0.85);
      const n = new THREE.Vector3(0, 1, 0);
      const c0 = dark.clone().lerp(light, t - 0.25);
      const c1 = dark.clone().lerp(light, t);
      b.smoothTri('foliagePlain', [prev.clone().addScaledVector(side, -w0), prev.clone().addScaledVector(side, w0), p.clone().addScaledVector(side, w1)], [n, n, n], [[0, 0], [1, 0], [1, 1]], [c0, c0, c1]);
      b.smoothTri('foliagePlain', [prev.clone().addScaledVector(side, -w0), p.clone().addScaledVector(side, w1), p.clone().addScaledVector(side, -w1)], [n, n, n], [[0, 0], [1, 1], [0, 1]], [c0, c1, c1]);
      // Underside so fronds read from below the arch too.
      b.smoothTri('foliagePlain', [prev.clone().addScaledVector(side, w0), prev.clone().addScaledVector(side, -w0), p.clone().addScaledVector(side, w1)], [n, n, n], [[0, 0], [1, 0], [1, 1]], [dark, dark, c0]);
      prev = p;
    }
  }
  return b.build() as Asset;
}

const FLOWER_COLORS = ['#f4efe0', '#f2cf4a', '#a77ad4', '#d8434a', '#7aa0e6'];

export function flowers(variant: number): Asset {
  const rng = new Rng(0xf10 + variant);
  const b = new MeshBuilder();
  const petal = col(FLOWER_COLORS[variant % FLOWER_COLORS.length]!);
  const stem = col('#4a7a2c');
  const n = rng.int(5, 9);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.35);
    const h = rng.range(0.25, 0.5);
    const base = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    blade(b, 'grass', base, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), h, 0.04, 0.05, stem, stem);
    const top = base.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, h, Math.sin(a) * 0.05));
    b.box('grass', trs(top.x, top.y, top.z, a), 0, 0, 0, 0.13, 0.07, 0.13, { color: petal });
    b.box('grass', trs(top.x, top.y + 0.04, top.z, a + 0.7), 0, 0, 0, 0.05, 0.04, 0.05, { color: col('#f6d24a') });
  }
  // A few leaves at the base.
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    blade(b, 'grass', new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 0.2, 0.12, 0.2, col('#3a6a24'), col('#7aa040'));
  }
  return b.build() as Asset;
}

function rockColor(moss: number) {
  const top = col('#6f8a3c');
  const base = col('#a8a294');
  const dark = col('#6e6a62');
  return (p: THREE.Vector3, n: THREE.Vector3): THREE.Color => {
    const c = dark.clone().lerp(base, THREE.MathUtils.clamp(p.y * 0.8 + 0.5, 0, 1));
    if (n.y > 0.55) c.lerp(top, moss * (n.y - 0.55) * 2.2);
    return c;
  };
}

export function rock(variant: number): Asset {
  const rng = new Rng(0x40c + variant);
  const b = new MeshBuilder();
  lumpy(b, 'rock', new THREE.Vector3(0, 0.12, 0), rng.range(0.35, 0.6), new THREE.Vector3(rng.range(1, 1.5), rng.range(0.5, 0.8), 1), 1, rockColor(0.6), rng.range(0, 99), 0.35, true);
  return b.build() as Asset;
}

export function boulder(variant: number): Asset {
  const rng = new Rng(0xb01d + variant);
  const b = new MeshBuilder();
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const r = rng.range(1.1, 2.0) * (i === 0 ? 1 : 0.6);
    lumpy(b, 'rock', new THREE.Vector3(i * rng.range(0.8, 1.6), r * 0.25, i * rng.range(-0.8, 0.8)), r, new THREE.Vector3(rng.range(1, 1.4), rng.range(0.6, 0.85), 1), 1, rockColor(0.9), rng.range(0, 99), 0.32, true);
  }
  return b.build() as Asset;
}

export function log(variant: number): Asset {
  const rng = new Rng(0x109 + variant);
  const b = new MeshBuilder();
  const len = rng.range(3, 5.5);
  const r = rng.range(0.22, 0.35);
  const m = trs(0, r * 0.8, 0, rng.range(0, 3), 1, 1, 1, 0, Math.PI / 2);
  b.cylinder('bark', m, 0, -len / 2, 0, r, r * 0.85, len, 7, { color: col('#a89a84') }, { capTop: true, capBottom: true });
  // Moss patches and a broken stub.
  b.box('foliagePlain', m, r * 0.5, -len * 0.1, 0, r * 0.7, len * 0.45, r * 0.9, { color: col('#5a7a30') });
  b.cylinder('bark', trs(0, r * 0.8, 0, 0, 1, 1, 1, 0.5, 0), 0, 0, 0, 0.08, 0.03, 0.7, 4, { color: col('#a89a84') });
  return b.build() as Asset;
}

export function mushrooms(variant: number): Asset {
  const rng = new Rng(0x3005 + variant);
  const b = new MeshBuilder();
  const cap = col(variant % 2 ? '#b8442e' : '#9a6a42');
  const stem = col('#e8dcc4');
  const n = rng.int(2, 5);
  for (let i = 0; i < n; i++) {
    const x = rng.range(-0.25, 0.25);
    const z = rng.range(-0.25, 0.25);
    const h = rng.range(0.08, 0.22);
    b.cylinder('plain', trs(x, 0, z), 0, 0, 0, 0.025, 0.02, h, 5, { color: stem });
    b.cylinder('plain', trs(x, h, z), 0, 0, 0, h * 0.55, 0.01, h * 0.45, 6, { color: cap }, { capBottom: true });
  }
  return b.build() as Asset;
}

export function stump(variant: number): Asset {
  const rng = new Rng(0x57 + variant);
  const b = new MeshBuilder();
  const r = rng.range(0.3, 0.5);
  b.cylinder('bark', trs(0, -0.2, 0), 0, 0, 0, r * 1.25, r, rng.range(0.5, 0.9), 7, { color: col('#a89a84'), aoBottom: 0.3 }, { capTop: true });
  return b.build() as Asset;
}

export function groundAsset(layer: GroundLayer, variant: number): Asset {
  switch (layer) {
    case 'bush':
      return bush(variant);
    case 'fern':
      return fern(variant);
    case 'flower':
      return flowers(variant);
    case 'rock':
      return rock(variant);
    case 'boulder':
      return boulder(variant);
    case 'log':
      return log(variant);
    case 'mushroom':
      return mushrooms(variant);
    case 'stump':
      return stump(variant);
    case 'grass':
      return grassTuft(variant);
    case 'wheat':
      return cropTuft(variant);
  }
}
