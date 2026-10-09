/**
 * Building grammar: plan → foundation plinth → ground floor walls (with a
 * jettied upper storey when present) → door on the road-facing (+Z) side →
 * windows per facade bay → gable roof assembled from two slopes, gable
 * infills and a ridge cap → chimney → details (shutters, ivy, lean-to).
 * Every piece is placed in local coordinates relative to the footprint so the
 * collision box always matches what is drawn.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { MeshBuilder, col, trs } from './geo';
import type { BuildingPlan, WallStyle } from '../world/types';
import type { MaterialName } from '../rendering/materials';

export interface BoxCollider {
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hd: number;
  y0: number;
  y1: number;
}

export interface BuildingResult {
  /** World-space oriented boxes for collision. */
  colliders: BoxCollider[];
  chimneyTop: THREE.Vector3 | null;
  door: THREE.Vector3;
  /** Approximate roof ridge height above the pad. */
  height: number;
}

const FLOOR_H = 2.85;

function wallMat(style: WallStyle): MaterialName {
  return style === 'stone' ? 'stone' : style === 'plaster' ? 'plaster' : 'planks';
}

function roofMat(r: BuildingPlan['roof']): MaterialName {
  return r === 'tile' ? 'roofTile' : r === 'slate' ? 'slate' : 'thatch';
}

/** Timber frame members drawn over a plaster facade (local X-Y plane at z = face). */
function timberFrame(b: MeshBuilder, m: THREE.Matrix4, x0: number, x1: number, y0: number, y1: number, z: number, outward: number, rng: Rng, skip: [number, number][]): void {
  const beam = col('#ffffff');
  const t = 0.2;
  const depth = 0.12;
  const zc = z + outward * depth / 2;
  // Sill, mid rail, top plate.
  b.box('timber', m, (x0 + x1) / 2, y0 + t / 2, zc, x1 - x0, t, depth, { color: beam });
  b.box('timber', m, (x0 + x1) / 2, y1 - t / 2, zc, x1 - x0, t, depth, { color: beam });
  // Posts at regular bays.
  const bays = Math.max(2, Math.round((x1 - x0) / 1.6));
  for (let i = 0; i <= bays; i++) {
    const x = x0 + ((x1 - x0) * i) / bays;
    if (i > 0 && i < bays && skip.some(([s0, s1]) => x > s0 - 0.15 && x < s1 + 0.15)) continue;
    b.box('timber', m, THREE.MathUtils.clamp(x, x0 + t / 2, x1 - t / 2), (y0 + y1) / 2, zc, t, y1 - y0, depth, { color: beam });
  }
  // Diagonal braces in bays without openings.
  for (let i = 0; i < bays; i++) {
    const xa = x0 + ((x1 - x0) * i) / bays;
    const xb = x0 + ((x1 - x0) * (i + 1)) / bays;
    const mid = (xa + xb) / 2;
    if (skip.some(([s0, s1]) => mid > s0 - 0.3 && mid < s1 + 0.3)) continue;
    if (!rng.chance(0.6)) continue;
    const len = Math.hypot(xb - xa, y1 - y0);
    const ang = Math.atan2(y1 - y0, xb - xa) * (rng.chance(0.5) ? 1 : -1);
    const bm = m.clone().multiply(trs(mid, (y0 + y1) / 2, zc, 0, 1, 1, 1, 0, ang));
    b.box('timber', bm, 0, 0, 0, len, t * 0.85, depth, { color: beam });
  }
}

function windowUnit(b: MeshBuilder, m: THREE.Matrix4, x: number, y: number, z: number, outward: number, w: number, h: number, rng: Rng, glow: boolean, shutters: boolean): void {
  const frame = col('#d8c8b0');
  b.box(glow ? 'glowWindow' : 'window', m, x, y, z + outward * 0.03, w, h, 0.08, { color: col('#ffffff') });
  b.box('timber', m, x, y - h / 2 - 0.06, z + outward * 0.1, w + 0.3, 0.12, 0.2, { color: frame }); // sill
  b.box('timber', m, x, y + h / 2 + 0.06, z + outward * 0.08, w + 0.2, 0.14, 0.16, { color: frame }); // lintel
  if (shutters) {
    const sc = rng.pick([col('#5a7a5a'), col('#7a4a3a'), col('#4a5a7a'), col('#8a7050')]);
    for (const s of [-1, 1]) b.box('planks', m, x + s * (w / 2 + 0.22), y, z + outward * 0.09, 0.4, h + 0.05, 0.06, { color: sc });
  }
}

export function buildBuilding(b: MeshBuilder, plan: BuildingPlan): BuildingResult {
  const rng = new Rng(plan.seed);
  const m = trs(plan.x, plan.padHeight, plan.z, plan.yaw);
  const W = plan.width;
  const D = plan.depth;
  const floors = plan.floors;
  const wallH = FLOOR_H * floors;
  const isBarn = plan.kind === 'barn' || plan.kind === 'shed';
  const tint = (base: string, v = 0.08): THREE.Color => col(base).multiplyScalar(1 - v + rng.next() * v * 2);
  const wallCol = plan.wallStyle === 'plaster' ? tint('#ffffff', 0.06).lerp(rng.pick([col('#fff4e0'), col('#f4ead8'), col('#ffe9d2'), col('#e9eef0')]), 0.6) : tint('#ffffff');

  // Foundation plinth sinks into the ground so no building ever floats.
  b.box('stone', m, 0, -0.75, 0, W + 0.35, 1.5, D + 0.35, { color: tint('#d0c8bc'), aoBottom: 0.4 });

  // Ground floor.
  const groundStyle = plan.wallStyle;
  const upperStyle = plan.upperStyle;
  const jetty = floors > 1 && upperStyle !== 'stone' ? 0.35 : 0;
  b.box(wallMat(groundStyle), m, 0, FLOOR_H / 2, 0, W, FLOOR_H, D, { color: wallCol, aoBottom: 0.35, aoHeight: 1.2 }, 0b001111);
  if (floors > 1) {
    const upCol = upperStyle === 'plaster' ? tint('#ffffff', 0.05).lerp(col('#fff2dc'), 0.5) : wallCol;
    b.box(wallMat(upperStyle), m, 0, FLOOR_H * 1.5, 0, W, FLOOR_H, D + jetty * 2, { color: upCol }, 0b001111);
    if (jetty > 0) {
      // Jetty floor joists visible under the overhang.
      for (const s of [-1, 1]) b.box('timber', m, 0, FLOOR_H - 0.1, s * (D / 2 + jetty / 2), W, 0.2, jetty, { color: col('#ffffff') });
    }
  }

  // Door on the +Z face.
  const doorX = isBarn ? 0 : THREE.MathUtils.clamp(rng.range(-W * 0.2, W * 0.2), -W / 2 + 1.2, W / 2 - 1.2);
  const doorW = isBarn ? Math.min(3.2, W * 0.45) : 1.1;
  const doorH = isBarn ? 2.8 : 2.05;
  const fz = D / 2;
  b.box('planks', m, doorX, doorH / 2, fz + 0.04, doorW, doorH, 0.12, { color: col('#c8a888') });
  b.box('timber', m, doorX, doorH + 0.12, fz + 0.08, doorW + 0.4, 0.24, 0.2, { color: col('#ffffff') });
  for (const s of [-1, 1]) b.box('timber', m, doorX + s * (doorW / 2 + 0.1), doorH / 2, fz + 0.08, 0.2, doorH, 0.18, { color: col('#ffffff') });
  if (!isBarn) {
    b.box('metal', m, doorX + doorW * 0.32, doorH * 0.48, fz + 0.12, 0.08, 0.08, 0.06, { color: col('#2a2622') });
    // Worn step stone in front of the door.
    b.box('stone', m, doorX, 0.1, fz + 0.55, doorW + 0.6, 0.4, 0.8, { color: tint('#c8c0b0') });
  }

  // Windows per facade bay.
  const glowing = plan.inhabited;
  const bays = Math.max(1, Math.floor(W / 2.4));
  const windowsOn = (z: number, outward: number, y: number, avoidDoor: boolean): [number, number][] => {
    const spans: [number, number][] = [];
    for (let i = 0; i < bays; i++) {
      const x = -W / 2 + (W * (i + 0.5)) / bays;
      if (avoidDoor && Math.abs(x - doorX) < doorW / 2 + 0.7) continue;
      if (!rng.chance(isBarn ? 0.25 : 0.85)) continue;
      const w = isBarn ? 0.6 : 0.85;
      windowUnit(b, m, x, y, z, outward, w, isBarn ? 0.5 : 1.0, rng, glowing && rng.chance(0.6), !isBarn && rng.chance(0.45));
      spans.push([x - w / 2, x + w / 2]);
    }
    return spans;
  };
  const frontSpans = windowsOn(fz, 1, 1.55, true);
  windowsOn(-D / 2, -1, 1.55, false);
  if (floors > 1) {
    const uz = D / 2 + jetty;
    const upSpans = windowsOn(uz, 1, FLOOR_H + 1.5, false);
    windowsOn(-uz, -1, FLOOR_H + 1.5, false);
    if (upperStyle === 'plaster') {
      timberFrame(b, m, -W / 2, W / 2, FLOOR_H, wallH, uz, 1, rng, upSpans);
      timberFrame(b, m, -W / 2, W / 2, FLOOR_H, wallH, -uz, -1, rng, []);
    }
  }
  if (groundStyle === 'plaster') {
    timberFrame(b, m, -W / 2, W / 2, 0, FLOOR_H, fz, 1, rng, [...frontSpans, [doorX - doorW / 2, doorX + doorW / 2]]);
    timberFrame(b, m, -W / 2, W / 2, 0, FLOOR_H, -D / 2, -1, rng, []);
  }
  if (groundStyle === 'stone') {
    // Lighter dressed quoins on the corners.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (let k = 0; k < floors * 4; k++) {
          const y = 0.35 + k * 0.7;
          if (y > (floors > 1 && upperStyle !== 'stone' ? FLOOR_H : wallH) - 0.2) break;
          const long = k % 2 === 0;
          b.box('stone', m, sx * (W / 2 - (long ? 0.35 : 0.2)), y, sz * (D / 2 - (long ? 0.2 : 0.35)), long ? 0.75 : 0.45, 0.32, long ? 0.45 : 0.75, { color: col('#f0e8d8') });
        }
  }

  // Gable roof: ridge along local X, slopes face ±Z.
  const overhangSide = 0.45;
  const overhangGable = 0.4;
  const halfSpan = D / 2 + jetty + overhangSide;
  const rise = (D / 2 + jetty) * plan.roofPitch;
  const roofT = plan.roof === 'thatch' ? 0.45 : 0.2;
  const slopeLen = Math.hypot(halfSpan, rise + overhangSide * plan.roofPitch);
  const pitchAngle = Math.atan2(rise, D / 2 + jetty);
  const rm = roofMat(plan.roof);
  const roofCol = tint('#ffffff', 0.08);
  const eaveY = wallH - overhangSide * plan.roofPitch;
  for (const s of [-1, 1]) {
    const cz = s * (halfSpan / 2);
    const cy = eaveY + (rise + overhangSide * plan.roofPitch) / 2 + roofT / 2;
    const rmx = m.clone().multiply(trs(0, cy, cz, 0, 1, 1, 1, s * pitchAngle, 0));
    b.box(rm, rmx, 0, 0, 0, W + overhangGable * 2, roofT, slopeLen, { color: roofCol });
  }
  // Ridge cap.
  b.box(plan.roof === 'thatch' ? 'thatch' : plan.roof === 'slate' ? 'slate' : 'roofTile', m, 0, wallH + rise + roofT * 0.9, 0, W + overhangGable * 2 + 0.1, roofT * 1.3, 0.45, { color: roofCol.clone().multiplyScalar(0.8) });
  // Gable triangles at ±X ends.
  const gableMat = upperStyle === 'stone' || (floors === 1 && groundStyle === 'stone') ? 'stone' : upperStyle === 'plaster' || groundStyle === 'plaster' ? 'plaster' : 'planks';
  for (const sx of [-1, 1]) {
    const x = sx * W / 2;
    const p0 = new THREE.Vector3(x, wallH, -(D / 2 + jetty)).applyMatrix4(m);
    const p1 = new THREE.Vector3(x, wallH, D / 2 + jetty).applyMatrix4(m);
    const p2 = new THREE.Vector3(x, wallH + rise, 0).applyMatrix4(m);
    const c = wallCol;
    if (sx > 0) b.tri(gableMat, p0, p2, p1, [-(D / 2), wallH], [0, wallH + rise], [D / 2, wallH], c);
    else b.tri(gableMat, p1, p2, p0, [D / 2, wallH], [0, wallH + rise], [-(D / 2), wallH], c);
    if (gableMat === 'plaster') {
      // Gable king post.
      b.box('timber', m, sx * (W / 2 + 0.06), wallH + rise / 2, 0, 0.12, rise, 0.2, { color: col('#ffffff') });
    }
  }
  // Under-eave soffit shadows: thin dark boards so roofs never look paper-thin.
  for (const s of [-1, 1]) b.box('timber', m, 0, eaveY + 0.05, s * (D / 2 + jetty + overhangSide / 2), W + overhangGable * 2, 0.08, overhangSide, { color: col('#7a6a5a') });


  // Chimney.
  let chimneyTop: THREE.Vector3 | null = null;
  if (plan.chimney !== 'none') {
    const sx = plan.chimney === 'left' ? -1 : 1;
    const cx = sx * (W / 2 - 0.55);
    const top = wallH + rise + 1.1;
    b.box('stone', m, cx, top / 2, -0.2, 0.9, top, 0.9, { color: tint('#d8d0c4') });
    b.box('stone', m, cx, top + 0.1, -0.2, 1.1, 0.2, 1.1, { color: tint('#b8b0a4') });
    chimneyTop = new THREE.Vector3(cx, top + 0.3, -0.2).applyMatrix4(m);
  }

  // Ivy on stone walls; flower box under a front window.
  if (groundStyle === 'stone' && rng.chance(0.55)) {
    const sx = rng.chance(0.5) ? -1 : 1;
    const ivyH = rng.range(1.8, wallH * 0.95);
    b.box('foliagePlain', m, sx * (W / 2 + 0.06), ivyH / 2, rng.range(-D / 4, D / 4), 0.14, ivyH, rng.range(1.2, 2.4), { color: col('#3f6a2a'), aoBottom: 0.3 });
  }
  if (!isBarn && frontSpans.length && rng.chance(0.5)) {
    const [s0, s1] = frontSpans[0]!;
    b.box('planks', m, (s0 + s1) / 2, 0.92, fz + 0.2, s1 - s0 + 0.2, 0.22, 0.3, { color: col('#a08060') });
    for (let k = 0; k < 4; k++) b.box('plain', m, s0 + ((s1 - s0) * (k + 0.5)) / 4, 1.1, fz + 0.22, 0.18, 0.16, 0.18, { color: rng.pick([col('#d84a4a'), col('#f2d24a'), col('#f4f0e6'), col('#9a6ad0')]) });
  }

  const colliders: BoxCollider[] = [
    { x: plan.x, z: plan.z, yaw: plan.yaw, hw: W / 2 + 0.2, hd: D / 2 + 0.2 + jetty, y0: plan.padHeight - 1.5, y1: plan.padHeight + wallH + rise },
  ];
  // Lean-to on one gable end of larger buildings.
  if ((plan.kind === 'farmhouse' || plan.kind === 'longhouse') && rng.chance(0.6)) {
    const sx = rng.chance(0.5) ? -1 : 1;
    const lw = 2.2;
    const lh = 2.2;
    b.box('planks', m, sx * (W / 2 + lw / 2), lh / 2, 0, lw, lh, D * 0.7, { color: col('#c0a080'), aoBottom: 0.3 }, 0b001111 & (sx > 0 ? 0b0111 : 0b1011));
    const lm = m.clone().multiply(trs(sx * (W / 2 + lw / 2), lh + 0.35, 0, 0, 1, 1, 1, 0, -sx * 0.32));
    b.box(rm, lm, 0, 0, 0, lw + 0.6, 0.16, D * 0.7 + 0.5, { color: roofCol });
    const c = new THREE.Vector3(sx * (W / 2 + lw / 2), 0, 0).applyMatrix4(m);
    colliders.push({ x: c.x, z: c.z, yaw: plan.yaw, hw: lw / 2 + 0.1, hd: (D * 0.7) / 2 + 0.1, y0: plan.padHeight - 1, y1: plan.padHeight + lh + 0.6 });
  }

  return {
    colliders,
    chimneyTop,
    door: new THREE.Vector3(doorX, 0, fz + 0.6).applyMatrix4(m),
    height: wallH + rise,
  };
}
