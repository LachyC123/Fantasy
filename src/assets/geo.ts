/**
 * MeshBuilder: accumulates primitives into per-material geometry batches.
 * UVs are in metres so every surface keeps the same texel density; vertex
 * colours carry tint, ambient occlusion and per-asset variation.
 */
import * as THREE from 'three';

export type MatKey = string;

class Batch {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export interface Shade {
  /** Base vertex colour. */
  color: THREE.Color;
  /** Darken vertices near the local bottom (fake AO), 0–1. */
  aoBottom?: number;
  /** Local Y span used for the AO gradient. */
  aoHeight?: number;
}

export class MeshBuilder {
  private readonly batches = new Map<MatKey, Batch>();

  private batch(key: MatKey): Batch {
    let b = this.batches.get(key);
    if (!b) this.batches.set(key, (b = new Batch()));
    return b;
  }

  /** Raw triangle with explicit normal/uvs; positions already in world/object space. */
  tri(
    key: MatKey,
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    ua: [number, number],
    ub: [number, number],
    uc: [number, number],
    col: THREE.Color | [THREE.Color, THREE.Color, THREE.Color],
    normal?: THREE.Vector3,
  ): void {
    const bt = this.batch(key);
    const n = normal ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const cols = Array.isArray(col) ? col : [col, col, col];
    const ps = [a, b, c];
    const us = [ua, ub, uc];
    for (let i = 0; i < 3; i++) {
      bt.pos.push(ps[i]!.x, ps[i]!.y, ps[i]!.z);
      bt.nrm.push(n.x, n.y, n.z);
      bt.uv.push(us[i]![0], us[i]![1]);
      bt.col.push(cols[i]!.r, cols[i]!.g, cols[i]!.b);
    }
  }

  quad(
    key: MatKey,
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    col: THREE.Color | [THREE.Color, THREE.Color, THREE.Color, THREE.Color],
    uvs?: [[number, number], [number, number], [number, number], [number, number]],
  ): void {
    // Default UV: planar metres along edges p0→p1 and p0→p3.
    const u = uvs ?? [
      [0, 0],
      [p0.distanceTo(p1), 0],
      [p0.distanceTo(p1), p0.distanceTo(p3)],
      [0, p0.distanceTo(p3)],
    ];
    const c = Array.isArray(col) ? col : [col, col, col, col];
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p3, p0)).normalize();
    this.tri(key, p0, p1, p2, u[0], u[1], u[2], [c[0], c[1], c[2]], n);
    this.tri(key, p0, p2, p3, u[0], u[2], u[3], [c[0], c[2], c[3]], n);
  }

  /**
   * Axis-aligned box in local space (centre cx,cy,cz; size sx,sy,sz)
   * transformed by `m`. Faces get metre-scaled UVs.
   */
  box(key: MatKey, m: THREE.Matrix4, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, shade: Shade, faces = 0b111111): void {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const P = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(cx + x, cy + y, cz + z).applyMatrix4(m);
    const colAt = (y: number): THREE.Color => {
      if (!shade.aoBottom) return shade.color;
      const span = shade.aoHeight ?? sy;
      const t = THREE.MathUtils.clamp((cy + y - (cy - hy)) / span, 0, 1);
      return shade.color.clone().multiplyScalar(1 - shade.aoBottom * (1 - t));
    };
    const cb = colAt(-hy);
    const ct = colAt(hy);
    // +Z
    if (faces & 1) this.quad(key, P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), [cb, cb, ct, ct], [[cx - hx + cz, cy - hy], [cx + hx + cz, cy - hy], [cx + hx + cz, cy + hy], [cx - hx + cz, cy + hy]]);
    // -Z
    if (faces & 2) this.quad(key, P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), [cb, cb, ct, ct], [[-cx - hx, cy - hy], [-cx + hx, cy - hy], [-cx + hx, cy + hy], [-cx - hx, cy + hy]]);
    // +X
    if (faces & 4) this.quad(key, P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), [cb, cb, ct, ct], [[-cz - hz, cy - hy], [-cz + hz, cy - hy], [-cz + hz, cy + hy], [-cz - hz, cy + hy]]);
    // -X
    if (faces & 8) this.quad(key, P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), [cb, cb, ct, ct], [[cz - hz, cy - hy], [cz + hz, cy - hy], [cz + hz, cy + hy], [cz - hz, cy + hy]]);
    // +Y
    if (faces & 16) this.quad(key, P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), ct, [[cx - hx, cz + hz], [cx + hx, cz + hz], [cx + hx, cz - hz], [cx - hx, cz - hz]]);
    // -Y
    if (faces & 32) this.quad(key, P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), cb, [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]]);
  }

  /** Vertical cylinder / truncated cone. Smooth sides, optional caps. */
  cylinder(
    key: MatKey,
    m: THREE.Matrix4,
    cx: number,
    cy: number,
    cz: number,
    rBottom: number,
    rTop: number,
    h: number,
    segs: number,
    shade: Shade,
    opts: { capTop?: boolean; capBottom?: boolean; uvScale?: number; flat?: boolean } = {},
  ): void {
    const circ = Math.PI * 2 * Math.max(rBottom, rTop);
    const us = opts.uvScale ?? 1;
    const cb = shade.aoBottom ? shade.color.clone().multiplyScalar(1 - shade.aoBottom) : shade.color;
    const ct = shade.color;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = new THREE.Vector3(cx + Math.cos(a0) * rBottom, cy, cz + Math.sin(a0) * rBottom).applyMatrix4(m);
      const p1 = new THREE.Vector3(cx + Math.cos(a1) * rBottom, cy, cz + Math.sin(a1) * rBottom).applyMatrix4(m);
      const p2 = new THREE.Vector3(cx + Math.cos(a1) * rTop, cy + h, cz + Math.sin(a1) * rTop).applyMatrix4(m);
      const p3 = new THREE.Vector3(cx + Math.cos(a0) * rTop, cy + h, cz + Math.sin(a0) * rTop).applyMatrix4(m);
      const u0 = (i / segs) * circ * us;
      const u1 = ((i + 1) / segs) * circ * us;
      const v0 = cy * us;
      const v1 = (cy + h) * us;
      if (opts.flat) {
        this.quad(key, p1, p0, p3, p2, [cb, cb, ct, ct], [[u1, v0], [u0, v0], [u0, v1], [u1, v1]]);
      } else {
        _nm.getNormalMatrix(m);
        const slope = (rBottom - rTop) / h;
        const n0 = new THREE.Vector3(Math.cos(a0), slope, Math.sin(a0)).applyMatrix3(_nm).normalize();
        const n1 = new THREE.Vector3(Math.cos(a1), slope, Math.sin(a1)).applyMatrix3(_nm).normalize();
        this.smoothTri(key, [p1, p0, p3], [n1, n0, n0], [[u1, v0], [u0, v0], [u0, v1]], [cb, cb, ct]);
        this.smoothTri(key, [p1, p3, p2], [n1, n0, n1], [[u1, v0], [u0, v1], [u1, v1]], [cb, ct, ct]);
      }
      if (opts.capTop && rTop > 0.001) {
        const c = new THREE.Vector3(cx, cy + h, cz).applyMatrix4(m);
        this.tri(key, c, p2, p3, [cx, cz], [cx + Math.cos(a1) * rTop, cz + Math.sin(a1) * rTop], [cx + Math.cos(a0) * rTop, cz + Math.sin(a0) * rTop], ct);
      }
      if (opts.capBottom && rBottom > 0.001) {
        const c = new THREE.Vector3(cx, cy, cz).applyMatrix4(m);
        this.tri(key, c, p0, p1, [cx, cz], [cx + Math.cos(a0) * rBottom, cz + Math.sin(a0) * rBottom], [cx + Math.cos(a1) * rBottom, cz + Math.sin(a1) * rBottom], cb);
      }
    }
  }

  smoothTri(key: MatKey, p: THREE.Vector3[], n: THREE.Vector3[], uv: [number, number][], c: THREE.Color[]): void {
    const bt = this.batch(key);
    for (let i = 0; i < 3; i++) {
      bt.pos.push(p[i]!.x, p[i]!.y, p[i]!.z);
      bt.nrm.push(n[i]!.x, n[i]!.y, n[i]!.z);
      bt.uv.push(uv[i]![0], uv[i]![1]);
      bt.col.push(c[i]!.r, c[i]!.g, c[i]!.b);
    }
  }

  /** Append an arbitrary three.js geometry (indexed or not) with a transform and colour. */
  /** `color: null` keeps the geometry's own vertex colours. */
  geometry(key: MatKey, geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color | null | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color), uvScale = 1): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const own = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    const tmp = new THREE.Color();
    const bt = this.batch(key);
    _nm.getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (nrm) _n.fromBufferAttribute(nrm, i).applyMatrix3(_nm).normalize();
      else _n.set(0, 1, 0);
      bt.pos.push(_v.x, _v.y, _v.z);
      bt.nrm.push(_n.x, _n.y, _n.z);
      bt.uv.push(uv ? uv.getX(i) * uvScale : _v.x, uv ? uv.getY(i) * uvScale : _v.y);
      const c = color === null ? (own ? tmp.fromBufferAttribute(own, i) : tmp.setRGB(1, 1, 1)) : typeof color === 'function' ? color(_v, _n) : color;
      bt.col.push(c.r, c.g, c.b);
    }
    if (g !== geo) g.dispose();
  }

  isEmpty(): boolean {
    return this.batches.size === 0;
  }

  keys(): MatKey[] {
    return [...this.batches.keys()];
  }

  /** Finish: one BufferGeometry per material key. */
  build(): Map<MatKey, THREE.BufferGeometry> {
    const out = new Map<MatKey, THREE.BufferGeometry>();
    for (const [key, b] of this.batches) {
      if (b.pos.length === 0) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out.set(key, g);
    }
    return out;
  }
}

export const col = (hex: string | number): THREE.Color => new THREE.Color(hex);

/** Compose a transform from position, Y rotation and uniform/axis scale. */
export function trs(x: number, y: number, z: number, yaw = 0, sx = 1, sy = sx, sz = sx, pitch = 0, roll = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  return m;
}
