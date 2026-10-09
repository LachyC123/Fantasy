/**
 * Builds a weapon mesh from a WeaponGenome. The hand grips the origin; the
 * striking end points along +Y. Blades are extruded from a 2D outline (curve,
 * taper, tip style, notches, serrations) with bevelled edges; heads, guards,
 * pommels and hafts are assembled from parametric parts. Material keys:
 * 'steel' (metal), 'leather' (grip, haft) and 'glow' (enchantment runes).
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { MeshBuilder, col, trs } from './geo';
import type { WeaponGenome } from '../gameplay/weapons';

const WOOD = '#6a4a30';

function outlineBlade(g: WeaponGenome, len: number, width: number, rng: Rng): THREE.Shape {
  const s = g.shape;
  const n = 14;
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  const notchAt = Array.from({ length: s.notches }, () => ({ t: rng.range(0.15, 0.85), side: rng.chance(0.5) ? 1 : -1, d: rng.range(0.3, 0.6) }));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = t * len;
    const cx = s.curve * len * t * t;
    let w = width * (1 - s.taper * 0.6 * t);
    // Tip shaping over the last part of the blade.
    const tipStart = s.tip === 'round' ? 0.92 : s.tip === 'leaf' ? 0.55 : s.tip === 'spear' ? 0.78 : 0.84;
    if (t > tipStart) {
      const k = (t - tipStart) / (1 - tipStart);
      if (s.tip === 'round') w *= Math.sqrt(Math.max(0, 1 - k * k));
      else if (s.tip === 'leaf') w *= Math.max(0, 1.25 * Math.sin((1 - k) * Math.PI * 0.55));
      else w *= 1 - k;
    } else if (s.tip === 'leaf') {
      w *= 0.75 + 0.5 * (t / tipStart);
    }
    let wl = w;
    let wr = w;
    if (s.tip === 'clip' && t > 0.7) wl *= Math.max(0, 1 - (t - 0.7) / 0.3) * 0.9; // back edge clipped
    if (s.serrated && i % 2 === 1 && t < 0.8) wr *= 0.82;
    for (const no of notchAt) {
      if (Math.abs(t - no.t) < 0.035) {
        if (no.side > 0) wr *= 1 - no.d;
        else wl *= 1 - no.d;
      }
    }
    left.push(new THREE.Vector2(cx - wl, y));
    right.push(new THREE.Vector2(cx + wr, y));
  }
  const shape = new THREE.Shape();
  shape.moveTo(left[0]!.x, left[0]!.y);
  for (let i = 1; i < left.length; i++) shape.lineTo(left[i]!.x, left[i]!.y);
  for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i]!.x, right[i]!.y);
  shape.closePath();
  return shape;
}

/** Extrude a flat outline into a bevelled metal plate centred on z = 0. */
function plate(b: MeshBuilder, shape: THREE.Shape, thick: number, bevel: number, m: THREE.Matrix4, metal: THREE.Color, edge: THREE.Color): void {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.9, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  geo.translate(0, 0, -thick / 2);
  b.geometry('steel', geo, m, (_p, n) => (Math.abs(n.z) > 0.92 ? metal : edge));
  geo.dispose();
}

function guard(b: MeshBuilder, g: WeaponGenome, metal: THREE.Color, accent: THREE.Color): void {
  const s = g.shape;
  const span = s.guardSpan;
  const dark = col(g.material.dark);
  switch (s.guard) {
    case 'none':
      b.box('steel', new THREE.Matrix4(), 0, 0, 0, 0.034, 0.012, 0.024, { color: dark });
      return;
    case 'disc':
      b.cylinder('steel', trs(0, 0, 0, 0, 1, 1, 1, Math.PI / 2, 0), 0, -0.006, 0, span * 0.32, span * 0.32, 0.012, 10, { color: metal }, { capTop: true, capBottom: true, flat: true });
      return;
    case 'ring':
      b.box('steel', new THREE.Matrix4(), 0, 0, 0, span, 0.014, 0.02, { color: metal });
      b.cylinder('steel', trs(span * 0.18, -0.03, 0, 0, 1, 1, 1, Math.PI / 2, 0), 0, -0.004, 0, 0.035, 0.035, 0.008, 9, { color: accent }, { flat: true });
      return;
  }
  const segs = 7;
  const lift = s.guard === 'upswept' ? 0.012 : s.guard === 'downswept' ? -0.016 : s.guard === 'winged' ? 0.03 : 0;
  for (let k = -3; k <= 3; k++) {
    const x = (k / 3) * (span / 2);
    const y = lift * (k / 3) * (k / 3);
    const slope = (2 * lift * k) / 9 / (span / 2 / 3 || 1) / 3;
    const th = 0.016 - Math.abs(k) * 0.0012;
    b.box('steel', trs(x, y, 0, 0, 1, 1, 1, 0, Math.atan(slope)), 0, 0, 0, span / segs + 0.003, th, 0.022 - Math.abs(k) * 0.001, { color: k === 0 ? metal.clone().lerp(accent, 0.3) : metal });
  }
  for (const sd of [-1, 1]) {
    const fin = new THREE.IcosahedronGeometry(s.guard === 'winged' ? 0.018 : 0.012, 0);
    b.geometry('steel', fin, trs((sd * span) / 2, lift + 0.004, 0), accent);
    fin.dispose();
  }
  b.box('steel', trs(0, 0.018, 0, 0, 1, 1, 1, 0, Math.PI / 4), 0, 0, 0, 0.02, 0.02, 0.026, { color: metal });
}

function pommel(b: MeshBuilder, g: WeaponGenome, y: number, metal: THREE.Color, accent: THREE.Color): void {
  switch (g.shape.pommel) {
    case 'none':
      return;
    case 'wheel':
      b.cylinder('steel', trs(0, y, 0, 0, 1, 1, 1, Math.PI / 2, 0), 0, -0.012, 0, 0.03, 0.03, 0.024, 8, { color: metal.clone().lerp(accent, 0.4) }, { capTop: true, capBottom: true, flat: true });
      return;
    case 'sphere': {
      const s = new THREE.IcosahedronGeometry(0.026, 1);
      b.geometry('steel', s, trs(0, y - 0.01, 0), metal.clone().lerp(accent, 0.3));
      s.dispose();
      return;
    }
    case 'stopper':
      b.cylinder('steel', trs(0, y - 0.04, 0), 0, 0, 0, 0.022, 0.03, 0.04, 8, { color: accent }, { capBottom: true, flat: true });
      return;
    case 'ring':
      b.cylinder('steel', trs(0, y - 0.03, 0, 0, 1, 1, 1, 0, Math.PI / 2), 0, -0.005, 0, 0.03, 0.03, 0.01, 10, { color: accent }, { flat: true });
      return;
    case 'spike':
      b.cylinder('steel', trs(0, y, 0, 0, 1, 1, 1, Math.PI, 0), 0, 0, 0, 0.018, 0.001, 0.07, 6, { color: metal }, { flat: true });
  }
}

function haft(b: MeshBuilder, g: WeaponGenome, below: number, above: number, metal: THREE.Color): void {
  const wood = col(WOOD).multiplyScalar(0.8 + (g.seed % 7) * 0.05);
  b.cylinder('leather', new THREE.Matrix4(), 0, -below, 0, 0.017, 0.015, below + above, 7, { color: wood });
  // Leather wrap where the hand sits, metal bands and a butt cap.
  b.cylinder('leather', new THREE.Matrix4(), 0, -0.13, 0, 0.0185, 0.0185, 0.17, 7, { color: col(g.grip) });
  for (const yb of [above * 0.35, above * 0.7]) b.cylinder('steel', new THREE.Matrix4(), 0, yb, 0, 0.0195, 0.0195, 0.02, 7, { color: metal }, { flat: true });
  b.cylinder('steel', new THREE.Matrix4(), 0, -below - 0.02, 0, 0.02, 0.02, 0.03, 7, { color: metal }, { capBottom: true, flat: true });
}

function runes(b: MeshBuilder, glow: THREE.Color, len: number, rng: Rng, curve: number, y0 = 0.03): void {
  const n = Math.max(3, Math.floor(len / 0.08));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (t > 0.8) break;
    const y = y0 + t * len;
    const x = curve * len * t * t;
    b.box('glow', trs(x, y, 0, 0, 1, 1, 1, 0, rng.range(-0.6, 0.6)), 0, 0, 0, 0.006, rng.range(0.012, 0.022), 0.0125, { color: glow });
  }
}

/** Approximate length from the hand to the tip (for view-model posing). */
export function weaponLength(g: WeaponGenome): number {
  if (g.family === 'blade') return g.shape.bladeLength + 0.03;
  return g.shape.gripLength + 0.1;
}

export function buildWeapon(b: MeshBuilder, g: WeaponGenome): void {
  const rng = new Rng(g.seed ^ 0x5eed);
  const s = g.shape;
  const metal = col(g.material.metal);
  const edge = col(g.material.edge);
  const dark = col(g.material.dark);
  const accent = col(g.accent);
  const rust = g.condition === 'rusted' || g.condition === 'ruined';
  if (rust && g.material.id !== 'bone') metal.lerp(col('#8a5a3a'), g.condition === 'ruined' ? 0.55 : 0.35);
  const glow = g.glow ? col(g.glow) : null;

  if (g.family === 'blade') {
    const shape = outlineBlade(g, s.bladeLength, s.bladeWidth, rng);
    const bm = trs(0, 0.03, 0);
    plate(b, shape, 0.003, Math.min(0.01, s.bladeWidth * 0.3), bm, metal, edge);
    if (s.fuller) {
      for (const z of [-1, 1]) {
        const fl = s.bladeLength * 0.62;
        const n = 6;
        for (let i = 0; i < n; i++) {
          const t0 = (i + 0.5) / n;
          const y = 0.06 + t0 * fl;
          const tt = (y - 0.03) / s.bladeLength;
          b.box('steel', trs(s.curve * s.bladeLength * tt * tt, y, z * 0.0047), 0, 0, 0, 0.008, fl / n + 0.002, 0.001, { color: dark });
        }
      }
    }
    if (glow) runes(b, glow, s.bladeLength, rng, s.curve);
    guard(b, g, metal.clone().lerp(dark, 0.3), accent);
    // Grip with wrap ridges and pommel.
    const gl = s.gripLength;
    b.cylinder('leather', new THREE.Matrix4(), 0, -gl, 0, 0.016, 0.018, gl, 7, { color: col(g.grip).multiplyScalar(0.8) });
    const wraps = Math.floor(gl / 0.028);
    for (let i = 0; i < wraps; i++) b.cylinder('leather', new THREE.Matrix4(), 0, -gl + 0.01 + i * 0.028, 0, 0.0185, 0.0185, 0.007, 7, { color: col(g.grip).lerp(col('#ffffff'), 0.25) }, { flat: true });
    pommel(b, g, -gl - 0.015, metal, accent);
    return;
  }

  // Hafted weapons: the hand is near the butt; the head sits at the top.
  const top = s.gripLength;
  haft(b, g, 0.12, top, metal.clone().lerp(dark, 0.4));
  const hs = s.headSize;
  switch (s.head) {
    case 'bearded':
    case 'crescent':
    case 'double': {
      const sides = s.head === 'double' ? [-1, 1] : [1];
      for (const sd of sides) {
        const shp = new THREE.Shape();
        const w = 0.13 * hs;
        const h = (s.head === 'bearded' ? 0.15 : 0.19) * hs;
        shp.moveTo(0.012, -0.03);
        shp.lineTo(0.012, 0.03);
        if (s.head === 'bearded') {
          shp.quadraticCurveTo(w * 0.6, 0.04, w, 0.05);
          shp.lineTo(w * 1.02, -h * 0.75);
          shp.quadraticCurveTo(w * 0.5, -h * 0.45, 0.012, -0.03);
        } else {
          shp.quadraticCurveTo(w * 0.5, 0.04, w * 0.85, h * 0.55);
          shp.quadraticCurveTo(w * 1.15, 0, w * 0.85, -h * 0.55);
          shp.quadraticCurveTo(w * 0.5, -0.04, 0.012, -0.03);
        }
        plate(b, shp, 0.008, 0.006, trs(0, top - 0.06, 0, sd > 0 ? 0 : Math.PI), metal, edge);
      }
      b.box('steel', new THREE.Matrix4(), 0, top - 0.06, 0, 0.034, 0.08, 0.04, { color: dark });
      if (s.head !== 'double') b.cylinder('steel', trs(-0.02, top - 0.06, 0, 0, 1, 1, 1, 0, Math.PI / 2), 0, 0, 0, 0.016, 0.004, 0.04, 6, { color: dark }, { flat: true });
      if (glow) runes(b, glow, 0.1, rng, 0, top - 0.11);
      break;
    }
    case 'flanged':
    case 'spiked': {
      const ball = new THREE.IcosahedronGeometry(0.045 * hs, 1);
      b.geometry('steel', ball, trs(0, top - 0.02, 0), metal);
      ball.dispose();
      if (s.head === 'flanged') {
        for (let i = 0; i < s.flanges; i++) {
          const a = (i / s.flanges) * Math.PI * 2;
          b.box('steel', trs(Math.cos(a) * 0.038 * hs, top - 0.02, Math.sin(a) * 0.038 * hs, -a), 0, 0, 0, 0.012, 0.11 * hs, 0.05 * hs, { color: edge });
        }
      } else {
        const dirs = [new THREE.Vector3(0, 1, 0), ...Array.from({ length: s.flanges }, (_, i) => new THREE.Vector3(Math.cos((i / s.flanges) * 6.283), rng.range(-0.4, 0.5), Math.sin((i / s.flanges) * 6.283)).normalize())];
        for (const d of dirs) {
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(0, top - 0.02, 0).addScaledVector(d, 0.04 * hs), q, new THREE.Vector3(1, 1, 1));
          b.cylinder('steel', m, 0, 0, 0, 0.012, 0.001, 0.05 * hs, 5, { color: edge }, { flat: true });
        }
      }
      if (glow) runes(b, glow, 0.08, rng, 0, top - 0.09);
      break;
    }
    case 'hammer': {
      b.box('steel', new THREE.Matrix4(), 0.02, top - 0.05, 0, 0.16 * hs, 0.07 * hs, 0.07 * hs, { color: metal });
      b.box('steel', new THREE.Matrix4(), 0.105 * hs, top - 0.05, 0, 0.02, 0.085 * hs, 0.085 * hs, { color: edge });
      b.cylinder('steel', trs(-0.07 * hs, top - 0.05, 0, 0, 1, 1, 1, 0, Math.PI / 2), 0, 0, 0, 0.03, 0.002, 0.12 * hs, 5, { color: dark }, { flat: true });
      b.cylinder('steel', trs(0, top, 0), 0, 0, 0, 0.015, 0.002, 0.08, 5, { color: edge }, { flat: true });
      if (glow) runes(b, glow, 0.08, rng, 0, top - 0.06);
      break;
    }
    case 'leaf':
    case 'blade': {
      const len = s.bladeLength;
      const shape = outlineBlade(g, len, s.bladeWidth, rng);
      plate(b, shape, 0.003, Math.min(0.009, s.bladeWidth * 0.3), trs(0, top, 0), metal, edge);
      b.cylinder('steel', new THREE.Matrix4(), 0, top - 0.06, 0, 0.02, 0.016, 0.07, 7, { color: dark }); // socket
      if (glow) runes(b, glow, len, rng, s.curve, top);
      break;
    }
    default:
      break;
  }
}
