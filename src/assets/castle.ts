/**
 * Gothic castle construction from a CastlePlan: battered foundation ring,
 * crenellated curtain walls, round/square towers with machicolations and
 * spires, a gatehouse, a keep with corner turrets and a cathedral hall with
 * buttresses, pinnacles and a soaring crossing spire — the skyline of
 * reference A. Returns colliders matching the solid parts.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { MeshBuilder, col, trs } from './geo';
import type { CastlePlan, CastleTower } from '../world/types';
import type { BoxCollider } from './buildings';

export interface CastleResult {
  boxes: BoxCollider[];
  circles: { x: number; z: number; r: number; y0: number; y1: number }[];
  /** Points where banners fly / birds circle. */
  spireTips: THREE.Vector3[];
}

const STONE = col('#ffffff');

function slit(b: MeshBuilder, m: THREE.Matrix4, x: number, y: number, z: number, yaw: number, w: number, h: number, gothic: boolean): void {
  const wm = m.clone().multiply(trs(x, y, z, yaw));
  b.box('window', wm, 0, 0, 0, w, h, 0.3, { color: col('#ffffff') });
  if (gothic) {
    // Pointed arch head: two leaning blocks meeting at an apex.
    for (const s of [-1, 1]) b.box('window', wm.clone().multiply(trs(s * w * 0.22, h / 2 + w * 0.22, 0, 0, 1, 1, 1, 0, -s * 0.75)), 0, 0, 0, w * 0.62, w * 0.3, 0.3, { color: col('#ffffff') });
    b.box('castleStone', wm, 0, -h / 2 - 0.2, 0.15, w + 0.5, 0.35, 0.4, { color: STONE });
  }
}

function spire(b: MeshBuilder, m: THREE.Matrix4, x: number, y: number, z: number, r: number, h: number, sides: number, tips: THREE.Vector3[]): void {
  b.cylinder('castleRoof', m, x, y, z, r, 0.02, h, sides, { color: col('#ffffff') }, { flat: true, capBottom: true });
  b.cylinder('metal', m, x, y + h - 0.2, z, 0.12, 0.02, Math.max(1.5, h * 0.12), 4, { color: col('#c8a050') }, { flat: true });
  tips.push(new THREE.Vector3(x, y + h, z).applyMatrix4(m));
}

function crenellate(b: MeshBuilder, m: THREE.Matrix4, x0: number, z0: number, x1: number, z1: number, y: number, thick: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.floor(len / 1.7));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    b.box('castleStone', m.clone().multiply(trs(x, y, z, yaw)), 0, 0.55, 0, thick, 1.1, len / n * 0.55, { color: STONE });
  }
}

function tower(b: MeshBuilder, m: THREE.Matrix4, t: CastleTower, baseY: number, rng: Rng, tips: THREE.Vector3[]): void {
  const sides = t.square ? 4 : 14;
  const top = baseY + t.height;
  if (t.square) {
    b.box('castleStone', m, t.x, (baseY - 14 + top) / 2, t.z, t.radius * 2, top - baseY + 14, t.radius * 2, { color: STONE, aoBottom: 0.35, aoHeight: 20 });
    // Corbelled parapet.
    b.box('castleStone', m, t.x, top + 0.4, t.z, t.radius * 2 + 1, 0.8, t.radius * 2 + 1, { color: STONE });
  } else {
    // Battered base flaring into the rock.
    b.cylinder('castleStone', m, t.x, baseY - 14, t.z, t.radius * 1.35, t.radius, 16, sides, { color: STONE, aoBottom: 0.45 }, { flat: true });
    b.cylinder('castleStone', m, t.x, baseY + 2, t.z, t.radius, t.radius, t.height - 2, sides, { color: STONE, aoBottom: 0.15 }, { flat: true });
    // Machicolation band.
    b.cylinder('castleStone', m, t.x, top - 0.2, t.z, t.radius + 0.6, t.radius + 0.6, 1.2, sides, { color: STONE }, { flat: true, capTop: true, capBottom: true });
  }
  // Slit windows up the shaft.
  const n = Math.floor(t.height / 7);
  for (let i = 1; i <= n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = t.square ? t.radius + 0.05 : t.radius + 0.05;
    slit(b, m, t.x + Math.sin(a) * r, baseY + i * 7, t.z + Math.cos(a) * r, a, 0.5, 1.8, false);
  }
  const roofBase = top + 1;
  if (t.roof === 'spire') {
    const rr = (t.radius + 0.9) * (t.square ? 1.25 : 1);
    spire(b, m, t.x, roofBase, t.z, rr, rr * rng.range(2.8, 4.2), t.square ? 4 : 10, tips);
  } else if (t.roof === 'crown') {
    const R = t.radius + 0.5;
    const k = t.square ? 4 : 10;
    for (let i = 0; i < k; i++) {
      const a0 = (i / k) * Math.PI * 2;
      const a1 = ((i + 1) / k) * Math.PI * 2;
      crenellate(b, m, t.x + Math.sin(a0) * R, t.z + Math.cos(a0) * R, t.x + Math.sin(a1) * R, t.z + Math.cos(a1) * R, roofBase - 0.2, 0.6);
    }
    // Small watch turret on the crown.
    spire(b, m, t.x, roofBase - 0.2, t.z, t.radius * 0.45, t.radius * 2.2, 8, tips);
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      spire(b, m, t.x + Math.sin(a) * t.radius * 0.8, roofBase, t.z + Math.cos(a) * t.radius * 0.8, 0.8, 5, 6, tips);
    }
  }
}

export function buildCastle(b: MeshBuilder, plan: CastlePlan): CastleResult {
  const rng = new Rng(plan.seed);
  const m = trs(plan.x, plan.plateauHeight, plan.z, plan.yaw);
  const tips: THREE.Vector3[] = [];
  const boxes: BoxCollider[] = [];
  const circles: CastleResult['circles'] = [];
  const toWorld = (lx: number, lz: number): THREE.Vector3 => new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
  const H = plan.wallHeight;
  const base = 0;

  // Curtain walls with a walkway, battlements and a battered plinth.
  const n = plan.wall.length;
  for (let i = 0; i < n; i++) {
    const a = plan.wall[i]!;
    const c = plan.wall[(i + 1) % n]!;
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const yaw = Math.atan2(c.x - a.x, c.z - a.z);
    const mx = (a.x + c.x) / 2;
    const mz = (a.z + c.z) / 2;
    const wm = m.clone().multiply(trs(mx, 0, mz, yaw));
    b.box('castleStone', wm, 0, (H - 12) / 2, 0, 3.2, H + 12, len, { color: STONE, aoBottom: 0.4, aoHeight: 16 });
    b.box('castleStone', wm, 0, -6, 0, 5.5, 12, len + 2, { color: col('#d8d0c0'), aoBottom: 0.5 });
    // Outer battlement on the side facing away from the centre.
    const outward = Math.sign((mx * Math.cos(yaw) - mz * Math.sin(yaw)) || 1);
    crenellate(b, wm, outward * 1.3, -len / 2, outward * 1.3, len / 2, H, 0.6);
    const w = toWorld(mx, mz);
    boxes.push({ x: w.x, z: w.z, yaw: yaw + plan.yaw, hw: 1.8, hd: len / 2 + 0.5, y0: plan.plateauHeight - 14, y1: plan.plateauHeight + H + 1 });
  }

  // Towers.
  for (const t of plan.towers) {
    tower(b, m, t, base, rng, tips);
    const w = toWorld(t.x, t.z);
    circles.push({ x: w.x, z: w.z, r: t.radius * (t.square ? 1.35 : 1.25), y0: plan.plateauHeight - 14, y1: plan.plateauHeight + t.height + 1 });
  }

  // Gatehouse with a deep arch and a lowered portcullis (the gate is shut).
  {
    const g = plan.wall[0]!;
    const gm = m.clone().multiply(trs(g.x, 0, g.z, 0));
    b.box('castleStone', gm, 0, (H + 6) / 2, -2, 16, H + 6, 9, { color: STONE, aoBottom: 0.3 });
    crenellate(b, gm, -8, 2.5, 8, 2.5, H + 6, 0.6);
    b.box('window', gm, 0, 3.4, 2.55, 4.4, 6.8, 0.3, { color: col('#ffffff') });
    for (const s of [-1, 1]) b.box('castleStone', gm.clone().multiply(trs(s * 1.1, 7.2, 2.6, 0, 1, 1, 1, 0, -s * 0.7)), 0, 0, 0, 3.0, 1.0, 0.5, { color: STONE });
    for (let i = -2; i <= 2; i++) b.box('metal', gm, i * 0.85, 3.3, 2.75, 0.14, 6.6, 0.14, { color: col('#3a3430') });
    for (let j = 0; j < 5; j++) b.box('metal', gm, 0, 0.8 + j * 1.3, 2.75, 4.2, 0.14, 0.14, { color: col('#3a3430') });
    // Heraldic banners either side of the arch.
    for (const s of [-1, 1]) b.box('plain', gm, s * 4.6, H - 3, 2.6, 1.6, 6, 0.1, { color: col('#7a2430') });
    const w = toWorld(g.x, g.z - 2);
    boxes.push({ x: w.x, z: w.z, yaw: plan.yaw, hw: 8.2, hd: 4.8, y0: plan.plateauHeight - 10, y1: plan.plateauHeight + H + 6 });
  }

  // Keep with corner turrets and a steep hipped roof.
  {
    const k = plan.keep;
    b.box('castleStone', m, k.x, (k.h - 4) / 2, k.z, k.w, k.h + 4, k.d, { color: STONE, aoBottom: 0.35, aoHeight: 18 });
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, 1);
      slit(b, m, k.x - k.w / 2 + k.w * (0.2 + 0.6 * a), k.h * 0.55, k.z + k.d / 2 + 0.1, 0, 1.6, 4.2, true);
    }
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) slit(b, m, k.x - k.w / 2 - 0.1, 10 + row * 11, k.z - k.d / 3 + (i * k.d) / 3, -Math.PI / 2, 1.2, 3.2, true);
    const roofH = Math.min(k.w, k.d) * 0.95;
    const hip = m.clone().multiply(trs(k.x, k.h, k.z, Math.PI / 4, 1, 1, 1));
    b.cylinder('castleRoof', hip, 0, 0, 0, Math.hypot(k.w, k.d) / 2 * 0.98, 0.3, roofH, 4, { color: col('#ffffff') }, { flat: true, capBottom: true });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const t: CastleTower = { x: k.x + sx * k.w / 2, z: k.z + sz * k.d / 2, radius: 2.6, height: k.h + 6, roof: 'spire', square: false };
        tower(b, m, t, 0, rng, tips);
      }
    const w = toWorld(k.x, k.z);
    boxes.push({ x: w.x, z: w.z, yaw: plan.yaw, hw: k.w / 2 + 2.5, hd: k.d / 2 + 2.5, y0: plan.plateauHeight - 5, y1: plan.plateauHeight + k.h + roofH });
  }

  // Cathedral hall: nave, buttresses with pinnacles, west towers and crossing spire.
  {
    const c = plan.cathedral;
    const cm = m.clone().multiply(trs(c.x, 0, c.z, c.yaw));
    const L = c.length;
    const W = c.width;
    const Hh = c.height;
    b.box('castleStone', cm, 0, (Hh - 3) / 2, 0, W, Hh + 3, L, { color: STONE, aoBottom: 0.35, aoHeight: 16 });
    // Steep roof.
    const rise = W * 0.9;
    for (const s of [-1, 1]) {
      const rm = cm.clone().multiply(trs(s * W / 4, Hh + rise / 2, 0, 0, 1, 1, 1, 0, -s * Math.atan2(rise, W / 2)));
      b.box('castleRoof', rm, 0, 0, 0, Math.hypot(W / 2, rise) + 0.6, 0.5, L + 1, { color: col('#ffffff') });
    }
    for (const s of [-1, 1]) {
      const p0 = new THREE.Vector3(-W / 2, Hh, s * L / 2).applyMatrix4(cm);
      const p1 = new THREE.Vector3(W / 2, Hh, s * L / 2).applyMatrix4(cm);
      const p2 = new THREE.Vector3(0, Hh + rise, s * L / 2).applyMatrix4(cm);
      if (s > 0) b.tri('castleStone', p0, p1, p2, [-W / 2, Hh], [W / 2, Hh], [0, Hh + rise], STONE);
      else b.tri('castleStone', p1, p0, p2, [W / 2, Hh], [-W / 2, Hh], [0, Hh + rise], STONE);
    }
    // Buttresses + pinnacles + tall lancet windows between them.
    const bays = Math.floor(L / 7);
    for (let i = 0; i <= bays; i++) {
      const z = -L / 2 + (L * i) / bays;
      for (const s of [-1, 1]) {
        b.box('castleStone', cm, s * (W / 2 + 1.2), Hh * 0.4, z, 2.4, Hh * 0.8, 1.6, { color: STONE, aoBottom: 0.3 });
        b.box('castleStone', cm, s * (W / 2 + 0.8), Hh * 0.85, z, 1.6, Hh * 0.3, 1.3, { color: STONE });
        spire(b, cm, s * (W / 2 + 0.8), Hh, z, 0.7, 4.5, 4, tips);
        if (i < bays) slit(b, cm, s * (W / 2 + 0.06), Hh * 0.55, z + L / bays / 2, s > 0 ? Math.PI / 2 : -Math.PI / 2, 2.0, Hh * 0.45, true);
      }
    }
    // West front: twin towers with spires and a rose window.
    for (const s of [-1, 1]) {
      const t: CastleTower = { x: s * (W / 2 + 1), z: L / 2 + 2, radius: 4, height: Hh * 1.55, roof: 'spire', square: true };
      tower(b, cm, t, 0, rng, tips);
    }
    b.cylinder('window', cm.clone().multiply(trs(0, Hh * 0.7, L / 2 + 0.1, 0, 1, 1, 1, Math.PI / 2, 0)), 0, 0, 0, W * 0.22, W * 0.22, 0.3, 12, { color: col('#ffffff') }, { capTop: true, flat: true });
    slit(b, cm, 0, Hh * 0.3, L / 2 + 0.1, 0, 3.2, 6, true);
    // Crossing tower and the great spire.
    const ctH = Hh * 1.75;
    const cz = -L * 0.12;
    b.box('castleStone', cm, 0, ctH / 2, cz, W * 0.62, ctH, W * 0.62, { color: STONE });
    for (const s of [-1, 1]) slit(b, cm, s * (W * 0.31 + 0.05), ctH * 0.78, cz, s > 0 ? Math.PI / 2 : -Math.PI / 2, 1.8, 7, true);
    slit(b, cm, 0, ctH * 0.78, cz + W * 0.31 + 0.05, 0, 1.8, 7, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) spire(b, cm, sx * W * 0.31, ctH, cz + sz * W * 0.31, 1.0, 9, 4, tips);
    spire(b, cm, 0, ctH, cz, W * 0.36, c.spire - ctH, 8, tips);
    const w = toWorld(c.x, c.z);
    boxes.push({ x: w.x, z: w.z, yaw: plan.yaw + c.yaw, hw: W / 2 + 2.6, hd: L / 2 + 6, y0: plan.plateauHeight - 4, y1: plan.plateauHeight + Hh + rise });
  }

  // A few inner buildings so the courtyard reads as lived in from the walls.
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(plan.plateauRadius * 0.35, plan.plateauRadius * 0.6);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (z > plan.plateauRadius * 0.4) continue;
    const c = plan.cathedral;
    if (Math.abs(x - c.x) < c.width + 8 && Math.abs(z - c.z) < c.length / 2 + 10) continue;
    if (Math.abs(x - plan.keep.x) < plan.keep.w / 2 + 8 && Math.abs(z - plan.keep.z) < plan.keep.d / 2 + 8) continue;
    const w = rng.range(8, 14);
    const d = rng.range(7, 10);
    const h = rng.range(8, 13);
    const bm = m.clone().multiply(trs(x, 0, z, a));
    b.box('castleStone', bm, 0, h / 2 - 1, 0, w, h + 2, d, { color: STONE, aoBottom: 0.3 });
    for (const s of [-1, 1]) b.box('castleRoof', bm.clone().multiply(trs(0, h + d * 0.35, s * d / 4, 0, 1, 1, 1, s * 0.95, 0)), 0, 0, 0, w + 0.6, 0.4, d * 0.72, { color: col('#ffffff') });
    const wp = toWorld(x, z);
    boxes.push({ x: wp.x, z: wp.z, yaw: plan.yaw + a, hw: w / 2 + 0.3, hd: d / 2 + 0.3, y0: plan.plateauHeight - 2, y1: plan.plateauHeight + h + d });
  }
  return { boxes, circles, spireTips: tips };
}
