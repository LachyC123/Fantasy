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

export function planCastle(seed: string, macro: MacroField): CastlePlan {
  const rng = new Rng(deriveSeed(seed, 'castle/v1'));
  const p = macro.params;
  const R = p.plateauRadius;
  const yaw = rng.range(-0.12, 0.12);

  // Summit height: average of the macro field across the summit.
  let sum = 0;
  let count = 0;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = i === 0 ? 0 : R * 0.55;
    sum += macro.height(p.castleX + Math.cos(a) * r, p.castleZ + Math.sin(a) * r);
    count++;
  }
  const plateauHeight = sum / count;

  // Curtain wall: irregular ring, vertex 0 sits at the gate (local +Z).
  const n = rng.int(7, 9);
  const wall: P2[] = [];
  const towers: CastleTower[] = [];
  const wallHeight = rng.range(20, 25);
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
      radius: square ? rng.range(5, 6.5) : rng.range(5.5, 7.5),
      height: wallHeight + rng.range(14, 34),
      roof: square ? 'crown' : rng.chance(0.75) ? 'spire' : 'crown',
      square,
    });
  }
  // Twin gate towers flanking the gate passage.
  const gateR = R - 9;
  for (const side of [-1, 1]) {
    towers.push({ x: side * 9, z: gateR - 1, radius: 5.6, height: wallHeight + 16, roof: 'spire', square: false });
  }

  // Keep at the rear, cathedral hall offset, slender inner towers.
  const keep = {
    x: rng.range(-15, 15),
    z: -R * rng.range(0.3, 0.42),
    w: rng.range(26, 34),
    d: rng.range(22, 28),
    h: rng.range(58, 72),
  };
  const side = rng.chance(0.5) ? -1 : 1;
  const cathedral = {
    x: side * rng.range(22, 34),
    z: rng.range(-5, 15),
    length: rng.range(58, 72),
    width: rng.range(17, 21),
    height: rng.range(42, 50),
    spire: rng.range(215, 245),
    yaw: rng.range(-0.1, 0.1),
  };
  const inner = rng.int(2, 3);
  for (let i = 0; i < inner; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(R * 0.25, R * 0.5);
    const lx = Math.sin(a) * r;
    const lz = Math.cos(a) * r;
    // Keep inner towers out of the cathedral footprint and the gate court.
    if (Math.abs(lx - cathedral.x) < cathedral.width && Math.abs(lz - cathedral.z) < cathedral.length / 2 + 6) continue;
    if (lz > R * 0.45) continue;
    towers.push({ x: lx, z: lz, radius: rng.range(4.5, 6.5), height: rng.range(85, 140), roof: 'spire', square: rng.chance(0.3) });
  }

  const gate = localToWorld(0, gateR + 2, yaw, p.castleX, p.castleZ);
  return {
    id: `${seed}/castle/0`,
    name: castleName(rng),
    x: p.castleX,
    z: p.castleZ,
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
