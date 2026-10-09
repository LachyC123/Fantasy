/**
 * Site generators: each turns a site seed (kind, name, position) into
 * concrete content in a ContentBuilder — buildings along the streets of a
 * village, a farm with its track and fields, a ruined tower, a ring of
 * standing stones, a wayside shrine, an abandoned camp — plus the weapon
 * finds and chests that reward finding them. Luck is local: every find rolls
 * with the region's fortune plus the site's own temperament.
 */
import { deriveSeed, Rng } from '../core/rng';
import { ContentBuilder, buildingObb, facing } from './contentBuilder';
import type { SiteSeed } from './regions';
import type { CastlePlan, FieldPlan, FencePlan, P2, PropPlan, RoadPlan, SiteKind, WeaponFind } from './types';
import { obbOverlap } from './geometry2d';

export interface SiteContext {
  cb: ContentBuilder;
  fortune: number;
}

const DISCOVERY: Record<SiteKind, number> = {
  village: 95,
  hamlet: 90,
  farmstead: 70,
  cottage: 30,
  watchtower: 34,
  castle: 0,
  stones: 32,
  shrine: 20,
  camp: 28,
  crossroads: 20,
};

function addSite(cb: ContentBuilder, s: SiteSeed, kind: SiteKind, radius = DISCOVERY[kind]): void {
  cb.c.sites.push({ id: s.id, kind, name: s.name, x: s.x, z: s.z, radius });
}

function lootSeed(s: SiteSeed, k: number): number {
  return deriveSeed(String(s.seed), 'loot', k);
}

function pushFind(cb: ContentBuilder, f: WeaponFind): void {
  cb.c.finds.push(f);
}

/** A chest with a weapon inside. Luck is wilder than for things left lying about. */
function addChest(cb: ContentBuilder, s: SiteSeed, k: number, x: number, z: number, yaw: number, luck: number, story: string): void {
  const id = `${s.id}/chest${k}`;
  cb.c.props.push({ id, kind: 'chest', x, z, yaw });
  pushFind(cb, { id: `${id}/find`, x, z, yaw, pose: 'chest', seed: lootSeed(s, k), luck, story });
}

/** Road samples within `radius` of a point, every `step` samples. */
function roadFramesNear(cb: ContentBuilder, x: number, z: number, radius: number, step: number): { road: RoadPlan; i: number; d: number }[] {
  const out: { road: RoadPlan; i: number; d: number }[] = [];
  for (const road of cb.c.roads) {
    if (road.kind === 'footpath') continue;
    for (let i = 3; i < road.points.length - 3; i += step) {
      const p = road.points[i]!;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) out.push({ road, i, d });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

// ---------------------------------------------------------------- village

export function populateVillage(ctx: SiteContext, s: SiteSeed): void {
  const { cb } = ctx;
  const rng = new Rng(s.seed);
  const sid = s.id;
  const ids: string[] = [];
  const R = 88;
  const frames = roadFramesNear(cb, s.x, s.z, R, 8);
  const civic: { kind: 'church' | 'inn'; w: [number, number]; d: [number, number]; setback: [number, number] }[] = [
    { kind: 'church', w: [17, 21], d: [8, 9.5], setback: [6, 9] },
    { kind: 'inn', w: [12, 14], d: [8.5, 9.5], setback: [3.2, 4.5] },
  ];
  let inn: { x: number; z: number; yaw: number; w: number; d: number } | null = null;
  // Civic buildings take the plots nearest the centre.
  for (const c of civic) {
    for (const f of frames.slice(0, 16)) {
      const fr = ContentBuilder.frame(f.road, f.i);
      const side = rng.chance(0.5) ? 1 : -1;
      const w = rng.range(...c.w);
      const d = rng.range(...c.d);
      const off = f.road.halfWidth + rng.range(...c.setback) + d / 2;
      const x = fr.p.x + fr.nx * side * off;
      const z = fr.p.z + fr.nz * side * off;
      const yaw = facing(x, z, fr.p.x, fr.p.z) + rng.range(-0.04, 0.04);
      const b = cb.tryBuilding(sid, c.kind, x, z, yaw, w, d, rng, 2.4, 0.3);
      if (b) {
        ids.push(b.id);
        if (c.kind === 'inn') inn = { x, z, yaw, w, d };
        break;
      }
    }
  }
  // Houses line the streets, nearest plots first.
  const target = rng.int(7, 13);
  for (const f of frames) {
    if (ids.length >= target + 2) break;
    for (const side of [-1, 1]) {
      if (!rng.chance(0.75)) continue;
      const fr = ContentBuilder.frame(f.road, f.i);
      const large = rng.chance(0.25);
      const width = large ? rng.range(10, 13) : rng.range(6.5, 9);
      const depth = large ? rng.range(6.5, 7.5) : rng.range(5.5, 7);
      const off = f.road.halfWidth + rng.range(3.2, 6.5) + depth / 2;
      const x = fr.p.x + fr.nx * side * off;
      const z = fr.p.z + fr.nz * side * off;
      const yaw = facing(x, z, fr.p.x, fr.p.z) + rng.range(-0.08, 0.08);
      const b = cb.tryBuilding(sid, large ? 'longhouse' : 'cottage', x, z, yaw, width, depth, rng, 2.2, 0.32);
      if (!b) continue;
      ids.push(b.id);
      if (rng.chance(0.45)) {
        const bp = cb.local(width / 2 + 1.1, depth / 2 - 0.5, yaw, x, z);
        cb.c.props.push({ id: `${b.id}/barrel`, kind: 'barrel', x: bp.x, z: bp.z, yaw: rng.range(0, 6) });
      }
      if (rng.chance(0.4)) {
        const wp = cb.local(-width / 2 - 1.2, -depth / 4, yaw, x, z);
        cb.c.props.push({ id: `${b.id}/woodpile`, kind: 'woodpile', x: wp.x, z: wp.z, yaw: yaw + Math.PI / 2 });
      }
    }
  }
  // Lanterns along the street.
  let li = 0;
  for (const f of roadFramesNear(cb, s.x, s.z, R * 0.8, 11)) {
    if (f.road.kind !== 'trade-road') continue;
    const fr = ContentBuilder.frame(f.road, f.i);
    const side = li % 2 ? 1 : -1;
    const off = f.road.halfWidth + 1.2;
    const x = fr.p.x + fr.nx * side * off;
    const z = fr.p.z + fr.nz * side * off;
    if (cb.c.buildings.some((b) => obbOverlap(buildingObb(b), { x, z, yaw: 0, hw: 0.5, hd: 0.5 }, 1.2))) continue;
    if (cb.c.props.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
    cb.c.props.push({ id: `${sid}/lantern${li++}`, kind: 'lantern', x, z, yaw: facing(x, z, fr.p.x, fr.p.z) });
  }
  // Well on the green.
  const near = cb.nearestRoadPoint(s.x, s.z, ['trade-road']);
  if (near) {
    const fr = ContentBuilder.frame(near.road, near.index);
    for (const side of [1, -1]) {
      const w = { x: fr.p.x + fr.nx * side * 8, z: fr.p.z + fr.nz * side * 8 };
      if (cb.canPlace({ x: w.x, z: w.z, yaw: 0, hw: 1.4, hd: 1.4 }, 2, 0.3)) {
        cb.c.props.push({ id: `${sid}/well`, kind: 'well', x: w.x, z: w.z, yaw: 0 });
        break;
      }
    }
  }
  // A chest behind the inn: the landlord's lost-and-found.
  if (inn) {
    const p = cb.local(inn.w / 2 + 1.6, -inn.d / 2 + 1, inn.yaw, inn.x, inn.z);
    if (cb.canPlace({ x: p.x, z: p.z, yaw: inn.yaw, hw: 0.6, hd: 0.45 }, 1.2, 0.4)) addChest(cb, s, 0, p.x, p.z, inn.yaw + Math.PI / 2, ctx.fortune - 0.3 + rng.gaussian(0, 0.6), 'The landlord’s lost-and-found chest, never claimed.');
  }
  // Village signs where streets leave the village.
  let si = 0;
  for (const road of cb.c.roads) {
    if (road.kind !== 'trade-road') continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = Math.hypot(road.points[i - 1]!.x - s.x, road.points[i - 1]!.z - s.z);
      const b = Math.hypot(road.points[i]!.x - s.x, road.points[i]!.z - s.z);
      if ((a < R) === (b < R)) continue;
      const fr = ContentBuilder.frame(road, i);
      const x = fr.p.x + fr.nx * (road.halfWidth + 1.8);
      const z = fr.p.z + fr.nz * (road.halfWidth + 1.8);
      if (cb.c.props.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) continue;
      if (cb.c.buildings.some((bd) => obbOverlap(buildingObb(bd), { x, z, yaw: 0, hw: 0.4, hd: 0.4 }, 1.5))) continue;
      cb.c.props.push({ id: `${sid}/sign${si++}`, kind: 'signpost', x, z, yaw: facing(0, 0, fr.tx, fr.tz), label: s.name, text: `“${s.name}” — the village sign, freshly painted.` });
    }
  }
  cb.c.settlements.push({ id: sid, name: s.name, kind: 'village', x: s.x, z: s.z, buildingIds: ids });
  cb.c.clearings.push({ x: s.x, z: s.z, radius: 85 });
  addSite(cb, s, 'village');
}

// ---------------------------------------------------------------- farmstead

export function populateFarmstead(ctx: SiteContext, s: SiteSeed): void {
  const { cb } = ctx;
  const fr = new Rng(s.seed);
  const yard: P2 = { x: s.x, z: s.z };
  const near = cb.nearestRoadPoint(s.x, s.z, ['trade-road', 'farm-track']);
  const yardYaw = near ? facing(yard.x, yard.z, near.p.x, near.p.z) : fr.range(0, Math.PI * 2);
  const ids: string[] = [];
  // Track first, so buildings and fields are planned around it.
  if (near && near.dist < 420) {
    const front = cb.local(0, 4, yardYaw, yard.x, yard.z);
    cb.route({ id: `${s.id}/track`, name: `${s.name} Track`, kind: 'farm-track', from: s.id, start: front, allow: [s.id], lead: [cb.local(0, 24, yardYaw, yard.x, yard.z)] });
  }
  const add = (kind: 'farmhouse' | 'barn' | 'shed', lx: number, lz: number, w: number, d: number, yawOffset: number): void => {
    const pos = cb.local(lx, lz, yardYaw, yard.x, yard.z);
    const b = cb.tryBuilding(s.id, kind, pos.x, pos.z, yardYaw + yawOffset, w, d, fr, 2.5, 0.4);
    if (b) ids.push(b.id);
  };
  add('farmhouse', 0, -13, fr.range(10, 12), fr.range(7, 8), 0);
  add('barn', -14.5, 0, fr.range(9, 11), fr.range(13, 15), Math.PI / 2);
  add('shed', 13.5, 1, fr.range(5, 6), fr.range(4.5, 5.5), -Math.PI / 2);
  if (!ids.length) {
    // Nothing could be built here after all: leave no track to nowhere.
    cb.removeRoad(`${s.id}/track`);
    return;
  }
  const place = (kind: PropPlan['kind'], name: string, lx: number, lz: number, yaw: number): void => {
    const w = cb.local(lx, lz, yardYaw, yard.x, yard.z);
    if (cb.canPlace({ x: w.x, z: w.z, yaw, hw: 1.2, hd: 1.2 }, 1.5, 0.45)) cb.c.props.push({ id: `${s.id}/${name}`, kind, x: w.x, z: w.z, yaw });
  };
  place('haystack', 'hay-0', -11, -13.5, fr.range(0, 6));
  place('cart', 'cart', 7, 9, yardYaw + fr.range(-0.6, 0.6));
  place('woodpile', 'woodpile', 8.6, -12.5, yardYaw);
  const crops: FieldPlan['crop'][] = ['wheat', 'barley', 'fallow', 'wheat', 'cabbage', 'barley'];
  let fi = 0;
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -2; gz <= 1; gz++) {
      if (Math.abs(gx) <= 1 && gz >= -1) continue;
      const w = fr.range(28, 40);
      const d = fr.range(34, 48);
      const lp = { x: gx * 44 + fr.range(-3, 3), z: gz * 54 - 18 + fr.range(-3, 3) };
      const pos = cb.local(lp.x, lp.z, yardYaw, yard.x, yard.z);
      const field: FieldPlan = { id: `${s.id}/field${fi}`, x: pos.x, z: pos.z, yaw: yardYaw + fr.range(-0.05, 0.05), width: w, depth: d, crop: fr.pick(crops) };
      if (!cb.canPlace({ x: field.x, z: field.z, yaw: field.yaw, hw: w / 2, hd: d / 2 }, 4, 0.2)) continue;
      cb.c.fields.push(field);
      fi++;
      const corners = [
        cb.local(-w / 2, -d / 2, field.yaw, field.x, field.z),
        cb.local(w / 2, -d / 2, field.yaw, field.x, field.z),
        cb.local(w / 2, d / 2, field.yaw, field.x, field.z),
        cb.local(-w / 2, d / 2, field.yaw, field.x, field.z),
      ];
      const kind = fr.weighted<FencePlan['kind']>(['hedge', 'wood-fence', 'stone-wall'], [3, 2, 2]);
      const startEdge = fr.int(0, 3);
      cb.c.fences.push({ id: `${s.id}/fence${fi}`, kind, points: [corners[startEdge]!, corners[(startEdge + 1) % 4]!, corners[(startEdge + 2) % 4]!] });
    }
  }
  const barn = cb.c.buildings.find((b) => b.kind === 'barn' && b.settlementId === s.id);
  if (barn && fr.chance(0.55)) {
    const w = cb.local(barn.width / 2 - 1.4, barn.depth / 2 + 0.35, barn.yaw, barn.x, barn.z);
    pushFind(cb, { id: `${s.id}/find-barn`, x: w.x, z: w.z, yaw: barn.yaw, pose: 'leaning', seed: lootSeed(s, 1), luck: ctx.fortune - 0.8, cls: fr.chance(0.5) ? 'spear' : 'axe', story: 'Left leaning against the barn wall.' });
  }
  cb.c.settlements.push({ id: s.id, name: s.name, kind: 'farmstead', x: yard.x, z: yard.z, buildingIds: ids });
  cb.c.clearings.push({ x: yard.x, z: yard.z, radius: 34 });
  addSite(cb, s, 'farmstead');
}

// ---------------------------------------------------------------- cottage

export function populateCottage(ctx: SiteContext, s: SiteSeed): void {
  const { cb } = ctx;
  const cr = new Rng(s.seed);
  const near = cb.nearestRoadPoint(s.x, s.z);
  const yaw = near ? facing(s.x, s.z, near.p.x, near.p.z) + cr.range(-0.3, 0.3) : cr.range(0, Math.PI * 2);
  const width = cr.range(6.5, 9);
  const depth = cr.range(5.5, 7);
  const b = cb.tryBuilding(s.id, 'cottage', s.x, s.z, yaw, width, depth, cr, 3, 0.3);
  if (!b) return;
  if (near && near.dist < 320) {
    const door = cb.local(0, depth / 2 + 3, yaw, s.x, s.z);
    cb.route({ id: `${s.id}/track`, name: 'Cottage Track', kind: 'farm-track', from: s.id, start: door, allow: [s.id] });
  }
  if (cr.chance(0.7)) {
    const wp = cb.local(width / 2 + 1.4, 0, yaw, s.x, s.z);
    cb.c.props.push({ id: `${b.id}/woodpile`, kind: 'woodpile', x: wp.x, z: wp.z, yaw: yaw + Math.PI / 2 });
  }
  if (cr.chance(0.5)) {
    const w = cb.local(-width / 2 - 2.6, depth / 2 - 1, yaw, s.x, s.z);
    cb.c.props.push({ id: `${s.id}/chopping-block`, kind: 'chopping-block', x: w.x, z: w.z, yaw });
    pushFind(cb, { id: `${s.id}/find`, x: w.x, z: w.z, yaw: yaw + 0.3, pose: 'stuck', seed: lootSeed(s, 1), luck: ctx.fortune - 1.2, cls: 'axe', story: 'Buried in a cottager’s chopping block.' });
  }
  cb.c.settlements.push({ id: s.id, name: s.name, kind: 'farmstead', x: s.x, z: s.z, buildingIds: [b.id] });
  cb.c.clearings.push({ x: s.x, z: s.z, radius: 18 });
  addSite(cb, s, 'cottage');
}

// ---------------------------------------------------------------- ruined watchtower

export function populateWatchtower(ctx: SiteContext, s: SiteSeed, connect: boolean): void {
  const { cb } = ctx;
  const rng = new Rng(s.seed);
  cb.c.ruins.push({ id: s.id, name: s.name, kind: 'watchtower', x: s.x, z: s.z, yaw: rng.range(0, Math.PI * 2), radius: rng.range(4.2, 5.2), height: rng.range(9, 15), padHeight: 0, seed: rng.int(0, 2 ** 31) });
  if (connect) {
    const near = cb.nearestRoadPoint(s.x, s.z);
    if (near && near.dist < 600) {
      const a = Math.atan2(near.p.x - s.x, near.p.z - s.z);
      const start = { x: s.x + Math.sin(a) * 9, z: s.z + Math.cos(a) * 9 };
      cb.route({ id: `${s.id}/path`, name: `Path to ${s.name}`, kind: 'footpath', from: s.id, start, allow: [s.id] });
    }
  }
  const a = rng.range(0, Math.PI * 2);
  if (rng.chance(0.35)) addChest(cb, s, 0, s.x + Math.sin(a) * 1.6, s.z + Math.cos(a) * 1.6, a, ctx.fortune + 0.5 + rng.gaussian(0, 0.9), 'A strongbox hidden under the tower’s fallen stair.');
  else pushFind(cb, { id: `${s.id}/find`, x: s.x + Math.sin(a) * 0.9, z: s.z + Math.cos(a) * 0.9, yaw: rng.range(0, 6.28), pose: 'lying', seed: lootSeed(s, 1), luck: ctx.fortune + 0.4, story: 'Half-buried in the tower’s rubble.' });
  cb.c.clearings.push({ x: s.x, z: s.z, radius: 14 });
  addSite(cb, s, 'watchtower');
}

// ---------------------------------------------------------------- castle

export function populateCastle(ctx: SiteContext, s: SiteSeed, castle: CastlePlan): void {
  const { cb } = ctx;
  const rng = new Rng(s.seed ^ 0x9e3779b9);
  const g = castle.gate;
  pushFind(cb, { id: `${s.id}/find-gate`, x: g.x + Math.sin(g.yaw) * 9 + rng.range(-2, 2), z: g.z + Math.cos(g.yaw) * 9, yaw: rng.range(0, 6.28), pose: 'stuck', seed: lootSeed(s, 1), luck: ctx.fortune + 1.4, story: 'Driven point-first into the earth before the shut gate.' });
  cb.c.clearings.push({ x: castle.x, z: castle.z, radius: castle.plateauRadius + 4 });
  cb.c.sites.push({ id: s.id, kind: 'castle', name: castle.name, x: castle.x, z: castle.z, radius: castle.plateauRadius + 60 });
}

// ---------------------------------------------------------------- standing stones

export function populateStones(ctx: SiteContext, s: SiteSeed, connect: boolean): void {
  const { cb } = ctx;
  const rng = new Rng(s.seed);
  const n = rng.int(7, 12);
  const r = rng.range(6.5, 9.5);
  const fallen = rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.08, 0.08);
    const rr = r + rng.range(-0.4, 0.4);
    cb.c.props.push({ id: `${s.id}/stone${i}`, kind: 'standing-stone', x: s.x + Math.sin(a) * rr, z: s.z + Math.cos(a) * rr, yaw: a + rng.range(-0.2, 0.2), scale: i < fallen ? -rng.range(0.8, 1.2) : rng.range(0.8, 1.6) });
  }
  if (connect) {
    const near = cb.nearestRoadPoint(s.x, s.z);
    if (near && near.dist < 500) {
      const a = Math.atan2(near.p.x - s.x, near.p.z - s.z);
      cb.route({ id: `${s.id}/path`, name: `Path to ${s.name}`, kind: 'footpath', from: s.id, start: { x: s.x + Math.sin(a) * (r + 3), z: s.z + Math.cos(a) * (r + 3) }, allow: [s.id] });
    }
  }
  // At the heart of the ring: something left for whoever finds it. Old magic cuts both ways.
  pushFind(cb, { id: `${s.id}/find`, x: s.x, z: s.z, yaw: rng.range(0, 6.28), pose: 'lying', seed: lootSeed(s, 1), luck: ctx.fortune + rng.gaussian(0.3, 1.6), story: 'Laid at the heart of the stone ring. The air hums around it.' });
  cb.c.clearings.push({ x: s.x, z: s.z, radius: r + 7 });
  addSite(cb, s, 'stones');
}

// ---------------------------------------------------------------- wayside shrine

export function populateShrine(ctx: SiteContext, s: SiteSeed, connect: boolean): void {
  const { cb } = ctx;
  const rng = new Rng(s.seed);
  const near = cb.nearestRoadPoint(s.x, s.z);
  const yaw = near ? facing(s.x, s.z, near.p.x, near.p.z) : rng.range(0, Math.PI * 2);
  cb.c.props.push({ id: `${s.id}/shrine`, kind: 'shrine', x: s.x, z: s.z, yaw, text: `${s.name}. Candle stubs, a bowl of rainwater, and names scratched into the stone.` });
  if (connect && near && near.dist < 400) {
    cb.route({ id: `${s.id}/path`, name: `Path to ${s.name}`, kind: 'footpath', from: s.id, start: cb.local(0, 4, yaw, s.x, s.z), allow: [s.id] });
  }
  if (rng.chance(0.7)) {
    const p = cb.local(0.4, 1.5, yaw, s.x, s.z);
    pushFind(cb, { id: `${s.id}/find`, x: p.x, z: p.z, yaw: yaw + 1.2, pose: 'lying', seed: lootSeed(s, 1), luck: ctx.fortune + 0.8, story: 'Left at the shrine as an offering.' });
  }
  cb.c.clearings.push({ x: s.x, z: s.z, radius: 8 });
  addSite(cb, s, 'shrine');
}

// ---------------------------------------------------------------- abandoned camp

export function populateCamp(ctx: SiteContext, s: SiteSeed, connect: boolean): void {
  const { cb } = ctx;
  const rng = new Rng(s.seed);
  cb.c.props.push({ id: `${s.id}/fire`, kind: 'campfire', x: s.x, z: s.z, yaw: 0 });
  const tents = rng.int(1, 3);
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < tents; i++) {
    const a = a0 + (i / tents) * Math.PI * 1.4;
    const x = s.x + Math.sin(a) * 6;
    const z = s.z + Math.cos(a) * 6;
    cb.c.props.push({ id: `${s.id}/tent${i}`, kind: 'tent', x, z, yaw: facing(x, z, s.x, s.z) });
  }
  const ca = a0 - 0.9;
  addChest(cb, s, 0, s.x + Math.sin(ca) * 4.2, s.z + Math.cos(ca) * 4.2, ca + Math.PI, ctx.fortune + rng.gaussian(0, 1.3), 'A traveller’s chest, abandoned in a hurry.');
  if (rng.chance(0.6)) cb.c.props.push({ id: `${s.id}/woodpile`, kind: 'woodpile', x: s.x + Math.sin(a0 + 3.4) * 5, z: s.z + Math.cos(a0 + 3.4) * 5, yaw: a0 });
  if (connect) {
    const near = cb.nearestRoadPoint(s.x, s.z);
    if (near && near.dist < 350) {
      const a = Math.atan2(near.p.x - s.x, near.p.z - s.z);
      cb.route({ id: `${s.id}/path`, name: `Path to ${s.name}`, kind: 'footpath', from: s.id, start: { x: s.x + Math.sin(a) * 10, z: s.z + Math.cos(a) * 10 }, allow: [s.id] });
    }
  }
  cb.c.clearings.push({ x: s.x, z: s.z, radius: 14 });
  addSite(cb, s, 'camp');
}

/** Small levelled pads that keep camps and shrines from sitting on a tilt. */
export function siteLevelPads(cb: ContentBuilder): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const s of cb.c.sites) {
    if (s.kind === 'camp') out.push({ x: s.x, z: s.z, r: 8 });
    else if (s.kind === 'shrine') out.push({ x: s.x, z: s.z, r: 2.5 });
  }
  return out;
}
