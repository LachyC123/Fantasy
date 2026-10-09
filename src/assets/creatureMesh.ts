/**
 * Builds a creature mesh from a CreatureGenome. Feet rest on y = 0 and the
 * creature faces +Z. Parts are lumpy masses, tapered tube limbs with joints,
 * heads with generated eyes / horns / antlers / jaws, covering details (fur
 * spines, scale plates, ribs, armour, moss) and mutation visuals (twin head,
 * thorns, bells, embers, frost, fungus, crystal). Material keys: 'body',
 * 'metal', 'glow', 'ghost'.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { Noise2D } from '../core/noise';
import { MeshBuilder, col, trs } from './geo';
import { buildWeapon } from './weaponMesh';
import type { CreatureGenome } from '../gameplay/creatures';

const noise = new Noise2D(0xc4ea);
const UP = new THREE.Vector3(0, 1, 0);

interface Ctx {
  b: MeshBuilder;
  g: CreatureGenome;
  rng: Rng;
  S: number;
  body: THREE.Color;
  belly: THREE.Color;
  dark: THREE.Color;
  eye: THREE.Color;
  skin: 'body' | 'ghost';
  has: (v: string) => boolean;
}

/** Lumpy ellipsoid mass, darker beneath and paler on the belly side. */
function mass(c: Ctx, centre: THREE.Vector3, rx: number, ry: number, rz: number, colour: THREE.Color, rough = 0.18, key: string = c.skin, tilt = 0): void {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const seed = c.rng.range(0, 100);
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const n = noise.sample(v.x * 2.1 + seed, v.z * 2.1 + v.y * 1.7 - seed);
    const k = 1 + rough * n;
    pos.setXYZ(i, v.x * rx * k, v.y * ry * k, v.z * rz * k);
  }
  geo.computeVertexNormals();
  const m = trs(centre.x, centre.y, centre.z, 0, 1, 1, 1, tilt);
  const belly = c.belly;
  c.b.geometry(key, geo, m, (_p, n) => {
    const under = Math.max(0, -n.y);
    return colour.clone().lerp(belly, under * 0.5).multiplyScalar(1 - under * 0.25 + Math.max(0, n.y) * 0.1);
  });
  geo.dispose();
}

/** Tapered tube between two points. */
function limb(c: Ctx, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, colour: THREE.Color, key: string = c.skin, sides = 6): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-4) return;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const m = new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1));
  c.b.cylinder(key, m, 0, 0, 0, r0, r1, len, sides, { color: colour, aoBottom: 0.15 }, { capTop: true });
}

/** Two-segment limb through a joint, with a small joint mass. */
function jointed(c: Ctx, hip: THREE.Vector3, knee: THREE.Vector3, foot: THREE.Vector3, r: number, colour: THREE.Color, key: string = c.skin): void {
  limb(c, hip, knee, r, r * 0.8, colour, key);
  limb(c, knee, foot, r * 0.8, r * 0.55, colour, key);
  mass(c, knee, r * 0.95, r * 0.95, r * 0.95, colour, 0.1, key);
}

function spike(c: Ctx, at: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, colour: THREE.Color, key = 'body'): void {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  const m = new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1));
  c.b.cylinder(key, m, 0, 0, 0, r, 0.001, len, 5, { color: colour }, { flat: true });
}

function head(c: Ctx, at: THREE.Vector3, r: number, forward: THREE.Vector3): void {
  const g = c.g;
  const f = forward.clone().normalize();
  const side = new THREE.Vector3().crossVectors(UP, f).normalize();
  mass(c, at, r * 0.9, r * 0.82, r * 1.05, c.body, 0.15);
  // Eyes: a row across the front, extra eyes stacked above for the many-eyed.
  const n = g.body.eyes;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2);
    const sideSign = n === 1 ? 0 : i % 2 === 0 ? -1 : 1;
    const p = at.clone().addScaledVector(f, r * 0.85).addScaledVector(side, sideSign * r * (0.35 + row * 0.12)).addScaledVector(UP, r * (0.15 + row * 0.22));
    c.b.box('glow', trs(p.x, p.y, p.z), 0, 0, 0, r * 0.2, r * 0.16, r * 0.12, { color: c.eye });
  }
  // Jaw.
  const jawAt = at.clone().addScaledVector(f, r * 0.55).addScaledVector(UP, -r * 0.45);
  switch (g.body.jaw) {
    case 'maw':
      mass(c, jawAt, r * 0.55, r * 0.22, r * 0.6, c.dark, 0.1);
      for (const s of [-1, 1]) spike(c, jawAt.clone().addScaledVector(side, s * r * 0.3).addScaledVector(f, r * 0.35), UP, r * 0.28, r * 0.06, col('#efe6cf'));
      break;
    case 'beak':
      spike(c, at.clone().addScaledVector(f, r * 0.75), f.clone().addScaledVector(UP, -0.3), r * 0.9, r * 0.28, c.dark);
      break;
    case 'tusks':
      for (const s of [-1, 1]) spike(c, jawAt.clone().addScaledVector(side, s * r * 0.45), f.clone().addScaledVector(UP, 0.9).addScaledVector(side, s * 0.3), r * 0.8, r * 0.09, col('#efe6cf'));
      break;
    case 'mandibles':
      for (const s of [-1, 1]) {
        const a = jawAt.clone().addScaledVector(side, s * r * 0.4);
        const mid = a.clone().addScaledVector(f, r * 0.6).addScaledVector(side, s * r * 0.25);
        limb(c, a, mid, r * 0.09, r * 0.07, c.dark);
        limb(c, mid, mid.clone().addScaledVector(f, r * 0.35).addScaledVector(side, -s * r * 0.35), r * 0.07, r * 0.02, c.dark);
      }
      break;
    default:
      break;
  }
  // Horns / antlers.
  const top = at.clone().addScaledVector(UP, r * 0.6);
  const hc = g.body.horns === 'none' ? 0 : g.body.hornCount;
  for (let i = 0; i < hc; i++) {
    const s = i % 2 === 0 ? -1 : 1;
    const base = top.clone().addScaledVector(side, s * r * (0.4 + Math.floor(i / 2) * 0.2)).addScaledVector(f, -r * Math.floor(i / 2) * 0.3);
    const hornCol = col('#d8cfb4').lerp(c.dark, 0.35);
    if (g.body.horns === 'straight') spike(c, base, UP.clone().addScaledVector(side, s * 0.35).addScaledVector(f, 0.2), r * 1.1, r * 0.13, hornCol);
    else if (g.body.horns === 'curved') {
      let p = base;
      let d = UP.clone().addScaledVector(side, s * 0.6);
      for (let k = 0; k < 4; k++) {
        const q = p.clone().addScaledVector(d.normalize(), r * 0.35);
        limb(c, p, q, r * 0.12 * (1 - k * 0.22), r * 0.12 * (1 - (k + 1) * 0.22) + 0.004, hornCol, 'body', 5);
        p = q;
        d = d.addScaledVector(f, -0.5).addScaledVector(UP, -0.25);
      }
    } else if (g.body.horns === 'antlers') {
      const tip = base.clone().addScaledVector(UP, r * 1.4).addScaledVector(side, s * r * 0.8).addScaledVector(f, -r * 0.3);
      limb(c, base, tip, r * 0.08, r * 0.03, hornCol, 'body', 5);
      for (let k = 1; k <= 3; k++) {
        const along = base.clone().lerp(tip, k / 4);
        limb(c, along, along.clone().addScaledVector(UP, r * 0.5).addScaledVector(f, r * 0.25 * (k % 2 ? 1 : -1)), r * 0.05, r * 0.015, hornCol, 'body', 4);
      }
    }
  }
  if (g.body.crest) for (let k = 0; k < 4; k++) spike(c, top.clone().addScaledVector(f, r * (0.3 - k * 0.25)), UP.clone().addScaledVector(f, -0.5), r * (0.55 - k * 0.08), r * 0.1, c.dark);
}

/** Spines, plates, ribs or moss along a spine from `a` to `b`. */
function covering(c: Ctx, a: THREE.Vector3, b: THREE.Vector3, width: number): void {
  const g = c.g;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = a.clone().lerp(b, t);
    switch (g.covering) {
      case 'fur':
        spike(c, p, UP.clone().add(new THREE.Vector3(c.rng.range(-0.3, 0.3), 0, -0.4)), width * 0.45, width * 0.18, c.dark);
        break;
      case 'scales':
      case 'chitin':
        c.b.box('body', trs(p.x, p.y + width * 0.05, p.z, 0, 1, 1, 1, -0.3), 0, 0, 0, width * 0.9, width * 0.12, width * 0.5, { color: c.dark.clone().lerp(c.body, 0.5) });
        break;
      case 'moss':
        mass(c, p.clone().addScaledVector(UP, width * 0.1), width * 0.45, width * 0.2, width * 0.4, col('#5a7a34'), 0.3, 'body');
        break;
      case 'bark':
        c.b.box('body', trs(p.x, p.y, p.z, c.rng.range(-0.3, 0.3)), 0, 0, 0, width * 0.25, width * 0.25, width * 0.7, { color: c.dark });
        break;
      case 'bone':
        if (i % 2 === 0) for (const s of [-1, 1]) limb(c, p, p.clone().add(new THREE.Vector3(s * width * 0.9, -width * 0.7, 0)), width * 0.07, width * 0.05, col('#efe6cf'), 'body', 4);
        break;
      case 'stone':
        c.b.box('body', trs(p.x, p.y, p.z, c.rng.range(0, 3)), 0, 0, 0, width * 0.5, width * 0.3, width * 0.5, { color: c.dark.clone().lerp(c.body, 0.6) });
        break;
      default:
        break;
    }
    if (c.has('thorns')) spike(c, p, UP.clone().add(new THREE.Vector3(c.rng.range(-0.6, 0.6), 0, c.rng.range(-0.6, 0.6))), width * 0.6, width * 0.08, col('#3a2a1a'));
    if (c.has('fungal') && i % 2 === 0) {
      const q = p.clone().add(new THREE.Vector3(c.rng.range(-width, width) * 0.5, width * 0.15, 0));
      c.b.cylinder('body', trs(q.x, q.y, q.z), 0, 0, 0, width * 0.25, 0.005, width * 0.2, 6, { color: col('#c8603a') }, { capBottom: true });
    }
    if (c.has('crystal') && i % 3 === 0) spike(c, p, UP.clone().add(new THREE.Vector3(c.rng.range(-0.5, 0.5), 0, c.rng.range(-0.5, 0.5))), width * 0.9, width * 0.14, col(c.g.glow ?? '#8fe0ff'), 'glow');
    if (c.has('frost') && i % 2 === 1) spike(c, p, UP, width * 0.4, width * 0.1, col('#dff4ff'), 'glow');
    if (c.has('ember') && i % 2 === 0) c.b.box('glow', trs(p.x, p.y + width * 0.2, p.z, c.rng.range(0, 3)), 0, 0, 0, width * 0.5, width * 0.04, width * 0.06, { color: col('#ff8a3a') });
    if (c.has('bells') && i % 2 === 1) {
      const q = p.clone().add(new THREE.Vector3(width * 0.8 * (i % 4 === 1 ? 1 : -1), -width * 0.3, 0));
      c.b.cylinder('metal', trs(q.x, q.y, q.z), 0, 0, 0, width * 0.18, width * 0.08, width * 0.22, 7, { color: col('#c8963e') }, { capTop: true });
    }
  }
}

function armour(c: Ctx, torso: THREE.Vector3, w: number, h: number, headAt: THREE.Vector3, headR: number): void {
  const steel = c.dark.clone().lerp(c.body, 0.5);
  c.b.box('metal', trs(torso.x, torso.y + h * 0.15, torso.z + w * 0.05), 0, 0, 0, w * 1.6, h * 1.0, w * 1.15, { color: steel });
  for (const s of [-1, 1]) mass(c, new THREE.Vector3(torso.x + s * w * 0.95, torso.y + h * 0.6, torso.z), w * 0.42, w * 0.3, w * 0.45, steel, 0.05, 'metal');
  // Great helm with a dark visor slit.
  c.b.cylinder('metal', trs(headAt.x, headAt.y - headR * 0.9, headAt.z), 0, 0, 0, headR * 1.05, headR * 0.95, headR * 1.9, 8, { color: steel }, { capTop: true });
  c.b.box('glow', trs(headAt.x, headAt.y + headR * 0.1, headAt.z + headR * 1.0), 0, 0, 0, headR * 1.2, headR * 0.12, headR * 0.1, { color: c.eye.clone().multiplyScalar(0.8) });
}

export function buildCreature(b: MeshBuilder, g: CreatureGenome): { height: number } {
  const rng = new Rng(g.seed ^ 0xbea57);
  const S = g.size;
  const vis = new Set(g.mutations.map((m) => m.visual).filter(Boolean) as string[]);
  const shadow = vis.has('shadow');
  const c: Ctx = {
    b,
    g,
    rng,
    S,
    body: col(g.palette.body).multiplyScalar(shadow ? 0.45 : 1),
    belly: col(g.palette.belly).multiplyScalar(shadow ? 0.5 : 1),
    dark: col(g.palette.dark),
    eye: col(g.palette.eye),
    skin: vis.has('hollow') || g.plan === 'wisp' ? 'ghost' : 'body',
    has: (v) => vis.has(v),
  };
  const bp = g.body;
  const fwd = new THREE.Vector3(0, 0, 1);
  let height = S;

  const humanoid = (brute: boolean): void => {
    const legH = S * (brute ? 0.38 : 0.47) * bp.legLength;
    const torsoH = S * (brute ? 0.34 : 0.27) * bp.torsoLength;
    const torsoW = S * (brute ? 0.22 : 0.15) * bp.torsoWidth;
    const hipY = legH;
    const torso = new THREE.Vector3(0, hipY + torsoH * 0.55, -bp.hunch * torsoH * (brute ? 0.6 : 0.3));
    for (const s of [-1, 1]) {
      const hip = new THREE.Vector3(s * torsoW * 0.55, hipY, 0);
      const knee = new THREE.Vector3(s * torsoW * 0.6, hipY * 0.5, S * 0.05);
      const foot = new THREE.Vector3(s * torsoW * 0.65, 0.05 * S, 0);
      jointed(c, hip, knee, foot, torsoW * (brute ? 0.42 : 0.3), c.body);
      mass(c, foot.clone().add(new THREE.Vector3(0, 0, S * 0.04)), torsoW * 0.32, S * 0.04, torsoW * 0.5, c.dark, 0.1);
    }
    mass(c, torso, torsoW, torsoH * 0.62, torsoW * 0.75, c.body, 0.16, c.skin, bp.hunch * 0.5);
    const shoulderY = torso.y + torsoH * 0.45;
    const headR = S * (brute ? 0.07 : 0.075) * bp.head;
    const headAt = new THREE.Vector3(0, shoulderY + headR * 1.1 - bp.hunch * headR * (brute ? 1.6 : 0.5), torso.z + bp.hunch * torsoH * 0.8 + headR * 0.3);
    head(c, headAt, headR, fwd);
    if (vis.has('twinHead')) head(c, headAt.clone().add(new THREE.Vector3(headR * 2.1, -headR * 0.3, 0)), headR * 0.85, new THREE.Vector3(0.4, 0, 1));
    const armL = S * (brute ? 0.5 : 0.36) * bp.armLength;
    for (const s of [-1, 1]) {
      const sh = new THREE.Vector3(s * torsoW * 1.1, shoulderY, torso.z);
      const elbow = sh.clone().add(new THREE.Vector3(s * torsoW * 0.35, -armL * 0.5, armL * 0.15));
      const hand = sh.clone().add(new THREE.Vector3(s * torsoW * 0.2, -armL, armL * 0.35));
      jointed(c, sh, elbow, hand, torsoW * (brute ? 0.36 : 0.22), c.body);
      mass(c, hand, torsoW * 0.28, torsoW * 0.28, torsoW * 0.3, c.dark, 0.2);
      if (s > 0 && g.weapon) {
        // The weapon is built at real-world scale (1 unit = 1 m) and held in the right hand.
        const wb = new MeshBuilder();
        buildWeapon(wb, g.weapon);
        const scale = brute ? S / 2.4 : 1;
        const wm = trs(hand.x, hand.y, hand.z, 0, scale, scale, scale, 1.25, 0);
        for (const [key, geo] of wb.build()) {
          b.geometry(key === 'steel' ? 'metal' : key === 'glow' ? 'glow' : 'body', geo, wm, null);
          geo.dispose();
        }
      }
    }
    if (g.covering === 'armour') armour(c, torso, torsoW, torsoH, headAt, headR);
    else covering(c, new THREE.Vector3(0, shoulderY, torso.z - torsoW * 0.5), new THREE.Vector3(0, hipY + torsoH * 0.1, torso.z - torsoW * 0.6), torsoW);
    height = headAt.y + headR;
  };

  switch (g.plan) {
    case 'biped':
      humanoid(false);
      break;
    case 'brute':
      humanoid(true);
      break;
    case 'quadruped': {
      const legH = S * 0.34 * bp.legLength;
      const len = S * 0.62 * bp.torsoLength;
      const w = S * 0.21 * bp.torsoWidth;
      const torso = new THREE.Vector3(0, legH + w * 0.6, 0);
      mass(c, torso, w, w * 0.95, len * 0.55, c.body, 0.15);
      const pairs = bp.legs / 2;
      for (let i = 0; i < pairs; i++) {
        const z = len * 0.42 - (i / Math.max(1, pairs - 1)) * len * 0.84;
        for (const s of [-1, 1]) {
          const hip = new THREE.Vector3(s * w * 0.6, legH + w * 0.2, z);
          const knee = new THREE.Vector3(s * w * 0.7, legH * 0.5, z + (i === 0 ? w * 0.3 : -w * 0.3));
          jointed(c, hip, knee, new THREE.Vector3(s * w * 0.7, 0.03 * S, z), w * 0.36, c.body);
          mass(c, new THREE.Vector3(s * w * 0.7, 0.05 * S, z + w * 0.12), w * 0.2, S * 0.04, w * 0.28, c.dark, 0.1);
        }
      }
      const neckEnd = new THREE.Vector3(0, legH + w * (1.2 + bp.neck), len * 0.62 + w * 0.4);
      limb(c, new THREE.Vector3(0, legH + w * 0.7, len * 0.4), neckEnd, w * 0.55, w * 0.42, c.body);
      const headR = w * 0.62 * bp.head;
      const headAt = neckEnd.clone().add(new THREE.Vector3(0, headR * 0.2, headR * 0.6));
      head(c, headAt, headR, fwd);
      if (vis.has('twinHead')) head(c, headAt.clone().add(new THREE.Vector3(headR * 1.6, -headR * 0.2, -headR * 0.4)), headR * 0.9, new THREE.Vector3(0.4, 0, 1));
      if (bp.tail > 0.05) limb(c, new THREE.Vector3(0, legH + w * 0.8, -len * 0.5), new THREE.Vector3(0, legH + w * 0.2, -len * (0.55 + bp.tail * 0.5)), w * 0.22, w * 0.05, c.body);
      covering(c, new THREE.Vector3(0, legH + w * 1.45, len * 0.4), new THREE.Vector3(0, legH + w * 1.35, -len * 0.45), w);
      height = headAt.y + headR;
      break;
    }
    case 'crawler': {
      const w = S * 0.22 * bp.torsoWidth;
      const y = S * 0.32;
      const thorax = new THREE.Vector3(0, y, w * 0.6);
      const abdomen = new THREE.Vector3(0, y + w * 0.2, -w * 1.3 * bp.torsoLength);
      mass(c, thorax, w * 0.75, w * 0.55, w * 0.8, c.body, 0.12);
      mass(c, abdomen, w * 1.15, w * 0.95, w * 1.35 * bp.torsoLength, c.body, 0.18);
      const pairs = bp.legs / 2;
      for (let i = 0; i < pairs; i++) {
        const a = -0.9 + (i / Math.max(1, pairs - 1)) * 1.8;
        for (const s of [-1, 1]) {
          const hip = thorax.clone().add(new THREE.Vector3(s * w * 0.6, 0, Math.sin(a) * w * 0.4));
          const out = new THREE.Vector3(s * Math.cos(a * 0.6), 0, Math.sin(a));
          const knee = hip.clone().addScaledVector(out, S * 0.4 * bp.legLength).add(new THREE.Vector3(0, S * 0.25, 0));
          const foot = hip.clone().addScaledVector(out, S * 0.75 * bp.legLength).setY(0.02);
          jointed(c, hip, knee, foot, w * 0.13, c.dark);
        }
      }
      head(c, thorax.clone().add(new THREE.Vector3(0, w * 0.05, w * 0.85)), w * 0.45 * bp.head, fwd);
      covering(c, abdomen.clone().add(new THREE.Vector3(0, w * 0.9, w)), abdomen.clone().add(new THREE.Vector3(0, w * 0.6, -w)), w * 0.8);
      height = abdomen.y + w;
      break;
    }
    case 'serpent': {
      const r = S * 0.15 * bp.torsoWidth;
      const segs = 12;
      let prev: THREE.Vector3 | null = null;
      const L = S * 2.1 * bp.torsoLength;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const rise = t > 0.6 ? Math.pow((t - 0.6) / 0.4, 1.2) * S * 1.05 : 0;
        const p = new THREE.Vector3(Math.sin(t * Math.PI * 2.2) * S * 0.45 * (1 - t * 0.6), r * 0.9 + rise, -L * 0.5 + t * L * (t > 0.65 ? 0.85 : 1));
        if (prev) limb(c, prev, p, r * (0.4 + t * 0.6), r * (0.4 + Math.min(1, t + 1 / segs) * 0.6), c.body, c.skin, 7);
        mass(c, p, r * (0.45 + t * 0.6), r * (0.45 + t * 0.6), r * (0.45 + t * 0.6), c.body, 0.05);
        prev = p;
      }
      const headAt = prev!.clone().add(new THREE.Vector3(0, r * 0.4, r * 1.4));
      head(c, headAt, r * 1.6 * bp.head, fwd);
      if (bp.crest) for (const s of [-1, 1]) mass(c, headAt.clone().add(new THREE.Vector3(s * r * 2, -r * 1.5, -r)), r * 0.25, r * 2, r * 1.4, c.dark, 0.1);
      covering(c, new THREE.Vector3(0, r * 1.8, -L * 0.4), new THREE.Vector3(0, r * 1.8, L * 0.2), r * 1.4);
      height = headAt.y + r * 1.6;
      break;
    }
    case 'wisp': {
      const coreY = S * 0.85;
      const r = S * 0.17;
      mass(c, new THREE.Vector3(0, coreY, 0), r, r * 1.2, r, c.body, 0.25, 'ghost');
      // Hood and trailing veils.
      c.b.cylinder('ghost', trs(0, coreY - r * 0.2, 0), 0, 0, 0, r * 1.3, r * 0.2, r * 2.4, 9, { color: c.dark.clone().lerp(c.body, 0.4) }, { flat: true });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const top = new THREE.Vector3(Math.cos(a) * r * 0.9, coreY - r * 0.6, Math.sin(a) * r * 0.9);
        const bottom = new THREE.Vector3(Math.cos(a) * r * 1.4, S * rng.range(0.1, 0.3), Math.sin(a) * r * 1.4);
        limb(c, top, bottom, r * 0.22, 0.01, c.body, 'ghost', 4);
      }
      for (let i = 0; i < bp.arms; i++) {
        const s = i % 2 === 0 ? 1 : -1;
        limb(c, new THREE.Vector3(s * r * 0.9, coreY, r * 0.2), new THREE.Vector3(s * r * 2, coreY - r * 1.5, r * 1.4), r * 0.15, r * 0.04, c.body, 'ghost', 5);
      }
      for (let i = 0; i < Math.max(2, bp.eyes); i++) c.b.box('glow', trs((i - (bp.eyes - 1) / 2) * r * 0.35, coreY + r * 0.3, r * 0.95), 0, 0, 0, r * 0.18, r * 0.18, r * 0.1, { color: c.eye });
      c.b.box('glow', trs(0, coreY, 0), 0, 0, 0, r * 0.5, r * 0.5, r * 0.5, { color: c.eye.clone().multiplyScalar(0.7) });
      height = coreY + r * 1.3;
      break;
    }
    case 'thornling': {
      const H = S;
      const vines = 5 + rng.int(0, 3);
      for (let i = 0; i < vines; i++) {
        const a = (i / vines) * Math.PI * 2;
        let p = new THREE.Vector3(Math.cos(a) * S * 0.18, 0, Math.sin(a) * S * 0.18);
        for (let k = 0; k < 4; k++) {
          const q = new THREE.Vector3(Math.cos(a + k * 0.9) * S * 0.12 * (1 - k * 0.15), (k + 1) * H * 0.2, Math.sin(a + k * 0.9) * S * 0.12 * (1 - k * 0.15));
          limb(c, p, q, S * 0.05 * (1 - k * 0.15), S * 0.04 * (1 - k * 0.2), c.body, 'body', 5);
          spike(c, q, new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)), S * 0.12, S * 0.02, col('#2e2218'));
          p = q;
        }
      }
      for (let i = 0; i < bp.arms; i++) {
        const a = (i / bp.arms) * Math.PI * 1.4 - 0.7;
        const sh = new THREE.Vector3(Math.sin(a) * S * 0.18, H * 0.7, Math.cos(a) * S * 0.1);
        const tip = sh.clone().add(new THREE.Vector3(Math.sin(a) * S * 0.5 * bp.armLength, -H * 0.15, S * 0.3));
        limb(c, sh, tip, S * 0.04, S * 0.01, c.body, 'body', 5);
        for (let k = 1; k < 4; k++) spike(c, sh.clone().lerp(tip, k / 4), new THREE.Vector3(0, 1, 0.3), S * 0.08, S * 0.015, col('#2e2218'));
      }
      head(c, new THREE.Vector3(0, H * 0.9, S * 0.05), S * 0.13 * bp.head, fwd);
      if (vis.has('fungal') || g.covering === 'moss') mass(c, new THREE.Vector3(0, H * 0.55, -S * 0.1), S * 0.2, S * 0.12, S * 0.15, col('#5a7a34'), 0.3, 'body');
      covering(c, new THREE.Vector3(0, H * 0.75, -S * 0.1), new THREE.Vector3(0, H * 0.3, -S * 0.15), S * 0.15);
      height = H * 1.05;
      break;
    }
    case 'construct': {
      const legH = S * 0.35;
      const w = S * 0.22 * bp.torsoWidth;
      const torsoH = S * 0.38;
      const stone = c.body;
      for (let i = 0; i < bp.legs; i++) {
        const x = bp.legs === 2 ? (i === 0 ? -w * 0.6 : w * 0.6) : (i % 2 === 0 ? -w * 0.7 : w * 0.7);
        const z = bp.legs === 2 ? 0 : i < 2 ? w * 0.5 : -w * 0.5;
        c.b.box('body', trs(x, legH / 2, z), 0, 0, 0, w * 0.5, legH, w * 0.55, { color: stone.clone().multiplyScalar(0.85), aoBottom: 0.3 });
      }
      c.b.box('body', trs(0, legH + torsoH / 2, 0, 0, 1, 1, 1, bp.hunch * 0.3), 0, 0, 0, w * 2, torsoH, w * 1.3, { color: stone });
      c.b.box('body', trs(0, legH + torsoH * 0.95, 0), 0, 0, 0, w * 2.4, torsoH * 0.25, w * 1.5, { color: stone.clone().lerp(c.dark, 0.3) });
      const headAt = new THREE.Vector3(0, legH + torsoH + S * 0.08, w * 0.2);
      c.b.box('body', trs(headAt.x, headAt.y, headAt.z), 0, 0, 0, w * 0.75, S * 0.14, w * 0.7, { color: stone });
      for (let i = 0; i < bp.eyes; i++) c.b.box('glow', trs((i - (bp.eyes - 1) / 2) * w * 0.3, headAt.y, headAt.z + w * 0.36), 0, 0, 0, w * 0.16, w * 0.08, w * 0.05, { color: c.eye });
      for (const s of [-1, 1]) {
        const sh = new THREE.Vector3(s * w * 1.25, legH + torsoH * 0.85, 0);
        c.b.box('body', trs(sh.x, sh.y - S * 0.17 * bp.armLength, sh.z + w * 0.1), 0, 0, 0, w * 0.55, S * 0.36 * bp.armLength, w * 0.55, { color: stone.clone().multiplyScalar(0.92) });
        c.b.box('body', trs(sh.x, sh.y - S * 0.38 * bp.armLength, sh.z + w * 0.2), 0, 0, 0, w * 0.75, w * 0.6, w * 0.75, { color: c.dark.clone().lerp(stone, 0.5) });
      }
      // Rune seams.
      for (let i = 0; i < 4; i++) c.b.box('glow', trs(rng.range(-w * 0.8, w * 0.8), legH + rng.range(0.1, 0.9) * torsoH, w * 0.66), 0, 0, 0, w * rng.range(0.2, 0.5), w * 0.04, w * 0.02, { color: c.eye.clone().multiplyScalar(0.8) });
      covering(c, new THREE.Vector3(0, legH + torsoH * 1.15, -w * 0.3), new THREE.Vector3(0, legH + torsoH * 0.6, -w * 0.6), w);
      height = headAt.y + S * 0.07;
      break;
    }
  }
  return { height };
}
