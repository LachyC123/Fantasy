/**
 * Builds the static world architecture from the plan: buildings, the ruined
 * watchtower, the castle, props, field boundaries, road surfaces and the
 * ancient tree. Geometry is batched per material (a handful of draw calls),
 * and every solid piece registers a matching collider.
 */
import * as THREE from 'three';
import { Rng, deriveSeed } from '../core/rng';
import { MeshBuilder, col, trs } from '../assets/geo';
import { buildBuilding, type BoxCollider } from '../assets/buildings';
import { buildCastle } from '../assets/castle';
import { generateTree } from '../assets/trees';
import type { MaterialLibrary, MaterialName } from '../rendering/materials';
import type { CollisionWorld } from '../player/collision';
import type { TerrainLike } from './terrain';
import type { CastlePlan, FencePlan, P2, PropPlan, RuinPlan, WorldContent } from './types';
import { getTextures } from '../rendering/textures';
import { patchMaterial } from '../rendering/atmosphere';

export interface StructureResult {
  group: THREE.Group;
  smoke: THREE.Vector3[];
  spireTips: THREE.Vector3[];
  stats: { buildings: number; colliders: number; triangles: number };
}

function addBox(world: CollisionWorld, c: BoxCollider, tag: string): void {
  world.addBox({ ...c, tag });
}

function ruinTower(b: MeshBuilder, r: RuinPlan, world: CollisionWorld, road: { x: number; z: number }): void {
  const rng = new Rng(r.seed);
  const m = trs(r.x, r.padHeight, r.z, 0);
  const segs = 16;
  const R = r.radius;
  const T = 0.95;
  // Doorway faces the road.
  const doorAng = Math.atan2(road.x - r.x, road.z - r.z);
  const stoneCol = col('#ffffff');
  // Flagstone floor.
  b.cylinder('ruinStone', m, 0, -0.6, 0, R - 0.2, R - 0.2, 0.7, segs, { color: col('#d0c8b8') }, { capTop: true, flat: true });
  for (let i = 0; i < segs; i++) {
    const a = ((i + 0.5) / segs) * Math.PI * 2;
    let da = Math.abs(a - doorAng) % (Math.PI * 2);
    if (da > Math.PI) da = Math.PI * 2 - da;
    const isDoor = da < Math.PI / segs * 1.1;
    // Broken silhouette: two tall shards, the rest crumbled to varying heights.
    const tall = Math.cos(a * 2 + r.seed) > 0.55 ? 1 : Math.cos(a * 3 - 1.3) > 0.7 ? 0.75 : 0.32;
    let h = r.height * tall * rng.range(0.75, 1.05);
    if (isDoor) h = 0;
    if (h < 0.4) continue;
    const segLen = (2 * Math.PI * R) / segs + 0.12;
    const cx = Math.sin(a) * R;
    const cz = Math.cos(a) * R;
    const sm = m.clone().multiply(trs(cx, 0, cz, a));
    // Stack courses with jittered tops so the break reads as masonry.
    const courses = Math.ceil(h / 1.2);
    for (let k = 0; k < courses; k++) {
      const y0 = k * 1.2 - 0.6;
      const ch = k === courses - 1 ? h - k * 1.2 + 0.6 : 1.2;
      const shrink = k === courses - 1 ? rng.range(0.55, 1) : 1;
      b.box('ruinStone', sm, (1 - shrink) * segLen * 0.3 * (rng.chance(0.5) ? 1 : -1) * 0, y0 + ch / 2, 0, T, ch, segLen * shrink, { color: stoneCol, aoBottom: k === 0 ? 0.35 : 0 });
    }
    const w = new THREE.Vector3(cx, 0, cz).applyMatrix4(m);
    world.addBox({ x: w.x, z: w.z, yaw: a, hw: T / 2, hd: segLen / 2, y0: r.padHeight - 1, y1: r.padHeight + h, tag: `${r.id}/wall${i}` });
    // Ivy creeping up the taller shards.
    if (h > 4 && rng.chance(0.6)) b.box('foliagePlain', sm, T / 2 + 0.06, h * 0.4, 0, 0.12, h * 0.8, segLen * 0.8, { color: col('#3b6428'), aoBottom: 0.3 });
  }
  // Broken spiral stair against the inner wall: real steps you can climb.
  const stairStart = doorAng + Math.PI * 0.55;
  for (let k = 0; k < 7; k++) {
    const a = stairStart + k * 0.42;
    const rr = R - T / 2 - 0.75;
    const top = 0.42 * (k + 1);
    const sx = Math.sin(a) * rr;
    const sz = Math.cos(a) * rr;
    b.box('ruinStone', m.clone().multiply(trs(sx, 0, sz, a)), 0, top / 2 - 0.3, 0, 1.5, top + 0.6, 1.1, { color: col('#e0d8c8'), aoBottom: 0.3 });
    const w = new THREE.Vector3(sx, 0, sz).applyMatrix4(m);
    world.addBox({ x: w.x, z: w.z, yaw: a, hw: 0.75, hd: 0.55, y0: r.padHeight - 0.5, y1: r.padHeight + top, tag: `${r.id}/step${k}` });
  }
  // Rubble inside and spilling out of the breach.
  for (let k = 0; k < 9; k++) {
    const a = doorAng + rng.range(-0.8, 0.8);
    const d = rng.range(0.5, R + 3);
    const s = rng.range(0.35, 0.8);
    b.box('ruinStone', m.clone().multiply(trs(Math.sin(a) * d, s * 0.3 - 0.1, Math.cos(a) * d, rng.range(0, 3), 1, 1, 1, rng.range(-0.3, 0.3), rng.range(-0.3, 0.3))), 0, 0, 0, s * 1.4, s, s, { color: col('#d8d0c0') });
  }
  // A low ruined enclosure wall towards the road: knee-high, stand on it.
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue;
    const a = doorAng + k * 0.28;
    const d = R + 4.5;
    const h = rng.range(0.35, 0.9);
    const cx = Math.sin(a) * d;
    const cz = Math.cos(a) * d;
    b.box('ruinStone', m.clone().multiply(trs(cx, 0, cz, a)), 0, h / 2 - 0.3, 0, 0.7, h + 0.6, 1.5, { color: stoneCol, aoBottom: 0.3 });
    const w = new THREE.Vector3(cx, 0, cz).applyMatrix4(m);
    world.addBox({ x: w.x, z: w.z, yaw: a, hw: 0.35, hd: 0.75, y0: r.padHeight - 0.5, y1: r.padHeight + h, tag: `${r.id}/low${k}` });
  }
}

function prop(b: MeshBuilder, p: PropPlan, terrain: TerrainLike, world: CollisionWorld): void {
  const y = terrain.height(p.x, p.z);
  const m = trs(p.x, y, p.z, p.yaw);
  switch (p.kind) {
    case 'well': {
      b.cylinder('stone', m, 0, -0.4, 0, 1.05, 1.0, 1.3, 12, { color: col('#ffffff'), aoBottom: 0.3 }, { capTop: false, flat: true });
      b.cylinder('stone', m, 0, -0.4, 0, 0.8, 0.8, 1.29, 12, { color: col('#9a948a') }, { flat: true });
      b.cylinder('plain', m, 0, 0.3, 0, 0.8, 0.8, 0.01, 12, { color: col('#1e2a30') }, { capTop: true, flat: true });
      for (const s of [-1, 1]) b.box('timber', m, s * 0.95, 1.2, 0, 0.18, 2.4, 0.18, { color: col('#ffffff') });
      b.box('timber', m, 0, 2.2, 0, 2.2, 0.16, 0.16, { color: col('#ffffff') });
      for (const s of [-1, 1]) b.box('roofTile', m.clone().multiply(trs(0, 2.55, s * 0.45, 0, 1, 1, 1, s * 0.75, 0)), 0, 0, 0, 2.6, 0.12, 1.3, { color: col('#ffffff') });
      b.cylinder('planks', m, 0.2, 1.3, 0, 0.18, 0.2, 0.32, 8, { color: col('#c0a080') }, { capBottom: true });
      world.addCircle({ x: p.x, z: p.z, r: 1.1, y0: y - 1, y1: y + 0.9, tag: p.id });
      break;
    }
    case 'haystack': {
      b.cylinder('hay', m, 0, -0.2, 0, 1.7, 1.55, 1.6, 10, { color: col('#ffffff'), aoBottom: 0.35 }, { flat: true });
      b.cylinder('hay', m, 0, 1.4, 0, 1.55, 0.2, 1.4, 10, { color: col('#ffffff') }, { flat: true });
      world.addCircle({ x: p.x, z: p.z, r: 1.7, y0: y - 1, y1: y + 2.8, tag: p.id });
      break;
    }
    case 'cart': {
      b.box('planks', m, 0, 0.95, 0, 1.4, 0.15, 2.4, { color: col('#c8a888') });
      for (const s of [-1, 1]) b.box('planks', m, s * 0.7, 1.2, 0, 0.08, 0.45, 2.4, { color: col('#b09070') });
      b.box('planks', m, 0, 1.2, -1.2, 1.4, 0.45, 0.08, { color: col('#b09070') });
      for (const s of [-1, 1]) b.cylinder('planks', m.clone().multiply(trs(s * 0.8, 0.55, 0.3, 0, 1, 1, 1, 0, Math.PI / 2)), 0, -0.06, 0, 0.55, 0.55, 0.12, 10, { color: col('#a08060') }, { capTop: true, capBottom: true, flat: true });
      for (const s of [-1, 1]) b.box('timber', m, s * 0.4, 0.75, 2.1, 0.1, 0.1, 2.0, { color: col('#ffffff') });
      b.box('hay', m, 0, 1.3, 0.2, 1.2, 0.35, 1.6, { color: col('#ffffff') });
      world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 0.9, hd: 1.4, y0: y - 0.5, y1: y + 1.4, tag: p.id });
      break;
    }
    case 'barrel': {
      b.cylinder('planks', m, 0, 0, 0, 0.36, 0.36, 0.95, 9, { color: col('#c09878'), aoBottom: 0.3 }, { capTop: true, flat: true });
      for (const h of [0.18, 0.75]) b.cylinder('metal', m, 0, h, 0, 0.375, 0.375, 0.06, 9, { color: col('#4a4440') }, { flat: true });
      world.addCircle({ x: p.x, z: p.z, r: 0.42, y0: y - 0.5, y1: y + 0.95, tag: p.id });
      break;
    }
    case 'signpost': {
      b.box('timber', m, 0, 1.2, 0, 0.16, 2.6, 0.16, { color: col('#ffffff'), aoBottom: 0.3 });
      b.box('planks', m, 0.55, 2.05, 0, 1.2, 0.3, 0.06, { color: col('#d0b090') });
      b.box('planks', m.clone().multiply(trs(0, 1.65, 0, 2.4)), -0.5, 0, 0, 1.0, 0.26, 0.06, { color: col('#c0a080') });
      b.box('timber', m, 0, 2.55, 0, 0.3, 0.12, 0.3, { color: col('#ffffff') });
      world.addCircle({ x: p.x, z: p.z, r: 0.2, y0: y - 0.5, y1: y + 2.6, tag: p.id });
      break;
    }
    case 'waystone': {
      b.box('ruinStone', m, 0, 0.6, 0, 0.55, 1.9, 0.32, { color: col('#d8d0c0'), aoBottom: 0.4 });
      b.box('ruinStone', m.clone().multiply(trs(0, 1.6, 0, 0, 1, 1, 1, 0, 0.2)), 0, 0, 0, 0.5, 0.35, 0.3, { color: col('#d0c8b8') });
      b.box('foliagePlain', m, 0.05, 0.25, 0, 0.6, 0.25, 0.36, { color: col('#4a6a2c') });
      // Carved ring motif (an emblem of the vale's lost wardens).
      b.cylinder('plain', m.clone().multiply(trs(0, 1.1, 0.17, 0, 1, 1, 1, Math.PI / 2, 0)), 0, 0, 0, 0.14, 0.14, 0.02, 8, { color: col('#3a3a3a') }, { capTop: true, flat: true });
      world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 0.3, hd: 0.2, y0: y - 0.5, y1: y + 1.8, tag: p.id });
      break;
    }
    case 'woodpile': {
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 6 - row; i++) {
          const lm = m.clone().multiply(trs(-0.9 + row * 0.17 + i * 0.36, 0.17 + row * 0.3, 0, 0, 1, 1, 1, Math.PI / 2, 0));
          b.cylinder('bark', lm, 0, -0.5, 0, 0.17, 0.17, 1.0, 6, { color: col('#c0b0a0') }, { capTop: true, capBottom: true, flat: true });
        }
      world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 1.1, hd: 0.55, y0: y - 0.5, y1: y + 0.95, tag: p.id });
      break;
    }
    case 'chopping-block': {
      b.cylinder('bark', m, 0, -0.2, 0, 0.38, 0.34, 0.7, 8, { color: col('#c0b0a0'), aoBottom: 0.3 }, { capTop: true, flat: true });
      world.addCircle({ x: p.x, z: p.z, r: 0.4, y0: y - 0.5, y1: y + 0.5, tag: p.id });
      break;
    }
    case 'chest': {
      // The chest's body; its lid (and what lies inside) belong to the loot system.
      b.box('planks', m, 0, 0.22, 0, 0.92, 0.46, 0.6, { color: col('#b88a5c'), aoBottom: 0.35 });
      for (const sx of [-0.3, 0.3]) b.box('metal', m, sx, 0.23, 0, 0.07, 0.48, 0.62, { color: col('#3a3430') });
      b.box('metal', m, 0, 0.32, 0.31, 0.12, 0.14, 0.03, { color: col('#c8a050') });
      world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 0.48, hd: 0.32, y0: y - 0.5, y1: y + 0.62, tag: p.id });
      break;
    }
    case 'standing-stone': {
      // Weathered grey monoliths: a tapering, slightly irregular stack, patched with lichen.
      const sc = Math.abs(p.scale ?? 1);
      const rng = new Rng(deriveSeed(p.id, 'stone'));
      const tone = col('#b4b2a6').multiplyScalar(rng.range(0.85, 1.05));
      const lichen = col('#8a9a5a');
      if ((p.scale ?? 1) < 0) {
        // Fallen: lying on its side, half sunk in the turf.
        const lm = m.clone().multiply(trs(0, 0.22 * sc, 0, rng.range(-0.3, 0.3), 1, 1, 1, Math.PI / 2 - 0.08, 0));
        b.box('plain', lm, 0, 0, 0, 1.0 * sc, 2.6 * sc, 0.55 * sc, { color: tone, aoBottom: 0.3 });
        b.box('plain', lm, 0.05 * sc, 0.4 * sc, 0.3 * sc, 0.6 * sc, 0.8 * sc, 0.06, { color: lichen });
        world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 0.5 * sc, hd: 1.35 * sc, y0: y - 0.5, y1: y + 0.55 * sc, tag: p.id });
      } else {
        const lean = trs(0, 0, 0, 0, 1, 1, 1, rng.range(-0.07, 0.07), rng.range(-0.07, 0.07));
        const sm = m.clone().multiply(lean);
        const H = 2.4 * sc;
        const w0 = 1.0 * sc;
        const d0 = 0.55 * sc;
        b.box('plain', sm, 0, H * 0.25 - 0.5, 0, w0, H * 0.5 + 1, d0, { color: tone, aoBottom: 0.5 });
        b.box('plain', sm, rng.range(-0.06, 0.06) * sc, H * 0.68, 0, w0 * 0.86, H * 0.38, d0 * 0.9, { color: tone.clone().multiplyScalar(1.03) });
        b.box('plain', sm, rng.range(-0.1, 0.1) * sc, H * 0.93, 0, w0 * rng.range(0.5, 0.7), H * 0.16, d0 * 0.8, { color: tone.clone().multiplyScalar(1.06) });
        if (rng.chance(0.7)) b.box('plain', sm, rng.range(-0.25, 0.25) * sc, H * rng.range(0.15, 0.45), d0 / 2 + 0.02, w0 * 0.28, H * 0.12, 0.04, { color: lichen });
        world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 0.5 * sc, hd: 0.3 * sc, y0: y - 0.5, y1: y + H, tag: p.id });
      }
      break;
    }
    case 'shrine': {
      b.box('stone', m, 0, 0.25, 0, 1.5, 1.1, 1.1, { color: col('#d8d0c0'), aoBottom: 0.4 });
      b.box('stone', m, 0, 1.45, -0.42, 1.3, 1.6, 0.26, { color: col('#ccc4b4') });
      for (const sx of [-0.58, 0.58]) b.box('stone', m, sx, 1.45, -0.1, 0.18, 1.6, 0.5, { color: col('#c8c0b0') });
      b.box('slate', m.clone().multiply(trs(0, 2.38, -0.1, 0, 1, 1, 1, -0.18, 0)), 0, 0, 0, 1.7, 0.14, 1.0, { color: col('#ffffff') });
      // The saint: a small weathered figure in the niche.
      b.cylinder('ruinStone', m, 0, 0.8, -0.18, 0.16, 0.2, 0.75, 7, { color: col('#e6e0d4') }, { capTop: true, flat: true });
      b.cylinder('ruinStone', m, 0, 1.6, -0.18, 0.11, 0.11, 0.2, 7, { color: col('#e6e0d4') }, { capTop: true, flat: true });
      for (const sx of [-0.4, -0.25, 0.32]) b.box('glowWindow', m, sx, 0.88, 0.25, 0.06, 0.16, 0.06, { color: col('#ffffff') });
      world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 0.78, hd: 0.58, y0: y - 0.5, y1: y + 2.4, tag: p.id });
      break;
    }
    case 'tent': {
      const rng = new Rng(deriveSeed(p.id, 'tent'));
      const canvas = rng.pick([col('#d8c8a0'), col('#b8a888'), col('#a89878'), col('#c8b8a0')]);
      const W = 2.4;
      const H = 1.7;
      const L = 2.8;
      const half = W / 2;
      const slope = Math.hypot(half, H);
      const ang = Math.atan2(H, half);
      for (const sx of [-1, 1]) b.box('plaster', m.clone().multiply(trs(sx * half / 2, H / 2, 0, 0, 1, 1, 1, 0, sx * -(Math.PI / 2 - ang))), 0, 0, 0, 0.05, slope, L, { color: canvas, aoBottom: 0.3 });
      b.box('timber', m, 0, H + 0.02, 0, 0.08, 0.08, L + 0.3, { color: col('#ffffff') });
      for (const sz of [-1, 1]) b.box('timber', m, 0, H / 2, sz * (L / 2 + 0.1), 0.08, H, 0.08, { color: col('#ffffff') });
      // A dark doorway on the +Z end.
      b.tri('plain', new THREE.Vector3(-half * 0.8, 0.02, L / 2).applyMatrix4(m), new THREE.Vector3(half * 0.8, 0.02, L / 2).applyMatrix4(m), new THREE.Vector3(0, H * 0.9, L / 2).applyMatrix4(m), [0, 0], [1, 0], [0.5, 1], col('#2a241e'));
      b.tri('plain', new THREE.Vector3(half, 0.02, -L / 2).applyMatrix4(m), new THREE.Vector3(-half, 0.02, -L / 2).applyMatrix4(m), new THREE.Vector3(0, H, -L / 2).applyMatrix4(m), [0, 0], [1, 0], [0.5, 1], canvas);
      world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: half, hd: L / 2, y0: y - 0.5, y1: y + H, tag: p.id });
      break;
    }
    case 'campfire': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.box('rock', m.clone().multiply(trs(Math.sin(a) * 0.75, 0.08, Math.cos(a) * 0.75, a)), 0, 0, 0, 0.3, 0.24, 0.22, { color: col('#a8a090') });
      }
      for (let i = 0; i < 4; i++) b.box('bark', m.clone().multiply(trs(0, 0.12, 0, i * 0.8, 1, 1, 1, 0, 0.25)), 0, 0, 0, 0.12, 0.12, 1.0, { color: col('#5a4a3a') });
      b.box('plain', m, 0, 0.04, 0, 0.9, 0.04, 0.9, { color: col('#2a2420') });
      world.addCircle({ x: p.x, z: p.z, r: 0.9, y0: y - 0.5, y1: y + 0.3, tag: p.id });
      break;
    }
    case 'lantern': {
      b.box('timber', m, 0, 1.35, 0, 0.14, 2.9, 0.14, { color: col('#ffffff'), aoBottom: 0.3 });
      b.box('timber', m, 0, 2.7, 0.3, 0.1, 0.1, 0.65, { color: col('#ffffff') });
      b.box('metal', m, 0, 2.38, 0.55, 0.3, 0.06, 0.3, { color: col('#3a3430') });
      b.box('glowWindow', m, 0, 2.18, 0.55, 0.22, 0.34, 0.22, { color: col('#ffffff') });
      b.box('metal', m, 0, 1.99, 0.55, 0.26, 0.05, 0.26, { color: col('#3a3430') });
      world.addCircle({ x: p.x, z: p.z, r: 0.15, y0: y - 0.5, y1: y + 2.8, tag: p.id });
      break;
    }
    case 'grave': {
      b.box('ruinStone', m, 0, 0.45, 0, 0.6, 1.1, 0.14, { color: col('#c8c0b0'), aoBottom: 0.3 });
      world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 0.32, hd: 0.1, y0: y - 0.5, y1: y + 0.95, tag: p.id });
      break;
    }
    case 'bench': {
      b.box('planks', m, 0, 0.45, 0, 1.6, 0.08, 0.4, { color: col('#c0a080') });
      world.addBox({ x: p.x, z: p.z, yaw: p.yaw, hw: 0.8, hd: 0.2, y0: y, y1: y + 0.5, tag: p.id });
      break;
    }
  }
}

function fence(b: MeshBuilder, f: FencePlan, terrain: TerrainLike, world: CollisionWorld): void {
  const rng = new Rng(deriveSeed(f.id, 'fence'));
  // Split into short spans that follow the ground.
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < f.points.length - 1; i++) {
    const a = f.points[i]!;
    const c = f.points[i + 1]!;
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const n = Math.max(1, Math.ceil(len / 2.4));
    for (let k = 0; k < n; k++) pts.push({ x: a.x + ((c.x - a.x) * k) / n, z: a.z + ((c.z - a.z) * k) / n });
  }
  pts.push(f.points[f.points.length - 1]!);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const c = pts[i + 1]!;
    const ya = terrain.height(a.x, a.z);
    const yc = terrain.height(c.x, c.z);
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const yaw = Math.atan2(c.x - a.x, c.z - a.z);
    const pitch = -Math.atan2(yc - ya, len);
    const mx = (a.x + c.x) / 2;
    const mz = (a.z + c.z) / 2;
    const my = (ya + yc) / 2;
    const sm = trs(mx, my, mz, yaw, 1, 1, 1, pitch);
    let top = 1.1;
    if (f.kind === 'wood-fence') {
      b.box('timber', trs(a.x, ya, a.z, yaw + rng.range(-0.1, 0.1)), 0, 0.45, 0, 0.16, 1.3, 0.16, { color: col('#e0d0c0'), aoBottom: 0.3 });
      for (const h of [0.45, 0.95]) b.box('timber', sm, 0, h, 0, 0.08, 0.12, len + 0.1, { color: col('#d8c8b8') });
      if (i === pts.length - 2) b.box('timber', trs(c.x, yc, c.z, yaw), 0, 0.45, 0, 0.16, 1.3, 0.16, { color: col('#e0d0c0') });
      top = 1.1;
    } else if (f.kind === 'stone-wall') {
      const h = rng.range(0.75, 1.0);
      b.box('stone', sm, 0, h / 2 - 0.3, 0, 0.75, h + 0.6, len + 0.15, { color: col('#e8e0d0').multiplyScalar(rng.range(0.9, 1.05)), aoBottom: 0.35 });
      b.box('stone', sm, rng.range(-0.05, 0.05), h + 0.02, 0, 0.6, 0.18, len * rng.range(0.6, 1), { color: col('#d0c8b8') });
      if (rng.chance(0.3)) b.box('foliagePlain', sm, 0, h + 0.12, rng.range(-len / 4, len / 4), 0.65, 0.12, 0.8, { color: col('#4a6e2c') });
      top = h + 0.1;
    } else {
      const h = rng.range(1.3, 1.7);
      b.box('foliagePlain', sm, 0, h / 2 - 0.2, 0, 1.1, h + 0.4, len + 0.4, { color: col('#3f6a2a').multiplyScalar(rng.range(0.85, 1.15)), aoBottom: 0.45 });
      b.box('foliagePlain', sm, rng.range(-0.2, 0.2), h, rng.range(-0.4, 0.4), 0.9, 0.5, len * 0.7, { color: col('#5a8a34') });
      top = h + 0.2;
    }
    world.addBox({ x: mx, z: mz, yaw, hw: f.kind === 'hedge' ? 0.55 : f.kind === 'stone-wall' ? 0.38 : 0.12, hd: len / 2 + 0.05, y0: Math.min(ya, yc) - 0.5, y1: Math.max(ya, yc) + top, tag: f.id });
  }
}

/** Road surface ribbons with ragged alpha-tested edges, conforming to final terrain. */
function* roadRibbons(plan: WorldContent, terrain: TerrainLike, group: THREE.Group): Generator<void, void, void> {
  const t = getTextures();
  // Streets through hamlets and villages are cobbled.
  const towns = plan.settlements.filter((s) => s.kind === 'hamlet' || s.kind === 'village');
  const edgeTex = (() => {
    const w = 64;
    const h = 64;
    const data = new Uint8Array(w * h * 4);
    const rng = new Rng(0xed6e);
    for (let y = 0; y < h; y++) {
      const jitterL = rng.range(0, 0.16);
      const jitterR = rng.range(0, 0.16);
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        const edge = u < 0.5 ? u / 0.16 - jitterL * 4 : (1 - u) / 0.16 - jitterR * 4;
        const v = edge > 0.5 || rng.next() < edge ? 255 : 0;
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  })();
  const mats = new Map<string, THREE.Material>();
  const matFor = (surface: 'dirt' | 'cobble', halfW: number): THREE.Material => {
    const key = `${surface}:${halfW}`;
    let m = mats.get(key);
    if (m) return m;
    const map = surface === 'dirt' ? t.dirt.clone() : t.cobble.clone();
    map.repeat.set(surface === 'dirt' ? 1 / 4 : 1 / 2.6, surface === 'dirt' ? 1 / 4 : 1 / 2.6);
    map.needsUpdate = true;
    const alpha = edgeTex.clone();
    alpha.repeat.set(1 / (halfW * 2), 1 / 6);
    alpha.offset.set(0.5, 0);
    alpha.needsUpdate = true;
    m = patchMaterial(
      new THREE.MeshLambertMaterial({ map, alphaMap: alpha, alphaTest: 0.5, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    );
    mats.set(key, m);
    return m;
  };
  const across = [-1, -0.5, 0, 0.5, 1];
  for (const road of plan.roads) {
    const halfW = road.halfWidth + 0.45;
    const chunk = 50;
    for (let start = 0; start < road.points.length - 1; start += chunk) {
      const end = Math.min(road.points.length - 1, start + chunk);
      const midP = road.points[Math.floor((start + end) / 2)]!;
      const cobbled = road.kind === 'trade-road' && towns.some((tw) => Math.hypot(midP.x - tw.x, midP.z - tw.z) < 80);
      const pos: number[] = [];
      const nrm: number[] = [];
      const uv: number[] = [];
      const colr: number[] = [];
      for (let i = start; i <= end; i++) {
        const p = road.points[i]!;
        const q = road.points[Math.min(i + 1, road.points.length - 1)]!;
        const o = road.points[Math.max(i - 1, 0)]!;
        const tx = q.x - o.x;
        const tz = q.z - o.z;
        const tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl;
        const nz = tx / tl;
        for (const a of across) {
          const x = p.x + nx * a * halfW;
          const z = p.z + nz * a * halfW;
          const y = terrain.height(x, z) + 0.05;
          pos.push(x, y, z);
          nrm.push(0, 1, 0);
          uv.push(a * halfW, road.arc[i]!);
          // Wheel ruts: slightly darker bands either side of the crown.
          const rut = road.kind !== 'footpath' && Math.abs(Math.abs(a) - 0.5) < 0.01 ? 0.86 : 1;
          const c = (Math.abs(a) > 0.99 ? 0.9 : 1) * rut;
          colr.push(c, c * 0.98, c * 0.95);
        }
      }
      // Normals from neighbouring ribbon vertices (one height sample per vertex).
      const cols = across.length;
      const rows = end - start + 1;
      const at = (r: number, c: number): number => (Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))) * 3;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const a0 = at(r - 1, c);
          const a1 = at(r + 1, c);
          const b0 = at(r, c - 1);
          const b1 = at(r, c + 1);
          const ux = pos[a1]! - pos[a0]!;
          const uy = pos[a1 + 1]! - pos[a0 + 1]!;
          const uz = pos[a1 + 2]! - pos[a0 + 2]!;
          const vx = pos[b1]! - pos[b0]!;
          const vy = pos[b1 + 1]! - pos[b0 + 1]!;
          const vz = pos[b1 + 2]! - pos[b0 + 2]!;
          let nx2 = uy * vz - uz * vy;
          let ny2 = uz * vx - ux * vz;
          let nz2 = ux * vy - uy * vx;
          if (ny2 < 0) {
            nx2 = -nx2;
            ny2 = -ny2;
            nz2 = -nz2;
          }
          const l = Math.hypot(nx2, ny2, nz2) || 1;
          const o = (r * cols + c) * 3;
          nrm[o] = nx2 / l;
          nrm[o + 1] = ny2 / l;
          nrm[o + 2] = nz2 / l;
        }
      const idx: number[] = [];
      for (let i = 0; i < end - start; i++) {
        for (let k = 0; k < cols - 1; k++) {
          const a = i * cols + k;
          const b2 = a + 1;
          const c = a + cols;
          const d = c + 1;
          idx.push(a, b2, c, b2, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, matFor(cobbled ? 'cobble' : 'dirt', halfW));
      mesh.receiveShadow = true;
      mesh.name = `road ${road.name}`;
      group.add(mesh);
      yield;
    }
  }
}

export interface StructureOptions {
  /** The tree the player wakes beneath (the vale only). */
  ancientTree?: P2;
}

export function buildStructures(plan: WorldContent, terrain: TerrainLike, materials: MaterialLibrary, world: CollisionWorld, opts: StructureOptions = {}): StructureResult {
  const steps = buildStructureSteps(plan, terrain, materials, world, opts);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * The same build as a sequence of small steps, so a streamed region can be
 * raised over several frames. The collision group must stay set while it runs.
 */
export function* buildStructureSteps(plan: WorldContent, terrain: TerrainLike, materials: MaterialLibrary, world: CollisionWorld, opts: StructureOptions = {}): Generator<void, StructureResult, void> {
  const group = new THREE.Group();
  group.name = 'structures';
  const smoke: THREE.Vector3[] = [];
  const village = new MeshBuilder();
  for (const bp of plan.buildings) {
    const r = buildBuilding(village, bp);
    r.colliders.forEach((c, i) => addBox(world, c, `${bp.id}/c${i}`));
    if (r.chimneyTop && bp.inhabited) smoke.push(r.chimneyTop);
    yield;
  }
  for (const ruin of plan.ruins) {
    // The doorway faces the nearest road (or the ruin's own heading where no road comes).
    let best: P2 = { x: ruin.x + Math.sin(ruin.yaw) * 10, z: ruin.z + Math.cos(ruin.yaw) * 10 };
    let bd = 400;
    for (const road of plan.roads)
      for (const p of road.points) {
        const d = Math.hypot(p.x - ruin.x, p.z - ruin.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
    ruinTower(village, ruin, world, best);
    yield;
  }
  let k = 0;
  for (const p of plan.props) {
    prop(village, p, terrain, world);
    if (++k % 12 === 0) yield;
  }
  for (const f of plan.fences) {
    fence(village, f, terrain, world);
    yield;
  }

  let triangles = 0;
  const emit = (builder: MeshBuilder, name: string, castShadow: boolean): void => {
    for (const [key, geo] of builder.build()) {
      const mesh = new THREE.Mesh(geo, materials.get(key as MaterialName));
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.name = `${name}:${key}`;
      group.add(mesh);
      triangles += geo.getAttribute('position').count / 3;
    }
  };
  emit(village, 'village', true);
  yield;

  // The ancient tree the player wakes beneath.
  if (opts.ancientTree) {
    const at = opts.ancientTree;
    const ancient = generateTree('ancient', 0);
    const ay = terrain.height(at.x, at.z);
    for (const [key, geo] of ancient.near) {
      const mesh = new THREE.Mesh(geo, materials.get(key));
      mesh.position.set(at.x, ay - 0.3, at.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const depth = materials.depth(key);
      if (depth) mesh.customDepthMaterial = depth;
      mesh.name = `ancient-tree:${key}`;
      group.add(mesh);
      triangles += geo.getAttribute('position').count / 3;
    }
    world.addCircle({ x: at.x, z: at.z, r: ancient.trunkRadius * 1.15, y0: ay - 2, y1: ay + 30, tag: 'ancient-tree' });
  }

  yield* roadRibbons(plan, terrain, group);

  return { group, smoke, spireTips: [], stats: { buildings: plan.buildings.length, colliders: 0, triangles } };
}

/** A castle's meshes and colliders (castles are landmarks, built from far away). */
export function buildCastleStructure(castle: CastlePlan, materials: MaterialLibrary, world: CollisionWorld): { group: THREE.Group; spireTips: THREE.Vector3[]; triangles: number } {
  const group = new THREE.Group();
  group.name = `castle ${castle.name}`;
  const b = new MeshBuilder();
  const built = buildCastle(b, castle);
  for (const c of built.boxes) world.addBox({ ...c, tag: castle.id });
  for (const c of built.circles) world.addCircle({ ...c, tag: castle.id });
  let triangles = 0;
  for (const [key, geo] of b.build()) {
    const mesh = new THREE.Mesh(geo, materials.get(key as MaterialName));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = `castle:${key}`;
    group.add(mesh);
    triangles += geo.getAttribute('position').count / 3;
  }
  return { group, spireTips: built.spireTips, triangles };
}
