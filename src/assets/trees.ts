/**
 * Procedural tree kit. Each species has its own growth grammar so silhouettes
 * genuinely differ (spreading oak, domed beech, slender birch, tiered pine,
 * columnar poplar, weeping willow, bare dead tree, colossal ancient oak).
 * Leaf clumps use "crown normals" (blended towards the crown centre) so the
 * canopy shades as soft painted masses rather than faceted balls.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { Noise2D } from '../core/noise';
import { MeshBuilder, col } from './geo';
import type { TreeSpecies } from '../world/ecology';
import type { MaterialName } from '../rendering/materials';

export interface TreeAsset {
  species: TreeSpecies | 'ancient';
  /** Near-detail geometry per material. */
  near: Map<MaterialName, THREE.BufferGeometry>;
  /** Low-detail geometry per material for mid distance (≈50 triangles). */
  mid: Map<MaterialName, THREE.BufferGeometry>;
  /** Silhouette geometry for far distance (≈25 triangles). */
  far: Map<MaterialName, THREE.BufferGeometry>;
  height: number;
  trunkRadius: number;
}

interface SpeciesStyle {
  bark: MaterialName;
  barkColor: string;
  leaf: MaterialName;
  leafColors: [string, string, string]; // shadow, mid, light
}

const STYLES: Record<TreeSpecies | 'ancient', SpeciesStyle> = {
  oak: { bark: 'bark', barkColor: '#d8c8b8', leaf: 'leaves', leafColors: ['#24461f', '#4f7a2c', '#9cbc4e'] },
  beech: { bark: 'bark', barkColor: '#c8c4c0', leaf: 'leaves', leafColors: ['#2a4a22', '#5c8432', '#a8c45a'] },
  birch: { bark: 'birchBark', barkColor: '#ffffff', leaf: 'leaves', leafColors: ['#3f5f24', '#7fa23c', '#c6d66a'] },
  pine: { bark: 'bark', barkColor: '#b89a88', leaf: 'needles', leafColors: ['#14301f', '#2c5034', '#5f8650'] },
  poplar: { bark: 'bark', barkColor: '#c0b8a8', leaf: 'leaves', leafColors: ['#2c4a1f', '#5a8630', '#a6c454'] },
  willow: { bark: 'bark', barkColor: '#b8a890', leaf: 'leaves', leafColors: ['#3c5a22', '#7a9a3c', '#c4d070'] },
  dead: { bark: 'bark', barkColor: '#a8a098', leaf: 'leaves', leafColors: ['#000000', '#000000', '#000000'] },
  ancient: { bark: 'bark', barkColor: '#cbb9a8', leaf: 'leaves', leafColors: ['#1e3d1d', '#4a752a', '#a2c050'] },
};

const UP = new THREE.Vector3(0, 1, 0);

/** Tapered tube along a polyline of points with radii. */
function tube(b: MeshBuilder, key: MaterialName, pts: THREE.Vector3[], radii: number[], sides: number, color: THREE.Color, rootDark = 0): void {
  const rings: THREE.Vector3[][] = [];
  const normals: THREE.Vector3[][] = [];
  let prevSide = new THREE.Vector3(1, 0, 0);
  let vAcc = 0;
  const vs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const dir = new THREE.Vector3().subVectors(pts[Math.min(i + 1, pts.length - 1)]!, pts[Math.max(i - 1, 0)]!).normalize();
    // Parallel-transport-ish frame to avoid twisting.
    let side = new THREE.Vector3().crossVectors(dir, prevSide).cross(dir).normalize();
    if (side.lengthSq() < 0.5) side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    if (side.lengthSq() < 0.5) side.set(1, 0, 0);
    prevSide = side.clone();
    const fwd = new THREE.Vector3().crossVectors(dir, side).normalize();
    const ring: THREE.Vector3[] = [];
    const nr: THREE.Vector3[] = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const n = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(fwd, Math.sin(a));
      ring.push(p.clone().addScaledVector(n, radii[i]!));
      nr.push(n);
    }
    rings.push(ring);
    normals.push(nr);
    if (i > 0) vAcc += pts[i]!.distanceTo(pts[i - 1]!);
    vs.push(vAcc);
  }
  const circ = Math.PI * 2 * radii[0]!;
  for (let i = 0; i < rings.length - 1; i++) {
    const c0 = rootDark > 0 && i === 0 ? color.clone().multiplyScalar(1 - rootDark) : color;
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      const u0 = (s / sides) * circ;
      const u1 = ((s + 1) / sides) * circ;
      const a = rings[i]![s]!;
      const bb = rings[i]![s1]!;
      const c = rings[i + 1]![s1]!;
      const d = rings[i + 1]![s]!;
      b.smoothTri(key, [a, bb, c], [normals[i]![s]!, normals[i]![s1]!, normals[i + 1]![s1]!], [[u0, vs[i]!], [u1, vs[i]!], [u1, vs[i + 1]!]], [c0, c0, color]);
      b.smoothTri(key, [a, c, d], [normals[i]![s]!, normals[i + 1]![s1]!, normals[i + 1]![s]!], [[u0, vs[i]!], [u1, vs[i + 1]!], [u0, vs[i + 1]!]], [c0, color, color]);
    }
  }
}

/** Grow a branch path from a start point along a direction with gentle bending. */
function branchPath(rng: Rng, start: THREE.Vector3, dir: THREE.Vector3, length: number, segs: number, bend: number, gravity = 0): THREE.Vector3[] {
  const pts = [start.clone()];
  const d = dir.clone().normalize();
  const step = length / segs;
  for (let i = 0; i < segs; i++) {
    d.x += rng.range(-bend, bend);
    d.z += rng.range(-bend, bend);
    d.y += rng.range(-bend, bend) * 0.5 - gravity;
    d.normalize();
    pts.push(pts[pts.length - 1]!.clone().addScaledVector(d, step));
  }
  return pts;
}

const _clumpNoise = new Noise2D(0x51ab);

/**
 * A leaf clump: displaced icosphere whose normals blend towards the crown
 * centre. Colours run dark underneath to light on top.
 */
function clump(
  b: MeshBuilder,
  key: MaterialName,
  center: THREE.Vector3,
  radius: number,
  squash: number,
  crownCenter: THREE.Vector3,
  crownRadius: number,
  palette: [THREE.Color, THREE.Color, THREE.Color],
  rng: Rng,
  detail = 1,
): void {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const seed = rng.range(0, 100);
  const jitter = rng.range(-0.08, 0.08);
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const n = _clumpNoise.sample(v.x * 1.7 + seed, v.z * 1.7 + v.y * 1.3 - seed) * 0.75 + _clumpNoise.sample(v.x * 4.3 - seed, v.y * 4.3 + v.z * 2.1) * 0.25;
    const r = radius * (1 + 0.34 * n);
    verts.push(new THREE.Vector3(v.x * r, v.y * r * squash, v.z * r).add(center));
  }
  // PolyhedronGeometry is non-indexed: consecutive triples are triangles.
  const idx = geo.index;
  const triCount = idx ? idx.count : pos.count;
  const at = (k: number): number => (idx ? idx.getX(k) : k);
  for (let t = 0; t < triCount; t += 3) {
    const ps = [verts[at(t)]!, verts[at(t + 1)]!, verts[at(t + 2)]!];
    const ns: THREE.Vector3[] = [];
    const cs: THREE.Color[] = [];
    for (const p of ps) {
      const local = new THREE.Vector3().subVectors(p, center).normalize();
      const crownN = new THREE.Vector3().subVectors(p, crownCenter).normalize();
      // Blend towards the crown normal, with a little noise so light breaks into dabs.
      const jn = _clumpNoise.sample(p.x * 0.9 + p.y * 0.4, p.z * 0.9 - p.y * 0.3);
      ns.push(local.multiplyScalar(0.45).addScaledVector(crownN, 0.55).add(new THREE.Vector3(jn * 0.25, jn * 0.15, -jn * 0.2)).normalize());
      // Height through the crown → colour ramp; underside & interior darker.
      const h = THREE.MathUtils.clamp((p.y - crownCenter.y) / (crownRadius * 1.2) * 0.5 + 0.5, 0, 1);
      const out = THREE.MathUtils.clamp(p.distanceTo(crownCenter) / (crownRadius + 0.01), 0, 1.2);
      const vj = _clumpNoise.sample(p.x * 1.3 + 50, p.z * 1.3 + p.y) * 0.16;
      const k = THREE.MathUtils.clamp(h * 0.75 + out * 0.35 - 0.15 + jitter + vj, 0, 1);
      const c = k < 0.5 ? palette[0].clone().lerp(palette[1], k * 2) : palette[1].clone().lerp(palette[2], (k - 0.5) * 2);
      cs.push(c);
    }
    // Planar UVs from world position (leaf texture dabs).
    const uv = ps.map((p): [number, number] => [p.x + p.z * 0.5, p.y + p.z * 0.3]);
    b.smoothTri(key, ps, ns, uv, cs);
  }
  geo.dispose();
}

function palette(style: SpeciesStyle, rng: Rng): [THREE.Color, THREE.Color, THREE.Color] {
  const hueShift = rng.range(-0.02, 0.02);
  const f = (h: string): THREE.Color => {
    const c = col(h);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    return c.setHSL(hsl.h + hueShift, hsl.s, hsl.l);
  };
  return [f(style.leafColors[0]), f(style.leafColors[1]), f(style.leafColors[2])];
}

function deciduous(rng: Rng, species: 'oak' | 'beech' | 'ancient', near: MeshBuilder, far: MeshBuilder, style: SpeciesStyle): { height: number; trunk: number } {
  const giant = species === 'ancient';
  const H = giant ? rng.range(24, 27) : species === 'oak' ? rng.range(9, 13) : rng.range(12, 16);
  const trunkH = H * (giant ? 0.32 : species === 'oak' ? rng.range(0.3, 0.4) : rng.range(0.4, 0.5));
  const r0 = giant ? 1.9 : species === 'oak' ? rng.range(0.32, 0.45) : rng.range(0.25, 0.34);
  const crownR = giant ? 14 : species === 'oak' ? H * rng.range(0.45, 0.55) : H * rng.range(0.32, 0.4);
  const crownC = new THREE.Vector3(rng.range(-0.4, 0.4), trunkH + crownR * (species === 'oak' || giant ? 0.55 : 0.75), rng.range(-0.4, 0.4));
  const barkCol = col(style.barkColor);
  const pal = palette(style, rng);

  const trunkPts = branchPath(rng, new THREE.Vector3(0, -0.4, 0), UP, trunkH + 0.4, giant ? 6 : 4, 0.08);
  const trunkR = trunkPts.map((_, i) => r0 * (1 - (i / trunkPts.length) * 0.35) * (i === 0 ? 1.35 : 1));
  tube(near, style.bark, trunkPts, trunkR, giant ? 12 : 7, barkCol, 0.35);
  tube(far, style.bark, [trunkPts[0]!, trunkPts[trunkPts.length - 1]!], [trunkR[0]!, trunkR[trunkR.length - 1]!], 4, barkCol);

  if (giant) {
    // Buttress roots flaring into the ground.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const d = new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a));
      const pts = branchPath(rng, new THREE.Vector3(Math.cos(a) * r0 * 0.6, 1.6, Math.sin(a) * r0 * 0.6), d, rng.range(4, 7), 4, 0.15, 0.06);
      tube(near, style.bark, pts, pts.map((_, k) => 0.75 * (1 - k / pts.length) + 0.1), 6, barkCol, 0.3);
    }
  }

  // Limbs from the trunk top into the crown; clumps at limb ends.
  const top = trunkPts[trunkPts.length - 1]!;
  const limbs = giant ? 9 : species === 'oak' ? rng.int(4, 6) : rng.int(3, 5);
  const clumpCenters: { c: THREE.Vector3; r: number }[] = [];
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const spread = species === 'oak' || giant ? rng.range(0.55, 0.95) : rng.range(0.3, 0.55);
    const dir = new THREE.Vector3(Math.cos(a) * spread, 1 - spread * 0.4, Math.sin(a) * spread);
    const len = crownR * rng.range(0.65, 0.95);
    const start = top.clone().add(new THREE.Vector3(0, rng.range(-trunkH * 0.15, 0), 0));
    const pts = branchPath(rng, start, dir, len, 3, 0.12);
    const lr = r0 * rng.range(0.38, 0.55);
    tube(near, style.bark, pts, pts.map((_, k) => lr * (1 - (k / pts.length) * 0.7)), 5, barkCol);
    const end = pts[pts.length - 1]!;
    clumpCenters.push({ c: end, r: crownR * rng.range(0.42, 0.58) });
    // Secondary twig clump partway along each limb.
    const mid = pts[2]!.clone().add(new THREE.Vector3(rng.range(-1, 1), rng.range(0.3, 1.2), rng.range(-1, 1)).multiplyScalar(crownR * 0.25));
    clumpCenters.push({ c: mid, r: crownR * rng.range(0.32, 0.45) });
  }
  // A cap clump to round the silhouette.
  clumpCenters.push({ c: crownC.clone().add(new THREE.Vector3(0, crownR * 0.45, 0)), r: crownR * 0.55 });
  for (const { c, r } of clumpCenters) {
    clump(near, style.leaf, c, r, species === 'beech' ? 0.85 : 0.72, crownC, crownR, pal, rng, giant ? 2 : 1);
  }
  // Far LOD: three merged masses.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const c = crownC.clone().add(new THREE.Vector3(Math.cos(a) * crownR * 0.35, i === 0 ? crownR * 0.25 : 0, Math.sin(a) * crownR * 0.35));
    clump(far, 'foliagePlain', c, crownR * 0.68, 0.75, crownC, crownR, pal, rng, 0);
  }
  return { height: H, trunk: r0 };
}

function birch(rng: Rng, near: MeshBuilder, far: MeshBuilder, style: SpeciesStyle): { height: number; trunk: number } {
  const H = rng.range(11, 16);
  const r0 = rng.range(0.14, 0.2);
  const lean = new THREE.Vector3(rng.range(-0.08, 0.08), 1, rng.range(-0.08, 0.08));
  const pts = branchPath(rng, new THREE.Vector3(0, -0.3, 0), lean, H * 0.92, 6, 0.05);
  tube(near, style.bark, pts, pts.map((_, i) => r0 * (1 - (i / pts.length) * 0.75)), 6, col(style.barkColor), 0.25);
  tube(far, style.bark, [pts[0]!, pts[pts.length - 1]!], [r0, r0 * 0.3], 4, col(style.barkColor));
  const pal = palette(style, rng);
  const crownC = pts[4]!.clone();
  const crownR = H * 0.22;
  // Small airy clumps climbing the upper trunk.
  for (let i = 2; i < pts.length; i++) {
    const n = i === pts.length - 1 ? 1 : rng.int(1, 2);
    for (let k = 0; k < n; k++) {
      const a = rng.range(0, Math.PI * 2);
      const off = new THREE.Vector3(Math.cos(a), rng.range(-0.2, 0.4), Math.sin(a)).multiplyScalar(crownR * rng.range(0.3, 0.8));
      clump(near, style.leaf, pts[i]!.clone().add(off), crownR * rng.range(0.45, 0.65), 0.95, crownC, crownR * 1.5, pal, rng);
    }
  }
  clump(far, 'foliagePlain', crownC.clone().add(new THREE.Vector3(0, crownR * 0.3, 0)), crownR * 1.05, 1.4, crownC, crownR, pal, rng, 0);
  return { height: H, trunk: r0 };
}

function poplar(rng: Rng, near: MeshBuilder, far: MeshBuilder, style: SpeciesStyle): { height: number; trunk: number } {
  const H = rng.range(14, 19);
  const r0 = rng.range(0.22, 0.3);
  const pts = branchPath(rng, new THREE.Vector3(0, -0.3, 0), UP, H * 0.85, 5, 0.03);
  tube(near, style.bark, pts, pts.map((_, i) => r0 * (1 - (i / pts.length) * 0.7)), 6, col(style.barkColor), 0.3);
  tube(far, style.bark, [pts[0]!, pts[pts.length - 1]!], [r0, r0 * 0.3], 4, col(style.barkColor));
  const pal = palette(style, rng);
  const crownC = new THREE.Vector3(0, H * 0.58, 0);
  const crownR = H * 0.42;
  for (let i = 0; i < 6; i++) {
    const y = H * (0.25 + (i / 6) * 0.7);
    const w = Math.sin((i / 5.5) * Math.PI * 0.9 + 0.25) * H * 0.13 + 0.6;
    clump(near, style.leaf, new THREE.Vector3(rng.range(-0.3, 0.3), y, rng.range(-0.3, 0.3)), w, 1.5, crownC, crownR, pal, rng);
  }
  clump(far, 'foliagePlain', crownC, H * 0.14, 3.2, crownC, crownR, pal, rng, 0);
  return { height: H, trunk: r0 };
}

function pine(rng: Rng, near: MeshBuilder, far: MeshBuilder, style: SpeciesStyle): { height: number; trunk: number } {
  const H = rng.range(13, 20);
  const r0 = rng.range(0.22, 0.32);
  const pts = branchPath(rng, new THREE.Vector3(0, -0.3, 0), UP, H, 4, 0.02);
  tube(near, style.bark, pts, pts.map((_, i) => r0 * (1 - (i / pts.length) * 0.85)), 6, col(style.barkColor), 0.3);
  tube(far, style.bark, [pts[0]!, pts[pts.length - 1]!], [r0, 0.05], 4, col(style.barkColor));
  const pal = palette(style, rng);
  const tiers = rng.int(7, 9);
  const base = H * rng.range(0.22, 0.32);
  const crownC = new THREE.Vector3(0, (base + H) / 2, 0);
  const crownR = (H - base) / 2;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = base + (H - base) * t;
    const r = (H * 0.27) * (1 - t * 0.88) * rng.range(0.85, 1.1) + 0.35;
    const h = ((H - base) / tiers) * 2.1;
    // Each tier: a drooping skirt cone with a ragged, saw-toothed rim.
    const segs = 11;
    const tip = new THREE.Vector3(rng.range(-0.15, 0.15), y + h, rng.range(-0.15, 0.15));
    const rim: THREE.Vector3[] = [];
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const rr = r * (s % 2 ? rng.range(0.62, 0.8) : rng.range(0.95, 1.15));
      rim.push(new THREE.Vector3(Math.cos(a) * rr, y - (s % 2 ? 0.05 : rng.range(0.25, 0.6)), Math.sin(a) * rr));
    }
    const inner = new THREE.Vector3(0, y + h * 0.18, 0);
    for (let s = 0; s < segs; s++) {
      const a = rim[s]!;
      const b2 = rim[(s + 1) % segs]!;
      const shade = (p: THREE.Vector3): THREE.Color => {
        const k = THREE.MathUtils.clamp((p.y - crownC.y) / (crownR * 2) + 0.5 + (p.distanceTo(inner) / r) * 0.25, 0, 1);
        return k < 0.5 ? pal[0].clone().lerp(pal[1], k * 2) : pal[1].clone().lerp(pal[2], (k - 0.5) * 2);
      };
      const nTop = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x, r * 0.9, p.z).normalize();
      near.smoothTri(style.leaf, [a, tip, b2], [nTop(a), UP, nTop(b2)], [[a.x, a.z], [tip.x, tip.z], [b2.x, b2.z]], [shade(a), shade(tip).multiplyScalar(1.1), shade(b2)]);
      // Underside of the skirt (dark).
      near.smoothTri(style.leaf, [a, b2, inner], [new THREE.Vector3(a.x, -r, a.z).normalize(), new THREE.Vector3(b2.x, -r, b2.z).normalize(), new THREE.Vector3(0, -1, 0)], [[a.x, a.z], [b2.x, b2.z], [0, 0]], [pal[0], pal[0], pal[0].clone().multiplyScalar(0.7)]);
    }
  }
  // Far: a single tall cone.
  const coneGeo = new THREE.ConeGeometry(H * 0.3, H - base + 1, 6, 1, true);
  coneGeo.translate(0, base + (H - base) / 2, 0);
  far.geometry('foliagePlain', coneGeo, new THREE.Matrix4(), (p) => (p.y > (base + H) / 2 ? pal[1] : pal[0]));
  coneGeo.dispose();
  return { height: H, trunk: r0 };
}

function willow(rng: Rng, near: MeshBuilder, far: MeshBuilder, style: SpeciesStyle): { height: number; trunk: number } {
  const H = rng.range(9, 12);
  const r0 = rng.range(0.38, 0.5);
  const trunkH = H * 0.4;
  const pts = branchPath(rng, new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(rng.range(-0.2, 0.2), 1, rng.range(-0.2, 0.2)), trunkH, 3, 0.1);
  tube(near, style.bark, pts, pts.map((_, i) => r0 * (1 - i * 0.12)), 7, col(style.barkColor), 0.3);
  tube(far, style.bark, [pts[0]!, pts[pts.length - 1]!], [r0, r0 * 0.6], 4, col(style.barkColor));
  const pal = palette(style, rng);
  const top = pts[pts.length - 1]!;
  const crownC = top.clone().add(new THREE.Vector3(0, H * 0.25, 0));
  const crownR = H * 0.5;
  clump(near, style.leaf, crownC, crownR * 0.75, 0.6, crownC, crownR, pal, rng);
  // Hanging curtains: tall narrow clumps around the crown rim, dropping low.
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const rr = crownR * rng.range(0.7, 0.95);
    const drop = rng.range(H * 0.3, H * 0.55);
    const c = new THREE.Vector3(Math.cos(a) * rr, crownC.y - drop * 0.35, Math.sin(a) * rr);
    clump(near, style.leaf, c, rng.range(1.1, 1.6), (drop / 1.4) * 0.6, crownC, crownR, pal, rng);
  }
  clump(far, 'foliagePlain', crownC.clone().add(new THREE.Vector3(0, -H * 0.12, 0)), crownR * 0.95, 0.85, crownC, crownR, pal, rng, 0);
  return { height: H, trunk: r0 };
}

function deadTree(rng: Rng, near: MeshBuilder, far: MeshBuilder, style: SpeciesStyle): { height: number; trunk: number } {
  const H = rng.range(7, 11);
  const r0 = rng.range(0.25, 0.35);
  const pts = branchPath(rng, new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(rng.range(-0.15, 0.15), 1, rng.range(-0.15, 0.15)), H, 5, 0.12);
  const barkCol = col(style.barkColor);
  tube(near, style.bark, pts, pts.map((_, i) => r0 * (1 - (i / pts.length) * 0.85)), 6, barkCol, 0.3);
  tube(far, style.bark, [pts[0]!, pts[pts.length - 1]!], [r0, 0.06], 4, barkCol);
  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number): void => {
    const bp = branchPath(rng, start, dir, len, 3, 0.25, 0.02);
    tube(near, style.bark, bp, bp.map((_, k) => r * (1 - k / bp.length) + 0.02), 4, barkCol);
    if (depth > 0) {
      for (let k = 0; k < 2; k++) {
        const d = new THREE.Vector3(rng.range(-1, 1), rng.range(0.2, 1), rng.range(-1, 1));
        grow(bp[bp.length - 1]!, d, len * 0.6, r * 0.55, depth - 1);
      }
    }
  };
  for (let i = 2; i < pts.length; i++) {
    if (!rng.chance(0.75)) continue;
    const a = rng.range(0, Math.PI * 2);
    grow(pts[i]!, new THREE.Vector3(Math.cos(a), rng.range(0.3, 0.9), Math.sin(a)), H * rng.range(0.25, 0.4), r0 * 0.4, 1);
  }
  return { height: H, trunk: r0 };
}

/** Single-mass silhouette fitted to the mid LOD's foliage bounds. */
function silhouette(mid: Map<MaterialName, THREE.BufferGeometry>, species: TreeSpecies | 'ancient', trunk: number, style: SpeciesStyle): Map<MaterialName, THREE.BufferGeometry> {
  const b = new MeshBuilder();
  const foliage = mid.get('foliagePlain');
  let top = 6;
  let crownBase = 2;
  if (foliage) {
    foliage.computeBoundingBox();
    const bb = foliage.boundingBox!;
    top = bb.max.y;
    crownBase = bb.min.y;
    const c = new THREE.Vector3();
    bb.getCenter(c);
    const size = new THREE.Vector3();
    bb.getSize(size);
    const pal = palette(style, new Rng(7));
    if (species === 'pine') {
      const cone = new THREE.ConeGeometry(Math.max(size.x, size.z) * 0.45, size.y, 5, 1, true);
      cone.translate(c.x, c.y, c.z);
      b.geometry('foliagePlain', cone, new THREE.Matrix4(), (p) => (p.y > c.y ? pal[1] : pal[0]));
      cone.dispose();
    } else {
      const ico = new THREE.IcosahedronGeometry(1, 0);
      const m = new THREE.Matrix4().compose(c, new THREE.Quaternion(), new THREE.Vector3(size.x * 0.5, size.y * 0.5, size.z * 0.5));
      b.geometry('foliagePlain', ico, m, (p) => (p.y > c.y + size.y * 0.15 ? pal[2].clone().lerp(pal[1], 0.5) : p.y > c.y - size.y * 0.2 ? pal[1] : pal[0]));
      ico.dispose();
    }
  }
  const trunkTop = species === 'dead' ? top : Math.max(crownBase + 0.5, 1.5);
  b.cylinder(style.bark, new THREE.Matrix4(), 0, -0.3, 0, trunk, trunk * 0.5, trunkTop + 0.3, 3, { color: col(style.barkColor) }, { flat: true });
  return b.build() as Map<MaterialName, THREE.BufferGeometry>;
}

export function generateTree(species: TreeSpecies | 'ancient', variant: number): TreeAsset {
  const rng = new Rng(0x7ee5 + variant * 7919 + species.length * 104729 + species.charCodeAt(0) * 31);
  const near = new MeshBuilder();
  const far = new MeshBuilder();
  const style = STYLES[species];
  let r: { height: number; trunk: number };
  switch (species) {
    case 'oak':
    case 'beech':
    case 'ancient':
      r = deciduous(rng, species, near, far, style);
      break;
    case 'birch':
      r = birch(rng, near, far, style);
      break;
    case 'poplar':
      r = poplar(rng, near, far, style);
      break;
    case 'pine':
      r = pine(rng, near, far, style);
      break;
    case 'willow':
      r = willow(rng, near, far, style);
      break;
    case 'dead':
      r = deadTree(rng, near, far, style);
      break;
  }
  const mid = far.build() as Map<MaterialName, THREE.BufferGeometry>;
  return {
    species,
    near: near.build() as Map<MaterialName, THREE.BufferGeometry>,
    mid,
    far: silhouette(mid, species, r.trunk, style),
    height: r.height,
    trunkRadius: r.trunk,
  };
}
