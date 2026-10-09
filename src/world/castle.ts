/**
 * Logical plan for the great Gothic castle on the crag. A defensible layout is
 * generated first (gate → curtain wall → towers → keep → cathedral hall); the
 * renderer only builds meshes from this record.
 */
import { Rng, deriveSeed } from '../core/rng';
import type { MacroField } from './macro';
import type { CastlePlan, CastleTower, P2 } from './types';
import { castleName } from './names';

export function localToWorld(lx: number, lz: number, yaw: number, ox = 0, oz = 0): P2 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: ox + c * lx + s * lz, z: oz - s * lx + c * lz };
}

/** The vale's great castle on its authored crag. */
export function planCastle(seed: string, macro: MacroField): CastlePlan {
  const rng = new Rng(deriveSeed(seed, 'castle/v1'));
  const p = macro.params;
  const c = macro.castle;
  // The gate faces down the valley towards the spawn, whichever way the vale lies.
  return planCastleAt({ id: `${seed}/castle/0`, rng, x: c.x, z: c.z, radius: p.plateauRadius, yaw: macro.yawToWorld(rng.range(-0.12, 0.12)), great: true, height: (x, z) => macro.height(x, z), name: castleName });
}

export interface CastleSiteOptions {
  id: string;
  rng: Rng;
  x: number;
  z: number;
  radius: number;
  /** Rotation; the gate faces local +Z. */
  yaw: number;
  /** A great castle (cathedral, soaring spires) or a smaller hill keep. */
  great: boolean;
  height: (x: number, z: number) => number;
  name: (rng: Rng) => string;
}

/** Plan a castle on any summit. Layout is generated first; meshes are built from this record. */
export function planCastleAt(o: CastleSiteOptions): CastlePlan {
  const { rng, yaw } = o;
  const R = o.radius;
  const s = o.great ? 1 : 0.62;

  // Summit height: average of the ground across the summit.
  let sum = 0;
  let count = 0;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = i === 0 ? 0 : R * 0.55;
    sum += o.height(o.x + Math.cos(a) * r, o.z + Math.sin(a) * r);
    count++;
  }
  const plateauHeight = sum / count;

  // Curtain wall: irregular ring, vertex 0 sits at the gate (local +Z).
  const n = o.great ? rng.int(7, 9) : rng.int(5, 7);
  const wall: P2[] = [];
  const towers: CastleTower[] = [];
  const wallHeight = o.great ? rng.range(20, 25) : rng.range(11, 15);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i === 0 ? 0 : rng.range(-0.12, 0.12));
    const r = (R - 9) * (i === 0 ? 1 : rng.range(0.86, 1.0));
    const lx = Math.sin(a) * r;
    const lz = Math.cos(a) * r;
    wall.push({ x: lx, z: lz });
    if (i === 0) continue;
    const square = rng.chance(0.25);
    towers.push({
      x: lx,
      z: lz,
      radius: (square ? rng.range(5, 6.5) : rng.range(5.5, 7.5)) * (o.great ? 1 : 0.75),
      height: wallHeight + rng.range(14, 34) * s,
      roof: square ? 'crown' : rng.chance(0.75) ? 'spire' : 'crown',
      square,
    });
  }
  // Twin gate towers flanking the gate passage.
  const gateR = R - 9;
  for (const side of [-1, 1]) {
    towers.push({ x: side * 9 * (o.great ? 1 : 0.8), z: gateR - 1, radius: o.great ? 5.6 : 4.4, height: wallHeight + 16 * s, roof: 'spire', square: false });
  }

  // Keep at the rear, cathedral hall offset, slender inner towers.
  const keep = {
    x: rng.range(-15, 15) * s,
    z: -R * rng.range(0.3, 0.42),
    w: rng.range(26, 34) * s,
    d: rng.range(22, 28) * s,
    h: rng.range(58, 72) * (o.great ? 1 : 0.6),
  };
  const side = rng.chance(0.5) ? -1 : 1;
  // Great castles raise a cathedral hall; hill keeps a modest chapel.
  const cathedral = o.great
    ? { x: side * rng.range(22, 34), z: rng.range(-5, 15), length: rng.range(58, 72), width: rng.range(17, 21), height: rng.range(42, 50), spire: rng.range(215, 245), yaw: rng.range(-0.1, 0.1) }
    : { x: side * rng.range(14, 18), z: rng.range(-2, 8), length: rng.range(20, 26), width: rng.range(9, 11), height: rng.range(16, 20), spire: rng.range(42, 60), yaw: rng.range(-0.1, 0.1) };
  const inner = o.great ? rng.int(2, 3) : rng.int(0, 1);
  for (let i = 0; i < inner; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(R * 0.25, R * 0.5);
    const lx = Math.sin(a) * r;
    const lz = Math.cos(a) * r;
    // Keep inner towers out of the cathedral footprint and the gate court.
    if (Math.abs(lx - cathedral.x) < cathedral.width && Math.abs(lz - cathedral.z) < cathedral.length / 2 + 6) continue;
    if (lz > R * 0.45) continue;
    towers.push({ x: lx, z: lz, radius: rng.range(4.5, 6.5) * (o.great ? 1 : 0.7), height: rng.range(85, 140) * (o.great ? 1 : 0.45), roof: 'spire', square: rng.chance(0.3) });
  }

  const gate = localToWorld(0, gateR + 2, yaw, o.x, o.z);
  return {
    id: o.id,
    name: o.name(rng),
    x: o.x,
    z: o.z,
    yaw,
    plateauRadius: R,
    plateauHeight,
    seed: rng.int(0, 2 ** 31),
    wall,
    wallHeight,
    towers,
    keep,
    cathedral,
    gate: { x: gate.x, z: gate.z, yaw },
  };
}
