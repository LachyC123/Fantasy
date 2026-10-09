/**
 * Flocks of small birds: each flock orbits a point of interest (the valley,
 * the castle spires, the forest edge) on a slowly wandering loop; individual
 * birds keep loose formation offsets and alternate flapping with glides.
 * Two instanced wing meshes → two draw calls for every bird in the sky.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { patchMaterial } from '../rendering/atmosphere';

interface Bird {
  offset: THREE.Vector3;
  phase: number;
  flapRate: number;
  glide: number;
}

interface Flock {
  center: THREE.Vector3;
  radius: number;
  height: number;
  speed: number;
  angle: number;
  wobble: number;
  birds: Bird[];
}

export class Birds {
  readonly group = new THREE.Group();
  private readonly flocks: Flock[] = [];
  private readonly left: THREE.InstancedMesh;
  private readonly right: THREE.InstancedMesh;
  private readonly count: number;
  private time = 0;

  constructor(anchors: { center: THREE.Vector3; radius: number; height: number; size: number }[], seed: number) {
    const rng = new Rng(seed);
    for (const a of anchors) {
      const birds: Bird[] = [];
      for (let i = 0; i < a.size; i++) {
        birds.push({
          offset: new THREE.Vector3(rng.range(-9, 9), rng.range(-3, 3), rng.range(-9, 9)),
          phase: rng.range(0, Math.PI * 2),
          flapRate: rng.range(9, 13),
          glide: rng.range(0, Math.PI * 2),
        });
      }
      this.flocks.push({ center: a.center.clone(), radius: a.radius, height: a.height, speed: rng.range(0.05, 0.09) * (rng.chance(0.5) ? 1 : -1), angle: rng.range(0, Math.PI * 2), wobble: rng.range(0, 10), birds });
    }
    this.count = this.flocks.reduce((n, f) => n + f.birds.length, 0);
    // One wing: a thin swept triangle pair, hinged at the body (origin).
    const wing = new THREE.BufferGeometry();
    const v = new Float32Array([0, 0, 0.12, 0.55, 0.02, -0.05, 0, 0, -0.18, 0, 0, 0.12, 0, 0, -0.18, 0.55, 0.02, -0.05]);
    wing.setAttribute('position', new THREE.BufferAttribute(v, 3));
    wing.computeVertexNormals();
    const mat = patchMaterial(new THREE.MeshLambertMaterial({ color: '#2a2630', side: THREE.DoubleSide }));
    this.left = new THREE.InstancedMesh(wing, mat, this.count);
    const wingR = wing.clone();
    wingR.scale(-1, 1, 1);
    this.right = new THREE.InstancedMesh(wingR, mat, this.count);
    for (const m of [this.left, this.right]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.group.name = 'birds';
  }

  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _qw = new THREE.Quaternion();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3(1.4, 1.4, 1.4);
  private readonly _e = new THREE.Euler();

  update(dt: number): void {
    this.time += dt;
    let i = 0;
    for (const f of this.flocks) {
      f.angle += f.speed * dt;
      const r = f.radius * (1 + 0.25 * Math.sin(this.time * 0.07 + f.wobble));
      const cx = f.center.x + Math.cos(f.angle) * r;
      const cz = f.center.z + Math.sin(f.angle) * r;
      const cy = f.height + Math.sin(this.time * 0.21 + f.wobble) * 6;
      // Heading along the loop tangent.
      const heading = Math.atan2(-Math.sin(f.angle) * Math.sign(f.speed), Math.cos(f.angle) * Math.sign(f.speed));
      const bank = -Math.sign(f.speed) * 0.35;
      for (const b of f.birds) {
        const flap = Math.sin(this.time * 0.6 + b.glide) > -0.2 ? Math.sin(this.time * b.flapRate + b.phase) * 0.9 : 0.12;
        const sway = Math.sin(this.time * 0.8 + b.phase) * 2;
        this._p.set(cx + b.offset.x + sway, cy + b.offset.y + Math.sin(this.time * 1.3 + b.phase) * 0.6, cz + b.offset.z);
        this._q.setFromEuler(this._e.set(0, heading, bank, 'YXZ'));
        this._qw.setFromEuler(this._e.set(0, 0, flap));
        this._m.compose(this._p, this._q.clone().multiply(this._qw), this._s);
        this.left.setMatrixAt(i, this._m);
        this._qw.setFromEuler(this._e.set(0, 0, -flap));
        this._m.compose(this._p, this._q.clone().multiply(this._qw), this._s);
        this.right.setMatrixAt(i, this._m);
        i++;
      }
    }
    this.left.instanceMatrix.needsUpdate = true;
    this.right.instanceMatrix.needsUpdate = true;
  }
}
