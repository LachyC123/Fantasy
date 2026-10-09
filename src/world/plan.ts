/**
 * World plan for the opening anchor region.
 *
 * Pipeline (Section 56): seed → macro geography → castle reservation →
 * roads graded into terrain → settlement plots and building grammars →
 * fields, walls, props → clearings and sightlines → validation.
 * The result is plain data. `createTerrain(plan)` rebuilds the exact height
 * field from it.
 */
import { canonicalizeSeed, deriveSeed, GENERATOR_VERSION, Rng } from '../core/rng';
import { MacroField } from './macro';
import { planCastle, localToWorld } from './castle';
import { buildRoad, RoadIndex, type RoadSpec } from './roads';
import { Terrain } from './terrain';
import { obbOverlap, obbSamples, pointInObb, type Obb } from './geometry2d';
import { distSqToSegment } from '../core/math';
import { villageName, towerName, farmName, familyName } from './names';
import type {
  BuildingKind,
  BuildingPlan,
  CastlePlan,
  Clearing,
  FencePlan,
  FieldPlan,
  P2,
  Pad,
  PropPlan,
  RoadPlan,
  RuinPlan,
  SettlementPlan,
  WorldPlan,
  WallStyle,
  RoofMaterial,
  WeaponFind,
} from './types';

export const REFERENCE_SEED = 'reference-valley';

export function castlePad(c: CastlePlan): Pad {
  return { x: c.x, z: c.z, yaw: 0, halfW: c.plateauRadius, halfD: c.plateauRadius, circle: true, height: c.plateauHeight, falloff: 28 };
}

export function createTerrain(plan: WorldPlan, macro = new MacroField(plan.seed)): Terrain {
  return new Terrain(macro, [castlePad(plan.castle)], plan.roads, plan.pads);
}

const buildingObb = (b: { x: number; z: number; yaw: number; width: number; depth: number }): Obb => ({
  x: b.x,
  z: b.z,
  yaw: b.yaw,
  hw: b.width / 2,
  hd: b.depth / 2,
});

const facing = (fromX: number, fromZ: number, toX: number, toZ: number): number => Math.atan2(toX - fromX, toZ - fromZ);

interface PlanContext {
  seed: string;
  rng: Rng;
  macro: MacroField;
  buildings: BuildingPlan[];
  fields: FieldPlan[];
  ruins: RuinPlan[];
  /** Heights with roads applied (for seating buildings). */
  stageB: Terrain;
  roadIndex: RoadIndex;
  castle: CastlePlan;
}

function canPlaceFootprint(ctx: PlanContext, o: Obb, roadClear: number, maxSlope: number): boolean {
  for (const b of ctx.buildings) if (obbOverlap(o, buildingObb(b), 3)) return false;
  for (const f of ctx.fields) if (obbOverlap(o, { x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2, hd: f.depth / 2 }, 2)) return false;
  for (const r of ctx.ruins) if (Math.hypot(o.x - r.x, o.z - r.z) < r.radius + Math.max(o.hw, o.hd) + 8) return false;
  const pts = obbSamples(o, 2.5);
  let minH = Infinity;
  let maxH = -Infinity;
  for (const p of pts) {
    if (ctx.roadIndex.surfaceDistance(p.x, p.z) < roadClear) return false;
    const h = ctx.stageB.heightBeforeBuildings(p.x, p.z);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
  }
  const span = Math.max(o.hw, o.hd) * 2;
  return (maxH - minH) / span <= maxSlope;
}

function seatHeight(ctx: PlanContext, o: Obb): number {
  const pts = obbSamples(o, 2);
  let sum = 0;
  for (const p of pts) sum += ctx.stageB.heightBeforeBuildings(p.x, p.z);
  return sum / pts.length + 0.1;
}

function makeBuilding(
  ctx: PlanContext,
  settlementId: string,
  index: number,
  kind: BuildingKind,
  x: number,
  z: number,
  yaw: number,
  width: number,
  depth: number,
  rng: Rng,
): BuildingPlan {
  const isBarn = kind === 'barn' || kind === 'shed';
  const wallStyle: WallStyle = isBarn ? rng.pick<WallStyle>(['timber', 'stone']) : rng.weighted<WallStyle>(['stone', 'plaster', 'timber'], [4, 4, 1]);
  const floors = kind === 'shed' ? 1 : kind === 'barn' ? 1 : rng.chance(kind === 'farmhouse' ? 0.75 : 0.45) ? 2 : 1;
  const roof: RoofMaterial = isBarn ? rng.pick<RoofMaterial>(['thatch', 'tile']) : rng.weighted<RoofMaterial>(['tile', 'slate', 'thatch'], [5, 3, 2]);
  const plan: BuildingPlan = {
    id: `${ctx.seed}/${settlementId}/b${index}`,
    kind,
    x,
    z,
    yaw,
    width,
    depth,
    floors,
    wallStyle,
    upperStyle: floors > 1 && wallStyle !== 'timber' ? rng.weighted<WallStyle>(['plaster', 'timber', 'stone'], [5, 2, 1]) : wallStyle,
    roof,
    roofPitch: rng.range(0.75, 1.05) * (roof === 'thatch' ? 1.1 : 1),
    chimney: kind === 'shed' || kind === 'barn' ? 'none' : rng.chance(0.5) ? 'left' : 'right',
    padHeight: 0,
    seed: rng.int(0, 2 ** 31),
    enterable: false,
    settlementId,
    inhabited: !isBarn && rng.chance(0.85),
  };
  plan.padHeight = seatHeight(ctx, buildingObb(plan));
  return plan;
}

/** Index of the road sample nearest to a target Z (searching the whole road). */
function sampleNearZ(road: RoadPlan, z: number): number {
  let best = 0;
  let bestD = Infinity;
  road.points.forEach((p, i) => {
    const d = Math.abs(p.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function roadFrame(road: RoadPlan, i: number): { p: P2; tx: number; tz: number; nx: number; nz: number } {
  const a = road.points[Math.max(0, i - 2)]!;
  const b = road.points[Math.min(road.points.length - 1, i + 2)]!;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const tx = (b.x - a.x) / len;
  const tz = (b.z - a.z) / len;
  // Normal pointing to the road's right (east when heading north).
  return { p: road.points[i]!, tx, tz, nx: -tz, nz: tx };
}

export function generateWorldPlan(seedInput: string): WorldPlan {
  const seed = canonicalizeSeed(seedInput);
  const rng = new Rng(deriveSeed(seed, 'sites/v1'));
  const macro = new MacroField(seed);
  const castle = planCastle(seed, macro);
  const stageA = new Terrain(macro, [castlePad(castle)], [], []);
  const hA = (x: number, z: number): number => stageA.heightBeforeRoads(x, z);
  const cl = (z: number): number => macro.centerline(z);
  const j = (amount: number): number => rng.range(-amount, amount);

  // --- Spawn under the ancient tree -------------------------------------
  // The ancient tree stands a short walk inside the forest edge so the vale
  // opens up through a framed gap in the trees (vista recipe A).
  const edgeZ = macro.params.forestEdgeZ;
  const ancientTree = { x: j(4), z: edgeZ + 56 + j(3) };
  const spawn = { x: ancientTree.x - 1.2, z: ancientTree.z - 8.5, yaw: 0 };

  // --- Roads -------------------------------------------------------------
  const junction: P2 = { x: 26 + j(8), z: edgeZ - 92 + j(6) };
  const footSpec: RoadSpec = {
    id: `${seed}/road/footpath`,
    name: 'Old Root Path',
    kind: 'footpath',
    halfWidth: 1.1,
    blend: 4,
    control: [
      { x: spawn.x, z: spawn.z - 3 },
      { x: -4 + j(3), z: spawn.z - 24 },
      { x: 6 + j(3), z: edgeZ - 2 },
      { x: 3 + j(4), z: edgeZ - 45 },
      junction,
    ],
    from: 'ancient-tree',
    to: 'watchtower',
    maxGrade: 0.3,
    smoothRadius: 3,
  };

  const gate = castle.gate;
  const cx = castle.x;
  const cz = castle.z;
  const mainControl: P2[] = [
    junction,
    { x: 18 + j(8) + cl(-215), z: -215 + j(8) },
    { x: 8 + j(10) + cl(-310), z: -310 + j(10) },
    { x: -42 + j(14) + cl(-395), z: -395 + j(10) },
    { x: -22 + j(14) + cl(-480), z: -480 + j(10) },
    { x: 32 + j(12) + cl(-565), z: -565 + j(10) },
    { x: 52 + j(12) + cl(-655), z: -655 + j(10) },
    { x: 14 + j(10) + cl(-745), z: -745 + j(10) },
    { x: 0 + j(6) + cl(-825), z: -825 },
    { x: -28 + j(12) + cl(-910), z: -910 + j(10) },
    { x: 22 + j(12) + cl(-1030), z: -1030 + j(10) },
    { x: 64 + j(12) + cl(-1160), z: -1160 + j(10) },
    { x: cx - 95, z: cz + 455 },
    { x: cx + 105, z: cz + 345 },
    { x: cx - 85, z: cz + 245 },
    { x: cx + 40, z: cz + 168 },
    { x: gate.x, z: gate.z + 12 },
    { x: gate.x, z: gate.z },
  ];
  const mainSpec: RoadSpec = {
    id: `${seed}/road/vale-road`,
    name: 'The Vale Road',
    kind: 'trade-road',
    halfWidth: 2.6,
    blend: 9,
    control: mainControl,
    from: 'watchtower',
    to: castle.id,
    maxGrade: 0.2,
    smoothRadius: 6,
  };
  const mainRoad = buildRoad(mainSpec, hA, { end: castle.plateauHeight, ease: 60 });
  const footpath = buildRoad(footSpec, hA, { end: mainRoad.heights[0]!, ease: 24 });

  const roads: RoadPlan[] = [mainRoad, footpath];

  // Farm and cottage tracks are added after their sites are chosen; they need
  // the trade road already graded.
  let stageB = new Terrain(macro, [castlePad(castle)], roads, []);
  let roadIndex = stageB.roadIndex;

  const ctx: PlanContext = { seed, rng, macro, buildings: [], fields: [], ruins: [], stageB, roadIndex, castle };
  const settlements: SettlementPlan[] = [];
  const props: PropPlan[] = [];
  const fences: FencePlan[] = [];
  const clearings: Clearing[] = [];

  // --- Ruined watchtower beside the junction ----------------------------
  {
    const f = roadFrame(mainRoad, 6);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = f.p.x + f.nx * side * 15 + f.tx * 10;
    const z = f.p.z + f.nz * side * 15 + f.tz * 10;
    const ruin: RuinPlan = {
      id: `${seed}/ruin/watchtower`,
      name: towerName(rng),
      kind: 'watchtower',
      x,
      z,
      yaw: rng.range(0, Math.PI * 2),
      radius: 4.6,
      height: rng.range(10, 14),
      padHeight: stageB.heightBeforeBuildings(x, z) + 0.05,
      seed: rng.int(0, 2 ** 31),
    };
    ctx.ruins.push(ruin);
    clearings.push({ x, z, radius: 14 });
    props.push({ id: `${seed}/prop/sign-junction`, kind: 'signpost', x: junction.x - f.nx * 4.2, z: junction.z - f.nz * 4.2, yaw: facing(0, 0, f.tx, f.tz), label: 'The Vale Road' });
  }

  // --- Farmstead ---------------------------------------------------------
  const farmId = 'farm';
  {
    const i = sampleNearZ(mainRoad, -600 + j(20));
    const f = roadFrame(mainRoad, i);
    const side = rng.chance(0.6) ? 1 : -1;
    const yard: P2 = { x: f.p.x + f.nx * side * 64, z: f.p.z + f.nz * side * 64 };
    // Yard-local frame: +Z points back towards the road.
    const yardYaw = facing(yard.x, yard.z, f.p.x, f.p.z);
    const fr = new Rng(deriveSeed(seed, 'farm/v1'));
    const ids: string[] = [];

    // The track comes first so buildings and fields are planned around it.
    roads.push(
      buildRoad(
        {
          id: `${seed}/road/farm-track`,
          name: 'Farm Track',
          kind: 'farm-track',
          halfWidth: 1.6,
          blend: 5,
          control: [f.p, { x: f.p.x + f.nx * side * 20, z: f.p.z + f.nz * side * 20 }, localToWorld(0, 22, yardYaw, yard.x, yard.z), localToWorld(0, 2, yardYaw, yard.x, yard.z)],
          from: mainRoad.id,
          to: farmId,
          maxGrade: 0.25,
          smoothRadius: 3,
        },
        (x, z) => stageB.heightBeforeBuildings(x, z),
        { start: mainRoad.heights[i]!, ease: 12 },
      ),
    );
    stageB = new Terrain(macro, [castlePad(castle)], roads, []);
    ctx.stageB = stageB;
    ctx.roadIndex = stageB.roadIndex;

    const add = (kind: BuildingKind, lx: number, lz: number, w: number, d: number, yawOffset: number): void => {
      const pos = localToWorld(lx, lz, yardYaw, yard.x, yard.z);
      const o: Obb = { x: pos.x, z: pos.z, yaw: yardYaw + yawOffset, hw: w / 2, hd: d / 2 };
      if (!canPlaceFootprint(ctx, o, 2.5, 0.4)) return;
      const b = makeBuilding(ctx, farmId, ctx.buildings.length, kind, pos.x, pos.z, yardYaw + yawOffset, w, d, fr);
      ctx.buildings.push(b);
      ids.push(b.id);
    };
    // Farmhouse at the back of the yard facing the road; barn and shed flank the yard.
    add('farmhouse', 0, -13, fr.range(10, 12), fr.range(7, 8), 0);
    add('barn', -14.5, 0, fr.range(9, 11), fr.range(13, 15), Math.PI / 2);
    add('shed', 13.5, 1, fr.range(5, 6), fr.range(4.5, 5.5), -Math.PI / 2);
    settlements.push({ id: farmId, name: farmName(fr), kind: 'farmstead', x: yard.x, z: yard.z, buildingIds: ids });
    clearings.push({ x: yard.x, z: yard.z, radius: 34 });
    const place = (kind: PropPlan['kind'], name: string, lx: number, lz: number, yaw: number): void => {
      const w = localToWorld(lx, lz, yardYaw, yard.x, yard.z);
      props.push({ id: `${seed}/prop/${name}`, kind, x: w.x, z: w.z, yaw });
    };
    place('haystack', 'hay-0', -11, -13.5, fr.range(0, 6));
    place('haystack', 'hay-1', -14.8, -16.5, fr.range(0, 6));
    place('cart', 'cart-farm', 7, 9, yardYaw + fr.range(-0.6, 0.6));
    place('woodpile', 'woodpile-farm', 8.6, -12.5, yardYaw);

    // Fields: a loose grid aligned with the farm, skipping roads and steep ground.
    const crops: FieldPlan['crop'][] = ['wheat', 'barley', 'fallow', 'wheat', 'cabbage', 'barley'];
    let fi = 0;
    for (let gx = -2; gx <= 2; gx++) {
      for (let gz = -2; gz <= 1; gz++) {
        if (Math.abs(gx) <= 1 && gz >= -1) continue; // yard area
        const w = fr.range(30, 42);
        const d = fr.range(36, 52);
        const lp = { x: gx * 46 + fr.range(-3, 3), z: gz * 56 - 18 + fr.range(-3, 3) };
        const pos = localToWorld(lp.x, lp.z, yardYaw, yard.x, yard.z);
        const field: FieldPlan = { id: `${seed}/field/${fi}`, x: pos.x, z: pos.z, yaw: yardYaw + fr.range(-0.05, 0.05), width: w, depth: d, crop: fr.pick(crops) };
        const o: Obb = { x: field.x, z: field.z, yaw: field.yaw, hw: w / 2, hd: d / 2 };
        if (!canPlaceFootprint(ctx, o, 4, 0.2)) continue;
        ctx.fields.push(field);
        fi++;
        // Hedgerow or fence on one or two sides.
        const corners = [
          localToWorld(-w / 2, -d / 2, field.yaw, field.x, field.z),
          localToWorld(w / 2, -d / 2, field.yaw, field.x, field.z),
          localToWorld(w / 2, d / 2, field.yaw, field.x, field.z),
          localToWorld(-w / 2, d / 2, field.yaw, field.x, field.z),
        ];
        const kind = fr.weighted<FencePlan['kind']>(['hedge', 'wood-fence', 'stone-wall'], [3, 2, 2]);
        const startEdge = fr.int(0, 3);
        fences.push({ id: `${seed}/fence/f${fi}`, kind, points: [corners[startEdge]!, corners[(startEdge + 1) % 4]!, corners[(startEdge + 2) % 4]!] });
      }
    }
  }

  roadIndex = ctx.roadIndex;

  // --- Hamlet strung along the Vale Road --------------------------------
  const hamletId = 'hamlet';
  {
    const hr = new Rng(deriveSeed(seed, 'settlement/v1', 0));
    const centre = sampleNearZ(mainRoad, -825);
    const ids: string[] = [];
    const spacing = 9; // samples (×2 m)
    for (let k = -5; k <= 5 && ids.length < 9; k++) {
      for (const side of [-1, 1]) {
        if (ids.length >= 9) break;
        if (!hr.chance(0.72)) continue;
        const i = centre + k * spacing + hr.int(-1, 1);
        if (i < 2 || i > mainRoad.points.length - 3) continue;
        const f = roadFrame(mainRoad, i);
        const large = hr.chance(0.25);
        const width = large ? hr.range(10, 13) : hr.range(6.5, 9);
        const depth = large ? hr.range(6.5, 7.5) : hr.range(5.5, 7);
        const setback = hr.range(3.2, 6.5);
        const off = mainRoad.halfWidth + setback + depth / 2;
        const x = f.p.x + f.nx * side * off;
        const z = f.p.z + f.nz * side * off;
        const yaw = facing(x, z, f.p.x, f.p.z) + hr.range(-0.08, 0.08);
        const o: Obb = { x, z, yaw, hw: width / 2, hd: depth / 2 };
        if (!canPlaceFootprint(ctx, o, 2.2, 0.32)) continue;
        const b = makeBuilding(ctx, hamletId, ctx.buildings.length, large ? 'longhouse' : 'cottage', x, z, yaw, width, depth, hr);
        ctx.buildings.push(b);
        ids.push(b.id);
        if (hr.chance(0.5)) {
          const bp = localToWorld(width / 2 + 1.1, depth / 2 - 0.5, yaw, x, z);
          props.push({ id: `${b.id}/barrel`, kind: 'barrel', x: bp.x, z: bp.z, yaw: hr.range(0, 6) });
        }
        if (hr.chance(0.45)) {
          const wp = localToWorld(-width / 2 - 1.2, -depth / 4, yaw, x, z);
          props.push({ id: `${b.id}/woodpile`, kind: 'woodpile', x: wp.x, z: wp.z, yaw: yaw + Math.PI / 2 });
        }
      }
    }
    const c = roadFrame(mainRoad, centre);
    settlements.push({ id: hamletId, name: villageName(hr), kind: 'hamlet', x: c.p.x, z: c.p.z, buildingIds: ids });
    clearings.push({ x: c.p.x, z: c.p.z, radius: 70 });
    // Well on the green beside the road, signpost at the hamlet's south end.
    const wellSide = hr.chance(0.5) ? 1 : -1;
    const wellPos = { x: c.p.x + c.nx * wellSide * 7.5 + c.tx * 4, z: c.p.z + c.nz * wellSide * 7.5 + c.tz * 4 };
    if (!ctx.buildings.some((b) => obbOverlap(buildingObb(b), { x: wellPos.x, z: wellPos.z, yaw: 0, hw: 1.3, hd: 1.3 }, 1.5))) {
      props.push({ id: `${seed}/prop/well`, kind: 'well', x: wellPos.x, z: wellPos.z, yaw: 0 });
    }
    const s = roadFrame(mainRoad, Math.max(2, centre - 6 * spacing));
    props.push({ id: `${seed}/prop/sign-hamlet`, kind: 'signpost', x: s.p.x + s.nx * 4.3, z: s.p.z + s.nz * 4.3, yaw: facing(0, 0, s.tx, s.tz), label: settlements[settlements.length - 1]!.name });
  }

  // --- Lone cottages on the valley slopes, each with its own track ------
  {
    const cr = new Rng(deriveSeed(seed, 'cottages/v1'));
    let placed = 0;
    for (let attempt = 0; attempt < 140 && placed < 4; attempt++) {
      const z = cr.range(-480, -1250);
      const side = cr.chance(0.5) ? -1 : 1;
      const x = cl(z) + side * cr.range(150, 360);
      // Keep apart from other sites and the hamlet/farm.
      if (settlements.some((s) => Math.hypot(s.x - x, s.z - z) < 160)) continue;
      if (ctx.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < 120)) continue;
      const near = nearestPoint(mainRoad, x, z);
      if (near.dist < 70 || near.dist > 260) continue;
      const width = cr.range(6.5, 9);
      const depth = cr.range(5.5, 7);
      const yaw = facing(x, z, near.p.x, near.p.z) + cr.range(-0.3, 0.3);
      const o: Obb = { x, z, yaw, hw: width / 2, hd: depth / 2 };
      if (!canPlaceFootprint(ctx, o, 3, 0.3)) continue;
      const sid = `cottage-${placed}`;
      const b = makeBuilding(ctx, sid, ctx.buildings.length, 'cottage', x, z, yaw, width, depth, cr);
      const door = localToWorld(0, depth / 2 + 3, yaw, x, z);
      const mid = { x: (door.x + near.p.x) / 2 + cr.range(-20, 20), z: (door.z + near.p.z) / 2 + cr.range(-20, 20) };
      const track = buildRoad(
          {
            id: `${seed}/road/track-${placed}`,
            name: 'Cottage Track',
            kind: 'farm-track',
            halfWidth: 1.2,
            blend: 4,
            control: [near.p, mid, door],
            from: mainRoad.id,
            to: sid,
            maxGrade: 0.3,
            smoothRadius: 3,
          },
          (qx, qz) => stageB.heightBeforeBuildings(qx, qz),
          { start: mainRoad.heights[near.index]!, ease: 12 },
        );
      // Reject the cottage if its track would cut through fields, fences or other buildings.
      if (!trackIsClear(track, ctx, fences, b)) continue;
      ctx.buildings.push(b);
      roads.push(track);
      settlements.push({ id: sid, name: `${familyName(cr)}\u2019s Cottage`, kind: 'farmstead', x, z, buildingIds: [b.id] });
      clearings.push({ x, z, radius: 18 });
      if (cr.chance(0.7)) {
        const wp = localToWorld(width / 2 + 1.4, 0, yaw, x, z);
        props.push({ id: `${b.id}/woodpile`, kind: 'woodpile', x: wp.x, z: wp.z, yaw: yaw + Math.PI / 2 });
      }
      placed++;
    }
  }

  const finalStageB = new Terrain(macro, [castlePad(castle)], roads, []);
  ctx.stageB = finalStageB;
  // Re-seat buildings on the final graded ground.
  for (const b of ctx.buildings) b.padHeight = seatHeight(ctx, buildingObb(b));
  for (const r of ctx.ruins) r.padHeight = finalStageB.heightBeforeBuildings(r.x, r.z) + 0.05;

  // --- Dry-stone walls along stretches of the Vale Road -----------------
  {
    const wr = new Rng(deriveSeed(seed, 'walls/v1'));
    const allIndex = finalStageB.roadIndex;
    for (let run = 0; run < 5; run++) {
      const start = wr.int(60, mainRoad.points.length - 200);
      const len = wr.int(75, 180);
      const side = wr.chance(0.5) ? 1 : -1;
      const pts: P2[] = [];
      for (let i = start; i < start + len; i += 1) {
        const f = roadFrame(mainRoad, i);
        const off = mainRoad.halfWidth + 2.6;
        const x = f.p.x + f.nx * side * off;
        const z = f.p.z + f.nz * side * off;
        const blocked =
          ctx.buildings.some((b) => obbOverlap(buildingObb(b), { x, z, yaw: 0, hw: 0.6, hd: 0.6 }, 2)) ||
          otherRoadNear(allIndex, mainRoad.id, x, z, 3.5) ||
          allIndex.surfaceDistance(x, z) < 2.2 ||
          (pts.length > 0 && Math.hypot(pts[pts.length - 1]!.x - x, pts[pts.length - 1]!.z - z) > 3) ||
          props.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5);
        if (blocked) {
          if (pts.length >= 3) fences.push({ id: `${seed}/wall/${run}-${fences.length}`, kind: 'stone-wall', points: pts.slice() });
          pts.length = 0;
          continue;
        }
        pts.push({ x, z });
      }
      if (pts.length >= 3) fences.push({ id: `${seed}/wall/${run}-${fences.length}`, kind: 'stone-wall', points: pts });
    }
  }

  // A waystone partway down the footpath.
  {
    const i = Math.floor(footpath.points.length * 0.55);
    const f = roadFrame(footpath, i);
    props.push({ id: `${seed}/prop/waystone`, kind: 'waystone', x: f.p.x + f.nx * 2.4, z: f.p.z + f.nz * 2.4, yaw: facing(0, 0, f.tx, f.tz) });
  }

  // --- Weapon finds: each spot has its own story and luck bias -------------
  const finds: WeaponFind[] = [];
  {
    const fr = new Rng(deriveSeed(seed, 'loot/finds'));
    const lootSeed = (i: number): number => deriveSeed(seed, 'loot/weapon', i);
    const ruin = ctx.ruins[0];
    if (ruin) {
      const a = fr.range(0, Math.PI * 2);
      finds.push({ id: `${seed}/find/watchtower`, x: ruin.x + Math.sin(a) * 0.9, z: ruin.z + Math.cos(a) * 0.9, yaw: fr.range(0, 6.28), pose: 'lying', seed: lootSeed(0), luck: 0.4, story: 'Half-buried in the watchtower\u2019s rubble.' });
    }
    const way = props.find((p) => p.kind === 'waystone');
    if (way) {
      const c = Math.cos(way.yaw);
      const sn = Math.sin(way.yaw);
      finds.push({ id: `${seed}/find/waystone`, x: way.x + c * 0.9, z: way.z - sn * 0.9, yaw: way.yaw + 0.4, pose: 'lying', seed: lootSeed(1), luck: 1.1, story: 'Laid at the foot of the waystone, like an offering.' });
    }
    const g = castle.gate;
    finds.push({ id: `${seed}/find/castle-gate`, x: g.x + Math.sin(g.yaw) * 9 + fr.range(-2, 2), z: g.z + Math.cos(g.yaw) * 9, yaw: fr.range(0, 6.28), pose: 'stuck', seed: lootSeed(2), luck: 2.0, story: 'Driven point-first into the earth before the shut gate.' });
    const barn = ctx.buildings.find((b) => b.kind === 'barn');
    if (barn) {
      const w = localToWorld(barn.width / 2 - 1.4, barn.depth / 2 + 0.35, barn.yaw, barn.x, barn.z);
      finds.push({ id: `${seed}/find/barn`, x: w.x, z: w.z, yaw: barn.yaw, pose: 'leaning', seed: lootSeed(3), luck: -0.6, cls: fr.chance(0.5) ? 'spear' : 'axe', story: 'Left leaning against the barn wall.' });
    }
    const cottage = ctx.buildings.find((b) => b.settlementId.startsWith('cottage-'));
    if (cottage) {
      const w = localToWorld(-cottage.width / 2 - 2.6, cottage.depth / 2 - 1, cottage.yaw, cottage.x, cottage.z);
      props.push({ id: `${seed}/prop/chopping-block`, kind: 'chopping-block', x: w.x, z: w.z, yaw: cottage.yaw });
      finds.push({ id: `${seed}/find/chopping-block`, x: w.x, z: w.z, yaw: cottage.yaw + 0.3, pose: 'stuck', seed: lootSeed(4), luck: -1.2, cls: 'axe', story: 'Buried in a cottager\u2019s chopping block.' });
    }
  }

  // --- Pads, clearings, sightline -----------------------------------------
  const pads: Pad[] = [];
  for (const b of ctx.buildings) {
    pads.push({ x: b.x, z: b.z, yaw: b.yaw, halfW: b.width / 2 + 1.4, halfD: b.depth / 2 + 1.4, circle: false, height: b.padHeight, falloff: 7 });
  }
  for (const r of ctx.ruins) pads.push({ x: r.x, z: r.z, yaw: 0, halfW: r.radius + 3, halfD: r.radius + 3, circle: true, height: r.padHeight, falloff: 6 });
  // A gently levelled hollow beneath the ancient tree where the player wakes.
  {
    const cxp = (spawn.x + ancientTree.x) / 2;
    const czp = (spawn.z + ancientTree.z) / 2;
    pads.push({ x: cxp, z: czp, yaw: 0, halfW: 5, halfD: 5, circle: true, height: finalStageB.heightBeforeBuildings(cxp, czp), falloff: 12 });
  }
  clearings.push({ x: ancientTree.x, z: ancientTree.z, radius: 15 });
  clearings.push({ x: castle.x, z: castle.z, radius: castle.plateauRadius + 4 });

  const sightTo = { x: castle.x, z: castle.z };
  const sdx = sightTo.x - spawn.x;
  const sdz = sightTo.z - spawn.z;
  const sl = Math.hypot(sdx, sdz);
  spawn.yaw = Math.atan2(-sdx, -sdz); // camera yaw: 0 looks down -Z
  const sightline = { from: { x: spawn.x, z: spawn.z }, to: { x: spawn.x + (sdx / sl) * 420, z: spawn.z + (sdz / sl) * 420 }, halfWidth: 7, spread: 0.11 };

  return {
    seed,
    generatorVersion: GENERATOR_VERSION,
    regionName: 'The Vale of Unwritten Days',
    spawn,
    ancientTree,
    castle,
    ruins: ctx.ruins,
    settlements,
    buildings: ctx.buildings,
    roads,
    fields: ctx.fields,
    fences,
    pads,
    clearings,
    sightline,
    props,
    finds,
  };
}

function otherRoadNear(index: RoadIndex, exceptId: string, x: number, z: number, dist: number): boolean {
  for (const r of index.roads) {
    if (r.id === exceptId) continue;
    for (let i = 0; i < r.points.length; i += 2) {
      const p = r.points[i]!;
      if (Math.abs(p.x - x) < dist + r.halfWidth && Math.abs(p.z - z) < dist + r.halfWidth) {
        if (Math.hypot(p.x - x, p.z - z) < dist + r.halfWidth) return true;
      }
    }
  }
  return false;
}

function trackIsClear(track: RoadPlan, ctx: PlanContext, fences: FencePlan[], own: BuildingPlan): boolean {
  const clear = track.halfWidth + 0.8;
  for (let i = 0; i < track.points.length; i++) {
    const p = track.points[i]!;
    for (const f of ctx.fields) if (pointInObb({ x: f.x, z: f.z, yaw: f.yaw, hw: f.width / 2, hd: f.depth / 2 }, p.x, p.z, clear)) return false;
    for (const b of ctx.buildings) if (b !== own && pointInObb(buildingObb(b), p.x, p.z, clear + 1)) return false;
    if (pointInObb(buildingObb(own), p.x, p.z, 0.3)) return false;
    for (const fe of fences) {
      for (let k = 0; k < fe.points.length - 1; k++) {
        const a = fe.points[k]!;
        const c = fe.points[k + 1]!;
        if (distSqToSegment(p.x, p.z, a.x, a.z, c.x, c.z).d2 < clear * clear) return false;
      }
    }
    for (const r of ctx.ruins) if (Math.hypot(r.x - p.x, r.z - p.z) < r.radius + 6) return false;
  }
  return true;
}

export function nearestPoint(road: RoadPlan, x: number, z: number): { p: P2; dist: number; index: number } {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < road.points.length; i++) {
    const p = road.points[i]!;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { p: road.points[best]!, dist: Math.sqrt(bestD), index: best };
}
