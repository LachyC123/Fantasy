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

/** A real doorway with a hinged door (enterable buildings). */
export interface Doorway {
  /** Hinge position (world) at floor level. */
  hinge: THREE.Vector3;
  /** Yaw of the closed door leaf (the building's yaw). */
  yaw: number;
  width: number;
  height: number;
  /** Wall thickness the door sits in. */
  depth: number;
}

export interface BuildingResult {
  /** World-space oriented boxes for collision. */
  colliders: BoxCollider[];
  doorway?: Doorway;
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

/**
 * Village church: a stone nave with buttresses and lancet windows, a south
 * porch facing the street (+Z), and a bell tower with a slate spire at the
 * west (−X) end. The footprint (width × depth) includes the tower.
 */
function buildChurch(b: MeshBuilder, plan: BuildingPlan): BuildingResult {
  const rng = new Rng(plan.seed);
  const m = trs(plan.x, plan.padHeight, plan.z, plan.yaw);
  const W = plan.width;
  const D = plan.depth;
  const stone = (v = 0.06): THREE.Color => col('#ffffff').multiplyScalar(1 - v + rng.next() * v * 2);
  const towerS = THREE.MathUtils.clamp(D * 0.62, 4.2, 5.6);
  const towerX = -W / 2 + towerS / 2;
  const naveLen = W - towerS + 0.3;
  const naveCx = W / 2 - naveLen / 2;
  const naveH = rng.range(5.6, 6.6);
  const towerH = rng.range(13, 17);
  const spireH = rng.range(7, 11);

  b.box('stone', m, 0, -0.75, 0, W + 0.4, 1.5, D + 0.4, { color: col('#d0c8bc'), aoBottom: 0.4 });
  b.box('stone', m, naveCx, naveH / 2, 0, naveLen, naveH, D, { color: stone(), aoBottom: 0.35, aoHeight: 1.4 }, 0b001111);
  // Buttresses and lancet windows along both long walls.
  const bays = Math.max(3, Math.round(naveLen / 3.4));
  const doorBay = Math.floor(bays * 0.35);
  for (const sz of [-1, 1]) {
    for (let i = 0; i <= bays; i++) {
      const x = naveCx - naveLen / 2 + (naveLen * i) / bays;
      if (i > 0) b.box('stone', m, x, naveH * 0.42, sz * (D / 2 + 0.25), 0.55, naveH * 0.84, 0.5, { color: stone(0.04), aoBottom: 0.35 });
      if (i === bays) continue;
      const wx = x + naveLen / bays / 2;
      if (sz > 0 && i === doorBay) continue;
      b.box('glowWindow', m, wx, 3.0, sz * (D / 2 + 0.03), 0.55, 2.3, 0.08, { color: col('#ffffff') });
      b.box('stone', m, wx, 4.3, sz * (D / 2 + 0.06), 0.8, 0.3, 0.14, { color: stone(0.03) });
    }
  }
  // South porch with the door.
  const doorX = naveCx - naveLen / 2 + (naveLen * (doorBay + 0.5)) / bays;
  b.box('stone', m, doorX, 1.6, D / 2 + 0.9, 2.6, 3.2, 1.8, { color: stone(), aoBottom: 0.35 }, 0b101111);
  b.box('slate', m.clone().multiply(trs(doorX, 3.55, D / 2 + 0.9, 0, 1, 1, 1, 0, 0)), 0, 0, 0, 3.0, 0.16, 2.2, { color: col('#ffffff') });
  b.box('planks', m, doorX, 1.15, D / 2 + 1.82, 1.2, 2.3, 0.1, { color: col('#8a5a3a') });
  b.box('stone', m, doorX, 2.45, D / 2 + 1.84, 1.5, 0.3, 0.12, { color: stone(0.03) });
  // Steep slate roof over the nave.
  const pitch = plan.roofPitch;
  const over = 0.35;
  const halfSpan = D / 2 + over;
  const rise = (D / 2) * pitch;
  const ang = Math.atan2(rise, D / 2);
  const slopeLen = Math.hypot(halfSpan, rise + over * pitch);
  for (const sz of [-1, 1]) {
    const cy = naveH - over * pitch + (rise + over * pitch) / 2 + 0.1;
    b.box('slate', m.clone().multiply(trs(naveCx, cy, sz * (halfSpan / 2), 0, 1, 1, 1, sz * ang, 0)), 0, 0, 0, naveLen + 0.5, 0.2, slopeLen, { color: col('#ffffff') });
  }
  b.box('slate', m, naveCx, naveH + rise + 0.15, 0, naveLen + 0.6, 0.25, 0.4, { color: col('#d0d0d0') });
  // East gable with a round window.
  const ex = W / 2;
  const g0 = new THREE.Vector3(ex, naveH, -D / 2).applyMatrix4(m);
  const g1 = new THREE.Vector3(ex, naveH, D / 2).applyMatrix4(m);
  const g2 = new THREE.Vector3(ex, naveH + rise, 0).applyMatrix4(m);
  b.tri('stone', g0, g2, g1, [-(D / 2), naveH], [0, naveH + rise], [D / 2, naveH], stone());
  b.cylinder('glowWindow', m.clone().multiply(trs(ex + 0.04, naveH + rise * 0.35, 0, 0, 1, 1, 1, 0, Math.PI / 2)), 0, 0, 0, 0.75, 0.75, 0.06, 10, { color: col('#ffffff') }, { capTop: true, flat: true });
  // Bell tower, belfry openings and spire.
  b.box('stone', m, towerX, towerH / 2, 0, towerS, towerH, towerS, { color: stone(), aoBottom: 0.35, aoHeight: 2 });
  for (const [fx, fz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    b.box('plain', m, towerX + fx * (towerS / 2 + 0.02), towerH - 2.2, fz * (towerS / 2 + 0.02), fx ? 0.06 : 0.9, 1.8, fz ? 0.06 : 0.9, { color: col('#1e1a20') });
  }
  b.box('stone', m, towerX, towerH + 0.2, 0, towerS + 0.4, 0.4, towerS + 0.4, { color: stone(0.03) });
  const spire = m.clone().multiply(trs(towerX, towerH + 0.4, 0, Math.PI / 4));
  b.cylinder('slate', spire, 0, 0, 0, towerS * 0.68, 0.06, spireH, 4, { color: col('#ffffff') }, { flat: true });
  b.box('metal', m, towerX, towerH + 0.4 + spireH + 0.5, 0, 0.08, 1.0, 0.08, { color: col('#c8a050') });
  b.box('metal', m, towerX, towerH + 0.4 + spireH + 0.65, 0, 0.5, 0.08, 0.08, { color: col('#c8a050') });

  const towerC = new THREE.Vector3(towerX, 0, 0).applyMatrix4(m);
  const naveC = new THREE.Vector3(naveCx, 0, 0).applyMatrix4(m);
  const porchC = new THREE.Vector3(doorX, 0, D / 2 + 0.9).applyMatrix4(m);
  return {
    colliders: [
      { x: naveC.x, z: naveC.z, yaw: plan.yaw, hw: naveLen / 2 + 0.1, hd: D / 2 + 0.55, y0: plan.padHeight - 1.5, y1: plan.padHeight + naveH + rise },
      { x: towerC.x, z: towerC.z, yaw: plan.yaw, hw: towerS / 2 + 0.1, hd: towerS / 2 + 0.1, y0: plan.padHeight - 1.5, y1: plan.padHeight + towerH + spireH },
      { x: porchC.x, z: porchC.z, yaw: plan.yaw, hw: 1.35, hd: 0.5, y0: plan.padHeight - 1, y1: plan.padHeight + 3.6 },
    ],
    chimneyTop: null,
    door: new THREE.Vector3(doorX, 0, D / 2 + 2.4).applyMatrix4(m),
    height: towerH + spireH,
  };
}

export function buildBuilding(b: MeshBuilder, plan: BuildingPlan): BuildingResult {
  if (plan.kind === 'church') return buildChurch(b, plan);
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
  const enter = plan.enterable;
  const T = 0.3;
  const upCol = upperStyle === 'plaster' ? tint('#ffffff', 0.05).lerp(col('#fff2dc'), 0.5) : wallCol;

  // Door on the +Z face.
  const doorX = isBarn ? 0 : THREE.MathUtils.clamp(rng.range(-W * 0.2, W * 0.2), -W / 2 + 1.2, W / 2 - 1.2);
  const doorW = isBarn ? Math.min(3.2, W * 0.45) : 1.1;
  const doorH = isBarn ? 2.8 : 2.05;
  const fz = D / 2;

  if (enter) {
    // Real walls with a doorway, so the inside exists.
    const gm = wallMat(groundStyle);
    const sh = { color: wallCol, aoBottom: 0.35, aoHeight: 1.2 };
    b.box(gm, m, 0, FLOOR_H / 2, -D / 2 + T / 2, W, FLOOR_H, T, sh);
    for (const sx of [-1, 1]) b.box(gm, m, sx * (W / 2 - T / 2), FLOOR_H / 2, 0, T, FLOOR_H, D - 2 * T, sh);
    const left = doorX - doorW / 2 + W / 2;
    const right = W / 2 - (doorX + doorW / 2);
    b.box(gm, m, -W / 2 + left / 2, FLOOR_H / 2, fz - T / 2, left, FLOOR_H, T, sh);
    b.box(gm, m, W / 2 - right / 2, FLOOR_H / 2, fz - T / 2, right, FLOOR_H, T, sh);
    b.box(gm, m, doorX, (FLOOR_H + doorH) / 2, fz - T / 2, doorW, FLOOR_H - doorH, T, sh);
    if (floors > 1) {
      const um = wallMat(upperStyle);
      const ush = { color: upCol };
      const ud = D / 2 + jetty;
      for (const sz of [-1, 1]) b.box(um, m, 0, FLOOR_H * 1.5, sz * (ud - T / 2), W, FLOOR_H, T, ush);
      for (const sx of [-1, 1]) b.box(um, m, sx * (W / 2 - T / 2), FLOOR_H * 1.5, 0, T, FLOOR_H, ud * 2 - 2 * T, ush);
    }
  } else {
    b.box(wallMat(groundStyle), m, 0, FLOOR_H / 2, 0, W, FLOOR_H, D, { color: wallCol, aoBottom: 0.35, aoHeight: 1.2 }, 0b001111);
    if (floors > 1) b.box(wallMat(upperStyle), m, 0, FLOOR_H * 1.5, 0, W, FLOOR_H, D + jetty * 2, { color: upCol }, 0b001111);
  }
  if (floors > 1 && jetty > 0) {
    // Jetty floor joists visible under the overhang.
    for (const s of [-1, 1]) b.box('timber', m, 0, FLOOR_H - 0.1, s * (D / 2 + jetty / 2), W, 0.2, jetty, { color: col('#ffffff') });
  }

  // The door leaf of an enterable building is a separate, hinged mesh (built at runtime).
  if (!enter) b.box('planks', m, doorX, doorH / 2, fz + 0.04, doorW, doorH, 0.12, { color: col('#c8a888') });
  b.box('timber', m, doorX, doorH + 0.12, fz + 0.08, doorW + 0.4, 0.24, 0.2, { color: col('#ffffff') });
  for (const s of [-1, 1]) b.box('timber', m, doorX + s * (doorW / 2 + 0.1), doorH / 2, fz + 0.08, 0.2, doorH, 0.18, { color: col('#ffffff') });
  if (!isBarn) {
    if (!enter) b.box('metal', m, doorX + doorW * 0.32, doorH * 0.48, fz + 0.12, 0.08, 0.08, 0.06, { color: col('#2a2622') });
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
      const glow = glowing && rng.chance(0.6);
      windowUnit(b, m, x, y, z, outward, w, isBarn ? 0.5 : 1.0, rng, glow, !isBarn && rng.chance(0.45));
      // From inside, the same window glows in the wall.
      if (enter) b.box(glow ? 'glowWindow' : 'window', m, x, y, z - outward * (T + 0.01), w, 1.0, 0.04, { color: col('#ffffff') });
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
    if (enter) {
      // The gable seen from inside the loft.
      const q0 = new THREE.Vector3(x - sx * 0.02, wallH, -(D / 2 + jetty)).applyMatrix4(m);
      const q1 = new THREE.Vector3(x - sx * 0.02, wallH, D / 2 + jetty).applyMatrix4(m);
      const q2 = new THREE.Vector3(x - sx * 0.02, wallH + rise, 0).applyMatrix4(m);
      if (sx > 0) b.tri(gableMat, q1, q2, q0, [D / 2, wallH], [0, wallH + rise], [-(D / 2), wallH], c.clone().multiplyScalar(0.8));
      else b.tri(gableMat, q0, q2, q1, [-(D / 2), wallH], [0, wallH + rise], [D / 2, wallH], c.clone().multiplyScalar(0.8));
    }
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

  // The inn: a painted sign on a bracket above the door, and a lantern.
  if (plan.kind === 'inn') {
    const sx = doorX + (doorX > 0 ? -1.1 : 1.1);
    b.box('timber', m, sx, 3.35, fz + 0.65, 0.12, 0.12, 1.3, { color: col('#ffffff') });
    b.box('planks', m, sx, 2.85, fz + 1.15, 0.06, 0.75, 1.0, { color: rng.pick([col('#b04a3a'), col('#3a5a8a'), col('#4a7a4a'), col('#c89a3a')]) });
    b.box('plain', m, sx + 0.04, 2.85, fz + 1.15, 0.02, 0.4, 0.55, { color: col('#f0e0b0') });
    b.box('glowWindow', m, doorX + (doorX > 0 ? 0.95 : -0.95), 2.2, fz + 0.22, 0.24, 0.32, 0.24, { color: col('#ffffff') });
  }

  const colliders: BoxCollider[] = [];
  let doorway: Doorway | undefined;
  if (enter) {
    const at = (lx: number, lz: number): THREE.Vector3 => new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
    const wall = (lx: number, lz: number, hw: number, hd: number, y0: number, y1: number): void => {
      const c = at(lx, lz);
      colliders.push({ x: c.x, z: c.z, yaw: plan.yaw, hw, hd, y0: plan.padHeight + y0, y1: plan.padHeight + y1 });
    };
    const top = wallH + rise;
    wall(0, -D / 2 + T / 2, W / 2, T / 2, -1.5, top);
    for (const sx of [-1, 1]) wall(sx * (W / 2 - T / 2), 0, T / 2, D / 2, -1.5, top);
    const left = doorX - doorW / 2 + W / 2;
    const right = W / 2 - (doorX + doorW / 2);
    wall(-W / 2 + left / 2, fz - T / 2, left / 2, T / 2, -1.5, top);
    wall(W / 2 - right / 2, fz - T / 2, right / 2, T / 2, -1.5, top);
    wall(doorX, fz - T / 2, doorW / 2, T / 2, doorH, top);
    if (floors > 1) {
      const ud = D / 2 + jetty;
      for (const sz of [-1, 1]) wall(0, sz * (ud - T / 2), W / 2, T / 2, FLOOR_H, top);
    }
    furnishInn(b, m, rng, { W, D, T, jetty, doorX, doorW, floors, chimneySide: plan.chimney === 'left' ? -1 : 1 }, wall);
    // The chimney stack rises through the loft.
    if (plan.chimney !== 'none') wall((plan.chimney === 'left' ? -1 : 1) * (W / 2 - 0.55), -0.2, 0.5, 0.5, FLOOR_H - 0.2, top);
    doorway = { hinge: at(doorX - doorW / 2, fz - T / 2).setY(plan.padHeight), yaw: plan.yaw, width: doorW, height: doorH, depth: T };
  } else {
    colliders.push({ x: plan.x, z: plan.z, yaw: plan.yaw, hw: W / 2 + 0.2, hd: D / 2 + 0.2 + jetty, y0: plan.padHeight - 1.5, y1: plan.padHeight + wallH + rise });
  }
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
    doorway,
    chimneyTop,
    door: new THREE.Vector3(doorX, 0, fz + 0.6).applyMatrix4(m),
    height: wallH + rise,
  };
}

interface InnLayout {
  W: number;
  D: number;
  T: number;
  jetty: number;
  doorX: number;
  doorW: number;
  floors: number;
  chimneySide: number;
}

/** Where the inn's upstairs chest stands (local coordinates; shared with the site plan). */
export function innChestLocal(plan: { width: number; depth: number; chimney: BuildingPlan['chimney'] }): { x: number; y: number; z: number } {
  const side = plan.chimney === 'left' ? -1 : 1;
  return { x: side * (plan.width / 2 - 1.1), y: FLOOR_H, z: plan.depth / 2 - 1.0 };
}

/**
 * The inn's rooms: a planked taproom with a hearth on the chimney wall, a
 * counter with barrels behind it, tables and benches; a stair along the back
 * wall up to a loft with beds. Every solid piece has a collider.
 */
function furnishInn(b: MeshBuilder, m: THREE.Matrix4, rng: Rng, L: InnLayout, wall: (lx: number, lz: number, hw: number, hd: number, y0: number, y1: number) => void): void {
  const { W, D, T } = L;
  const iw = W - 2 * T;
  const id = D - 2 * T;
  const wood = col('#a07850');
  const dark = col('#6a4a30');
  // Floors.
  b.box('planks', m, 0, 0.03, 0, iw, 0.06, id, { color: col('#b08a64') });
  // Hearth on the chimney wall.
  const hx = L.chimneySide * (W / 2 - T - 0.45);
  b.box('stone', m, hx, 0.6, -0.2, 0.9, 1.2, 1.8, { color: col('#d0c8bc'), aoBottom: 0.3 });
  b.box('plain', m, hx - L.chimneySide * 0.46, 0.45, -0.2, 0.04, 0.6, 1.0, { color: col('#201810') });
  b.box('glowWindow', m, hx - L.chimneySide * 0.44, 0.3, -0.2, 0.06, 0.3, 0.7, { color: col('#ffffff') });
  b.box('timber', m, hx - L.chimneySide * 0.1, 1.25, -0.2, 1.1, 0.12, 2.0, { color: wood });
  wall(hx, -0.2, 0.45, 0.9, 0, 1.2);
  // Stair along the back wall, on the side away from the hearth, climbing towards the middle.
  const s0 = -L.chimneySide * (W / 2 - T - 0.25);
  const steps = 7;
  const tread = 0.42;
  const rise = FLOOR_H / steps;
  const sz = -D / 2 + T + 0.5;
  for (let k = 0; k < steps; k++) {
    const x = s0 + L.chimneySide * (k + 0.5) * tread;
    const h = rise * (k + 1);
    b.box('planks', m, x, h / 2, sz, tread, h, 0.95, { color: k % 2 ? wood : wood.clone().multiplyScalar(0.92) });
    wall(x, sz, tread / 2, 0.47, -0.2, h);
  }
  const stairEnd = s0 + L.chimneySide * steps * tread;
  // Counter with barrels behind it, against the back wall on the hearth side.
  const cx = L.chimneySide * Math.min(W / 2 - T - 2.0, Math.max(0.9, Math.abs(stairEnd) + 1.6));
  const cw = 2.2;
  const cz = -D / 2 + T + 1.45;
  b.box('planks', m, cx, 0.55, cz, cw, 1.1, 0.55, { color: dark });
  b.box('planks', m, cx, 1.12, cz, cw + 0.15, 0.06, 0.7, { color: wood });
  wall(cx, cz, cw / 2, 0.3, 0, 1.15);
  for (let k = 0; k < 2; k++) {
    const bx = cx + (k - 0.5) * 0.9;
    b.cylinder('planks', m, bx, 0, -D / 2 + T + 0.45, 0.32, 0.32, 0.85, 8, { color: col('#c09878') }, { capTop: true, flat: true });
  }
  // Tables and benches in the front half of the room.
  const tables = W > 12.5 ? 3 : 2;
  for (let k = 0; k < tables; k++) {
    const tx = -W / 2 + T + ((k + 0.5) * iw) / tables;
    if (Math.abs(tx - L.doorX) < 1.3) continue;
    const tz = D / 2 - T - 1.6 - rng.range(0, 0.3);
    b.box('planks', m, tx, 0.75, tz, 1.4, 0.07, 0.8, { color: wood });
    for (const lx of [-0.6, 0.6]) for (const lz of [-0.32, 0.32]) b.box('timber', m, tx + lx, 0.37, tz + lz, 0.08, 0.74, 0.08, { color: dark });
    for (const bz of [-0.65, 0.65]) b.box('planks', m, tx, 0.42, tz + bz, 1.3, 0.07, 0.3, { color: dark });
    wall(tx, tz, 0.72, 0.42, 0, 0.8);
    if (rng.chance(0.6)) b.box('plain', m, tx + rng.range(-0.3, 0.3), 0.85, tz, 0.12, 0.14, 0.12, { color: col('#d8c8a0') });
  }
  if (L.floors < 2) return;
  // The loft: a floor with a well over the stair, a rail, and two beds against the front wall.
  const fy = FLOOR_H - 0.1;
  const ud = D / 2 + L.jetty - T;
  const holeZ1 = sz + 0.55;
  const holeX0 = Math.min(s0, stairEnd) - 0.05;
  const holeX1 = Math.max(s0, stairEnd) + 0.05;
  const plank = col('#a8825c');
  // Front part, full width.
  b.box('planks', m, 0, fy, (holeZ1 + ud) / 2, iw, 0.2, ud - holeZ1, { color: plank });
  wall(0, (holeZ1 + ud) / 2, iw / 2, (ud - holeZ1) / 2, fy - 0.1, fy + 0.1);
  // Back strip beside the stair well.
  const bx0 = L.chimneySide > 0 ? holeX1 : -W / 2 + T;
  const bx1 = L.chimneySide > 0 ? W / 2 - T : holeX0;
  b.box('planks', m, (bx0 + bx1) / 2, fy, (-ud + holeZ1) / 2, bx1 - bx0, 0.2, holeZ1 + ud, { color: plank });
  wall((bx0 + bx1) / 2, (-ud + holeZ1) / 2, (bx1 - bx0) / 2, (holeZ1 + ud) / 2, fy - 0.1, fy + 0.1);
  // Rail along the stair well's open edge.
  const rx = (holeX0 + holeX1) / 2;
  b.box('timber', m, rx, FLOOR_H + 0.9, holeZ1 + 0.05, holeX1 - holeX0, 0.08, 0.08, { color: dark });
  for (const px of [holeX0 + 0.05, rx, holeX1 - 0.05]) b.box('timber', m, px, FLOOR_H + 0.45, holeZ1 + 0.05, 0.08, 0.9, 0.08, { color: dark });
  wall(rx, holeZ1 + 0.05, (holeX1 - holeX0) / 2, 0.05, FLOOR_H, FLOOR_H + 0.95);
  // Beds.
  for (const k of [-1, 1]) {
    const bx = k * W * 0.22;
    const bz = ud - 1.1;
    b.box('planks', m, bx, FLOOR_H + 0.25, bz, 1.0, 0.4, 2.0, { color: dark });
    b.box('plain', m, bx, FLOOR_H + 0.5, bz, 0.95, 0.14, 1.9, { color: rng.pick([col('#9a4a3a'), col('#4a5a8a'), col('#6a7a4a')]) });
    b.box('plain', m, bx, FLOOR_H + 0.6, bz + 0.75, 0.7, 0.12, 0.35, { color: col('#e8e0d0') });
    wall(bx, bz, 0.5, 1.0, FLOOR_H, FLOOR_H + 0.55);
  }
  // A lantern glow under the ridge.
  b.box('glowWindow', m, 0, FLOOR_H * 2 + 0.6, 0, 0.25, 0.3, 0.25, { color: col('#ffffff') });
}

/** Where the innkeeper stands: behind the counter, facing the room (local coordinates). */
export function innKeeperLocal(plan: { width: number; depth: number; chimney: BuildingPlan['chimney'] }): { x: number; z: number } {
  const T = 0.3;
  const side = plan.chimney === 'left' ? -1 : 1;
  const W = plan.width;
  const D = plan.depth;
  const stairEnd = -side * (W / 2 - T - 0.25) + side * 7 * 0.42;
  const cx = side * Math.min(W / 2 - T - 2.0, Math.max(0.9, Math.abs(stairEnd) + 1.6));
  return { x: cx, z: -D / 2 + T + 0.96 };
}
