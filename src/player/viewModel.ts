/**
 * First-person view model rendered in its own scene into the same low-res
 * target as the world (so it shares the pixel look and grading). Procedural
 * animation: breathing idle, stride-locked walk bob, sprint carry pose,
 * mouse-look inertia, landing dip and a three-phase sword swing.
 */
import * as THREE from 'three';
import { MeshBuilder, col, trs } from '../assets/geo';
import { atmosphereUniforms } from '../rendering/atmosphere';
import { damp } from '../core/math';

const LEATHER = col('#3e2c23');
const LEATHER_DARK = col('#231913');
const LEATHER_LIGHT = col('#6e5241');
const BRACER = col('#2c2622');
const TOOLING = col('#8a7a62');
const STEEL = col('#c9c3bc');
const STEEL_DARK = col('#5e5f66');
const STEEL_EDGE = col('#f4f0ea');
const GOLD = col('#c8963e');
const SLEEVE = col('#3c3550');

function swordGeometry(b: MeshBuilder): void {
  const I = new THREE.Matrix4();
  // Blade: lozenge cross-section with a dark fuller, tapering to a point.
  const len = 0.92;
  const steps = 8;
  const width = (t: number): number => 0.026 * (1 - t * 0.55) * (t > 0.86 ? Math.max(0, (1 - t) / 0.14) : 1);
  const thick = (t: number): number => 0.0065 * (1 - t * 0.6) + 0.001;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const y0 = 0.03 + t0 * len;
    const y1 = 0.03 + t1 * len;
    const w0 = width(t0);
    const w1 = width(t1);
    const k0 = thick(t0);
    const k1 = thick(t1);
    for (const sz of [1, -1]) {
      // Each face: edge → spine (two bevels per side).
      for (const sx of [1, -1]) {
        const e0 = new THREE.Vector3(sx * w0, y0, 0);
        const e1 = new THREE.Vector3(sx * w1, y1, 0);
        const s0 = new THREE.Vector3(0, y0, sz * k0);
        const s1 = new THREE.Vector3(0, y1, sz * k1);
        const n = new THREE.Vector3(sx * 0.35, 0, sz).normalize();
        const cE = STEEL_EDGE;
        const cS = STEEL.clone().lerp(STEEL_DARK, 0.25);
        const ccw = sx * sz > 0;
        if (ccw) {
          b.smoothTri('steel', [e0, s1, s0], [n, n, n], [[0, y0], [1, y1], [1, y0]], [cE, cS, cS]);
          b.smoothTri('steel', [e0, e1, s1], [n, n, n], [[0, y0], [0, y1], [1, y1]], [cE, cE, cS]);
        } else {
          b.smoothTri('steel', [e0, s0, s1], [n, n, n], [[0, y0], [1, y0], [1, y1]], [cE, cS, cS]);
          b.smoothTri('steel', [e0, s1, e1], [n, n, n], [[0, y0], [1, y1], [0, y1]], [cE, cS, cE]);
        }
      }
      // Fuller groove along the first two thirds.
      if (t1 < 0.7) {
        const f = new THREE.Vector3(0, 0, sz);
        const fz = sz * (Math.min(k0, k1) + 0.0004);
        const fw = 0.0055;
        const q0 = new THREE.Vector3(-fw, y0, fz);
        const q1 = new THREE.Vector3(fw, y0, fz);
        const q2 = new THREE.Vector3(fw, y1, fz);
        const q3 = new THREE.Vector3(-fw, y1, fz);
        if (sz > 0) {
          b.smoothTri('steel', [q0, q1, q2], [f, f, f], [[0, 0], [1, 0], [1, 1]], [STEEL_DARK, STEEL_DARK, STEEL_DARK]);
          b.smoothTri('steel', [q0, q2, q3], [f, f, f], [[0, 0], [1, 1], [0, 1]], [STEEL_DARK, STEEL_DARK, STEEL_DARK]);
        } else {
          b.smoothTri('steel', [q0, q2, q1], [f, f, f], [[0, 0], [1, 1], [1, 0]], [STEEL_DARK, STEEL_DARK, STEEL_DARK]);
          b.smoothTri('steel', [q0, q3, q2], [f, f, f], [[0, 0], [0, 1], [1, 1]], [STEEL_DARK, STEEL_DARK, STEEL_DARK]);
        }
      }
    }
  }
  // Ricasso block.
  b.box('steel', I, 0, 0.035, 0, 0.044, 0.05, 0.014, { color: STEEL });
  // Cross-guard: a gently up-swept bar built from short segments, rounded
  // gilded finials and a diamond langet over the blade root.
  const guardCol = STEEL_DARK.clone().lerp(STEEL, 0.35);
  for (let k = -3; k <= 3; k++) {
    const x = k * 0.026;
    const y = 0.007 * (k / 3) * (k / 3);
    const slope = (0.014 * k) / 9 / 0.026;
    const th = 0.017 - Math.abs(k) * 0.0012;
    b.box('steel', trs(x, y, 0, 0, 1, 1, 1, 0, Math.atan(slope)), 0, 0, 0, 0.03, th, 0.022 - Math.abs(k) * 0.001, { color: k === 0 ? guardCol.clone().lerp(GOLD, 0.3) : guardCol });
  }
  for (const s of [-1, 1]) {
    const fin = new THREE.IcosahedronGeometry(0.013, 0);
    b.geometry('steel', fin, trs(s * 0.096, 0.011, 0), GOLD.clone().multiplyScalar(0.8));
    fin.dispose();
  }
  b.box('steel', trs(0, 0.022, 0, 0, 1, 1, 1, 0, Math.PI / 4), 0, 0, 0, 0.022, 0.022, 0.026, { color: guardCol });
  b.box('steel', trs(0, 0.022, 0, 0, 1, 1, 1, 0, Math.PI / 4), 0, 0, 0, 0.012, 0.012, 0.028, { color: GOLD.clone().multiplyScalar(0.75) });
  // Leather grip with wrap ridges.
  b.cylinder('leather', I, 0, -0.17, 0, 0.016, 0.018, 0.165, 7, { color: LEATHER_DARK });
  for (let i = 0; i < 6; i++) b.cylinder('leather', I, 0, -0.16 + i * 0.026, 0, 0.0185, 0.0185, 0.007, 7, { color: LEATHER_LIGHT }, { flat: true });
  // Pommel: faceted wheel with a gilded cap.
  b.cylinder('steel', trs(0, -0.19, 0, 0, 1, 1, 1, Math.PI / 2, 0), 0, -0.012, 0, 0.032, 0.032, 0.024, 8, { color: STEEL_DARK.clone().lerp(GOLD, 0.5) }, { capTop: true, capBottom: true, flat: true });
  b.box('steel', I, 0, -0.215, 0, 0.018, 0.018, 0.018, { color: GOLD });
}

/** A rounded mass (subdivided icosahedron) for organic glove forms. */
function blob(b: MeshBuilder, m: THREE.Matrix4, sx: number, sy: number, sz: number, color: THREE.Color, shade = 0.35): void {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const s = new THREE.Matrix4().makeScale(sx, sy, sz);
  // Darken the underside a touch so forms read at low resolution.
  b.geometry('leather', g, m.clone().multiply(s), (_p, n) => color.clone().multiplyScalar(1 - shade * Math.max(0, -n.y) - 0.12 * Math.max(0, -n.z)));
  g.dispose();
}

/**
 * A gloved fist closed around a vertical grip at the origin (blade +Y):
 * rolled fingers across the front of the grip, a knuckle ridge, the thumb
 * locked over the index finger, a flared cuff and a tooled vambrace.
 */
function fistGeometry(b: MeshBuilder, mirror: number, open = 0): void {
  const M = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): THREE.Matrix4 => trs(x * mirror, y, z, yaw * mirror, 1, 1, 1, pitch, roll * mirror);
  // Back of the hand behind the grip.
  blob(b, M(0.012, -0.074, 0.024, 0.25, 0.05, 0.08), 0.036, 0.058, 0.022, LEATHER);
  // Knuckle ridge on the outer edge, catching light.
  blob(b, M(0.03, -0.072, -0.004, 0.3, 0, 0.06), 0.016, 0.056, 0.018, LEATHER_LIGHT, 0.2);
  // Four fingers rolled across the front of the grip.
  for (let i = 0; i < 4; i++) {
    const y = -0.032 - i * 0.026;
    const w = 0.032 - i * 0.0015;
    const c = i % 2 ? LEATHER : LEATHER.clone().lerp(LEATHER_LIGHT, 0.4);
    blob(b, M(0.004 - open * 0.01, y, -0.021 - open * 0.025, 0.15 + open * 0.5, 0, 0), w, 0.0135, 0.0145, c);
    // Fingertip seam line (dark crease between fingers).
    if (i < 3) b.box('leather', M(0.004, y - 0.013, -0.031, 0.15, 0, 0), 0, 0, 0, w * 1.6, 0.003, 0.004, { color: LEATHER_DARK });
  }
  // Thumb locked over the index finger.
  blob(b, M(-0.012, -0.026, -0.03, -0.5, 0, -0.45), 0.032, 0.0125, 0.0135, LEATHER.clone().lerp(LEATHER_LIGHT, 0.6));
  // Flared cuff and tooled vambrace running back towards the elbow.
  const wrist = M(0.016, -0.13, 0.03, 0, 0.55, -0.3);
  b.cylinder('leather', wrist, 0, -0.05, 0, 0.042, 0.038, 0.06, 10, { color: LEATHER_DARK });
  b.cylinder('leather', wrist, 0, -0.066, 0, 0.05, 0.047, 0.018, 10, { color: TOOLING }, { flat: true });
  b.cylinder('leather', wrist, 0, -0.34, 0, 0.056, 0.049, 0.28, 12, { color: BRACER });
  for (let i = 0; i < 3; i++) b.cylinder('leather', wrist, 0, -0.32 + i * 0.09, 0, 0.0585 - i * 0.002, 0.0575 - i * 0.002, 0.012, 12, { color: TOOLING }, { flat: true });
  // Diamond tooling motifs and a riveted stud.
  for (let i = 0; i < 3; i++) b.box('leather', wrist.clone().multiply(trs(0.05, -0.27 + i * 0.09, 0.02, 0.4, 1, 1, 1, 0, Math.PI / 4)), 0, 0, 0, 0.016, 0.016, 0.01, { color: TOOLING });
  b.box('steel', wrist, 0.052, -0.2, -0.012, 0.011, 0.011, 0.011, { color: STEEL });
  b.cylinder('leather', wrist, 0, -0.64, 0, 0.07, 0.06, 0.3, 12, { color: SLEEVE });
}

interface Pose {
  p: THREE.Vector3;
  r: THREE.Euler;
}

const IDLE: Pose = { p: new THREE.Vector3(0.24, -0.13, -0.5), r: new THREE.Euler(-1.0, -0.05, 0.12) };
const SPRINT: Pose = { p: new THREE.Vector3(0.28, -0.3, -0.46), r: new THREE.Euler(-1.5, 0.15, -0.25) };
const WINDUP: Pose = { p: new THREE.Vector3(0.33, -0.06, -0.44), r: new THREE.Euler(-0.25, -0.35, -0.95) };
const SLASH: Pose = { p: new THREE.Vector3(-0.16, -0.32, -0.5), r: new THREE.Euler(-1.65, 0.45, 1.25) };

export class ViewModel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();
  private readonly swordArm = new THREE.Group();
  private readonly offArm = new THREE.Group();
  private readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private time = 0;
  private swayX = 0;
  private swayY = 0;
  private dip = 0;
  private sprintBlend = 0;
  private attackT = -1;
  private readonly pose: Pose = { p: IDLE.p.clone(), r: IDLE.r.clone() };
  /** Called at the moment of the slash (for audio/camera). */
  onSwing: (() => void) | null = null;
  attacking = false;

  constructor(materials: { steel: THREE.Material; leather: THREE.Material }) {
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.01, 10);
    this.scene.add(this.root);
    this.root.add(this.swordArm, this.offArm);
    this.scene.add(this.sun, this.hemi);
    this.sun.intensity = 2.4;
    this.hemi.intensity = 1.3;

    const sb = new MeshBuilder();
    swordGeometry(sb);
    fistGeometry(sb, 1);
    for (const [key, geo] of sb.build()) {
      const mesh = new THREE.Mesh(geo, key === 'steel' ? materials.steel : materials.leather);
      mesh.frustumCulled = false;
      this.swordArm.add(mesh);
    }
    const ob = new MeshBuilder();
    fistGeometry(ob, -1, 0.35);
    for (const [, geo] of ob.build()) {
      const mesh = new THREE.Mesh(geo, materials.leather);
      mesh.frustumCulled = false;
      this.offArm.add(mesh);
    }
    this.offArm.position.set(-0.3, -0.42, -0.38);
    this.offArm.rotation.set(-1.0, -0.2, 0.45);
  }

  static createMaterials(): { steel: THREE.Material; leather: THREE.Material } {
    // Warm emissive lift counters the violet sky fill so the steel reads silver, not blue.
    const steel = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: new THREE.Color('#e8e2d8'), emissive: new THREE.Color('#2a2218'), side: THREE.DoubleSide });
    const leather = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    return { steel, leather };
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  attack(): void {
    if (this.attackT < 0 || this.attackT > 0.5) {
      this.attackT = 0;
      this.attacking = true;
    }
  }

  /** Keep lighting consistent with the world. */
  syncLighting(cameraQuat: THREE.Quaternion, skyLight: THREE.Color, groundLight: THREE.Color, hemiIntensity: number): void {
    // Light directions are in view space: rotate the world sun into camera space.
    const inv = cameraQuat.clone().invert();
    const d = atmosphereUniforms.uSunDir.value.clone().applyQuaternion(inv);
    this.sun.position.copy(d);
    this.sun.color.copy(atmosphereUniforms.uSunColor.value);
    this.hemi.color.copy(skyLight);
    this.hemi.groundColor.copy(groundLight);
    this.hemi.intensity = hemiIntensity * 1.1;
    this.hemi.position.set(0, 1, 0).applyQuaternion(inv);
  }

  update(dt: number, s: { speed: number; stride: number; sprinting: boolean; onGround: boolean; landing: number; lookDX: number; lookDY: number; bob: boolean }): void {
    this.time += dt;
    // Mouse-look inertia: the arm trails the view slightly.
    this.swayX += (-s.lookDX * 0.0009 - this.swayX) * damp(9, dt);
    this.swayY += (s.lookDY * 0.0009 - this.swayY) * damp(9, dt);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.06, 0.06);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -0.05, 0.05);
    if (s.landing > 0) this.dip = Math.min(0.08, this.dip + s.landing * 0.008);
    this.dip += (0 - this.dip) * damp(7, dt);
    this.sprintBlend += ((s.sprinting && s.speed > 5 ? 1 : 0) - this.sprintBlend) * damp(7, dt);

    // Base pose: idle blended toward sprint carry.
    const base: Pose = {
      p: IDLE.p.clone().lerp(SPRINT.p, this.sprintBlend),
      r: new THREE.Euler(
        THREE.MathUtils.lerp(IDLE.r.x, SPRINT.r.x, this.sprintBlend),
        THREE.MathUtils.lerp(IDLE.r.y, SPRINT.r.y, this.sprintBlend),
        THREE.MathUtils.lerp(IDLE.r.z, SPRINT.r.z, this.sprintBlend),
      ),
    };

    // Attack timeline: anticipation (0–0.16) → slash (0.16–0.32) → recovery (0.32–0.7).
    let target = base;
    if (this.attackT >= 0) {
      const t = this.attackT;
      const ease = (x: number): number => x * x * (3 - 2 * x);
      if (t < 0.16) target = lerpPose(base, WINDUP, ease(t / 0.16));
      else if (t < 0.32) {
        if (t - dt < 0.16) this.onSwing?.();
        target = lerpPose(WINDUP, SLASH, Math.pow((t - 0.16) / 0.16, 0.7));
      } else if (t < 0.7) target = lerpPose(SLASH, base, ease((t - 0.32) / 0.38));
      else {
        this.attackT = -1;
        this.attacking = false;
      }
      if (this.attackT >= 0) this.attackT += dt;
    }
    const follow = this.attackT >= 0 ? 1 : damp(12, dt);
    this.pose.p.lerp(target.p, follow);
    this.pose.r.set(
      THREE.MathUtils.lerp(this.pose.r.x, target.r.x, follow),
      THREE.MathUtils.lerp(this.pose.r.y, target.r.y, follow),
      THREE.MathUtils.lerp(this.pose.r.z, target.r.z, follow),
    );

    // Walk bob locked to stride distance; breathing when still.
    const moving = THREE.MathUtils.clamp(s.speed / 4, 0, 1.6) * (s.onGround ? 1 : 0.2) * (s.bob ? 1 : 0.35);
    const phase = (s.stride / 2.4) * Math.PI * 2;
    const bobX = Math.sin(phase) * 0.011 * moving;
    const bobY = -Math.abs(Math.cos(phase)) * 0.014 * moving;
    const breathe = Math.sin(this.time * 1.6) * 0.004;

    this.swordArm.position.set(this.pose.p.x + bobX + this.swayX, this.pose.p.y + bobY + breathe - this.dip + this.swayY, this.pose.p.z);
    this.swordArm.rotation.set(this.pose.r.x + bobY * 2 + breathe, this.pose.r.y + this.swayX * 2, this.pose.r.z + bobX * 3, 'XYZ');

    // Off hand swings opposite to the stride and rises a little when moving.
    const offLift = Math.min(1, moving) * 0.06 + this.sprintBlend * 0.04;
    this.offArm.position.set(-0.3 - bobX * 1.4 + this.swayX, -0.4 + offLift - bobY * 0.8 - this.dip + breathe + this.swayY, -0.38 + Math.sin(phase) * 0.03 * moving);
    this.offArm.rotation.set(-1.0 + Math.sin(phase) * 0.18 * moving, -0.2, 0.45);
  }
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    p: a.p.clone().lerp(b.p, t),
    r: new THREE.Euler(THREE.MathUtils.lerp(a.r.x, b.r.x, t), THREE.MathUtils.lerp(a.r.y, b.r.y, t), THREE.MathUtils.lerp(a.r.z, b.r.z, t)),
  };
}
