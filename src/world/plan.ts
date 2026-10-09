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
import { ContentBuilder, castlePad } from './contentBuilder';
import { innChestLocal } from '../assets/buildings';
import { VALE_BOUNDS, valeGates, type SiteSeed } from './regions';
import { populateCamp, populateCottage, populateShrine, populateStones, populateWatchtower, siteLevelPads, type SiteContext } from './sitegen';
import { buildRoad, RoadIndex, type RoadSpec } from './roads';
import { Terrain } from './terrain';
import { obbOverlap, obbSamples, pointInObb, type Obb } from './geometry2d';
import { distSqToSegment } from '../core/math';
import { valeName, villageName, towerName, farmName, familyName, stonesName, shrineName, campName, uniqueName } from './names';
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

export { castlePad };

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

/** Index of the road sample nearest to a target distance down the valley (authored Z). */
function sampleNearZ(road: RoadPlan, z: number, macro: MacroField): number {
  let best = 0;
  let bestD = Infinity;
  road.points.forEach((p, i) => {
    const d = Math.abs(macro.toLocal(p.x, p.z).z - z);
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

export function generateWorldPlan(seedInput: string, macroIn?: MacroField): WorldPlan {
  const seed = canonicalizeSeed(seedInput);
  const rng = new Rng(deriveSeed(seed, 'sites/v1'));
  const macro = macroIn ?? new MacroField(seed);
  const castle = planCastle(seed, macro);
  const stageA = new Terrain(macro, [castlePad(castle)], [], []);
  const hA = (x: number, z: number): number => stageA.heightBeforeRoads(x, z);
  const cl = (z: number): number => macro.centerline(z);
  const j = (amount: number): number => rng.range(-amount, amount);
  // The composition is authored in its own frame (spawn at the origin, castle up the valley along −Z);
  // each seed turns, mirrors and stretches that frame (the reference seed keeps it as authored).
  const W = (x: number, z: number): P2 => macro.toWorld(x, z);
  const ref = seed === REFERENCE_SEED;
  const lr = new Rng(deriveSeed(seed, 'vale/layout'));
  const hamletZ = ref ? -825 : lr.range(-760, -1000);
  const farmZ = ref ? -600 : hamletZ + lr.range(220, 290);
  const hamletSize = ref ? 9 : lr.int(6, 12);
  const cottageCount = ref ? 4 : lr.int(2, 6);

  // --- Spawn under the ancient tree -------------------------------------
  // The ancient tree stands a short walk inside the forest edge so the vale
  // opens up through a framed gap in the trees (vista recipe A).
  const edgeZ = macro.params.forestEdgeZ;
  const treeL = { x: j(4), z: edgeZ + 56 + j(3) };
  const ancientTree = W(treeL.x, treeL.z);
  const spawnL = { x: treeL.x - 1.2, z: treeL.z - 8.5 };
  const spawn = { ...W(spawnL.x, spawnL.z), yaw: 0 };

  // --- Roads -------------------------------------------------------------
  const junction: P2 = W(26 + j(8), edgeZ - 92 + j(6));
  const footSpec: RoadSpec = {
    id: `${seed}/road/footpath`,
    name: 'Old Root Path',
    kind: 'footpath',
    halfWidth: 1.1,
    blend: 4,
    control: [W(spawnL.x, spawnL.z - 3), W(-4 + j(3), spawnL.z - 24), W(6 + j(3), edgeZ - 2), W(3 + j(4), edgeZ - 45), junction],
    from: 'ancient-tree',
    to: 'watchtower',
    maxGrade: 0.3,
    smoothRadius: 3,
  };

  const gate = castle.gate;
  const cx = macro.params.castleX;
  const cz = macro.params.castleZ;
  const gl = macro.toLocal(gate.x, gate.z);
  const mainControl: P2[] = [
    junction,
    W(18 + j(8) + cl(-215), -215 + j(8)),
    W(8 + j(10) + cl(-310), -310 + j(10)),
    W(-42 + j(14) + cl(-395), -395 + j(10)),
    W(-22 + j(14) + cl(-480), -480 + j(10)),
    W(32 + j(12) + cl(-565), -565 + j(10)),
    W(52 + j(12) + cl(-655), -655 + j(10)),
    W(14 + j(10) + cl(-745), -745 + j(10)),
    W(0 + j(6) + cl(-825), -825),
    W(-28 + j(12) + cl(-910), -910 + j(10)),
    W(22 + j(12) + cl(-1030), -1030 + j(10)),
    W(64 + j(12) + cl(-1160), -1160 + j(10)),
    W(cx - 95, cz + 455),
    W(cx + 105, cz + 345),
    W(cx - 85, cz + 245),
    W(cx + 40, cz + 168),
    W(gl.x, gl.z + 12),
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
    const i = sampleNearZ(mainRoad, farmZ + j(20), macro);
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
    const centre = sampleNearZ(mainRoad, hamletZ, macro);
    const ids: string[] = [];
    const spacing = 9; // samples (×2 m)
    const reach = Math.max(5, Math.ceil(hamletSize / 2));
    for (let k = -reach; k <= reach && ids.length < hamletSize; k++) {
      for (const side of [-1, 1]) {
        if (ids.length >= hamletSize) break;
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
        // The hamlet's first large house is its inn (enterable). No random draws change.
        if (large && width >= 10 && !ctx.buildings.some((o) => o.kind === 'inn')) {
          b.kind = 'inn';
          b.floors = 2;
          b.enterable = true;
          if (b.upperStyle === b.wallStyle && b.wallStyle !== 'timber') b.upperStyle = 'plaster';
          if (b.chimney === 'none') b.chimney = 'right';
        }
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
    // Beyond the last house; on whichever verge is clear of buildings.
    const s = roadFrame(mainRoad, Math.max(2, centre - (reach + 1) * spacing));
    const verge = [1, -1].find((side) => !ctx.buildings.some((b) => obbOverlap(buildingObb(b), { x: s.p.x + s.nx * side * 4.3, z: s.p.z + s.nz * side * 4.3, yaw: 0, hw: 0.5, hd: 0.5 }, 3)));
    if (verge !== undefined) props.push({ id: `${seed}/prop/sign-hamlet`, kind: 'signpost', x: s.p.x + s.nx * verge * 4.3, z: s.p.z + s.nz * verge * 4.3, yaw: facing(0, 0, s.tx, s.tz), label: settlements[settlements.length - 1]!.name });
  }

  // --- Lone cottages on the valley slopes, each with its own track ------
  {
    const cr = new Rng(deriveSeed(seed, 'cottages/v1'));
    let placed = 0;
    for (let attempt = 0; attempt < 140 && placed < cottageCount; attempt++) {
      const lz = cr.range(-480, -1250);
      const side = cr.chance(0.5) ? -1 : 1;
      const { x, z } = W(cl(lz) + side * cr.range(150, 360), lz);
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
    const inn = ctx.buildings.find((b) => b.kind === 'inn');
    if (inn) {
      const lc = innChestLocal(inn);
      const w = localToWorld(lc.x, lc.z, inn.yaw, inn.x, inn.z);
      const level = { building: inn.id, height: lc.y };
      props.push({ id: `${seed}/prop/inn-chest`, kind: 'chest', x: w.x, z: w.z, yaw: inn.yaw + Math.PI, level });
      finds.push({ id: `${seed}/prop/inn-chest/find`, x: w.x, z: w.z, yaw: inn.yaw + Math.PI, pose: 'chest', seed: lootSeed(5), luck: 0.6, story: 'A guest’s chest, left behind in the inn’s loft.', level });
    }
    const cottage = ctx.buildings.find((b) => b.settlementId.startsWith('cottage-'));
    if (cottage) {
      const w = localToWorld(-cottage.width / 2 - 2.6, cottage.depth / 2 - 1, cottage.yaw, cottage.x, cottage.z);
      props.push({ id: `${seed}/prop/chopping-block`, kind: 'chopping-block', x: w.x, z: w.z, yaw: cottage.yaw });
      finds.push({ id: `${seed}/find/chopping-block`, x: w.x, z: w.z, yaw: cottage.yaw + 0.3, pose: 'stuck', seed: lootSeed(4), luck: -1.2, cls: 'axe', story: 'Buried in a cottager\u2019s chopping block.' });
    }
  }

  // --- The vale opens onto the wider world ----------------------------------
  const valeRuins = ctx.ruins.slice();
  const cb = new ContentBuilder(seed, macro, `${seed}/vale`, VALE_BOUNDS, {
    castles: [castle],
    prePads: [castlePad(castle)],
    ruins: ctx.ruins,
    settlements,
    buildings: ctx.buildings,
    roads,
    fields: ctx.fields,
    fences,
    clearings,
    props,
    finds,
    gates: valeGates(seed, macro),
  });
  const hamlet = settlements.find((st) => st.kind === 'hamlet')!;
  const farm = settlements.find((st) => st.id === farmId);
  cb.reserves = [
    { id: castle.id, x: castle.x, z: castle.z, r: castle.plateauRadius + 30 },
    { id: 'spawn', x: ancientTree.x, z: ancientTree.z, r: 40 },
    { id: hamlet.id, x: hamlet.x, z: hamlet.z, r: 60 },
    ...(farm ? [{ id: farm.id, x: farm.x, z: farm.z, r: 125 }] : []),
  ];
  // Exit roads from the Vale Road out through every gate on the vale's border.
  const order = cb.c.gates.slice().sort((a, b) => Math.hypot(a.x - junction.x, a.z - junction.z) - Math.hypot(b.x - junction.x, b.z - junction.z));
  for (const g of order) {
    cb.route({ id: `${g.id}/road`, name: 'The Old Road', kind: 'trade-road', from: g.id, start: { x: g.x, z: g.z }, gate: g, goals: cb.networkGoals((r) => r.kind === 'footpath') });
  }
  // Side places on the vale's hills: off the main road, for those who wander.
  const extras = valeExtraSites(seed, macro, cb);
  const sctx: SiteContext = { cb, fortune: 0.2 };
  for (const st of extras) {
    cb.reserves.push({ id: st.id, x: st.x, z: st.z, r: st.reserve });
  }
  const xr = new Rng(deriveSeed(seed, 'vale/extras-connect'));
  for (const st of extras) {
    const connect = xr.chance(0.6);
    if (st.kind === 'watchtower') populateWatchtower(sctx, st, connect);
    else if (st.kind === 'stones') populateStones(sctx, st, connect);
    else if (st.kind === 'shrine') populateShrine(sctx, st, connect);
    else if (st.kind === 'camp') populateCamp(sctx, st, connect);
    else if (st.kind === 'cottage') populateCottage(sctx, st);
  }

  // --- Sites the player can discover ---------------------------------------
  cb.c.sites.unshift(
    { id: hamlet.id, kind: 'hamlet', name: hamlet.name, x: hamlet.x, z: hamlet.z, radius: 80 },
    ...(farm ? [{ id: farm.id, kind: 'farmstead' as const, name: farm.name, x: farm.x, z: farm.z, radius: 55 }] : []),
    ...valeRuins.map((r) => ({ id: r.id, kind: 'watchtower' as const, name: r.name, x: r.x, z: r.z, radius: 22 })),
    { id: castle.id, kind: 'castle', name: castle.name, x: castle.gate.x, z: castle.gate.z, radius: 70 },
  );

  // --- Pads, clearings, sightline -----------------------------------------
  clearings.push({ x: ancientTree.x, z: ancientTree.z, radius: 15 });
  clearings.push({ x: castle.x, z: castle.z, radius: castle.plateauRadius + 4 });
  const valeStage = cb.terrain;
  // A gently levelled hollow beneath the ancient tree where the player wakes.
  const hx = (spawn.x + ancientTree.x) / 2;
  const hz = (spawn.z + ancientTree.z) / 2;
  const extraPads: Pad[] = [
    { x: hx, z: hz, yaw: 0, halfW: 5, halfD: 5, circle: true, height: valeStage.heightBeforeBuildings(hx, hz), falloff: 12 },
    ...siteLevelPads(cb).map((p) => ({ x: p.x, z: p.z, yaw: 0, halfW: p.r, halfD: p.r, circle: true, height: cb.heightB(p.x, p.z), falloff: 6 })),
  ];
  const content = cb.finalize(extraPads);
  void finalStageB;

  const sightTo = { x: castle.x, z: castle.z };
  const sdx = sightTo.x - spawn.x;
  const sdz = sightTo.z - spawn.z;
  const sl = Math.hypot(sdx, sdz);
  spawn.yaw = Math.atan2(-sdx, -sdz); // camera yaw: 0 looks down -Z
  const sightline = { from: { x: spawn.x, z: spawn.z }, to: { x: spawn.x + (sdx / sl) * 420, z: spawn.z + (sdz / sl) * 420 }, halfWidth: 7, spread: 0.11 };

  return {
    ...content,
    seed,
    generatorVersion: GENERATOR_VERSION,
    regionName: ref ? 'The Vale of Unwritten Days' : valeName(lr),
    spawn,
    ancientTree,
    castle,
    sightline,
  };
}

/** Candidate side sites on the vale's outer hills, well away from the authored core. */
function valeExtraSites(seed: string, macro: MacroField, cb: ContentBuilder): SiteSeed[] {
  const rng = new Rng(deriveSeed(seed, 'vale/extras'));
  const b = VALE_BOUNDS;
  const out: SiteSeed[] = [];
  const kinds: SiteSeed['kind'][] = ['watchtower', 'stones', 'shrine', 'camp', 'cottage', 'shrine', 'camp'];
  const used = new Set<string>([...cb.c.ruins.map((r) => r.name), ...cb.c.settlements.map((st) => st.name)]);
  const names: Record<string, (r: Rng) => string> = { watchtower: towerName, stones: stonesName, shrine: shrineName, camp: campName, cottage: (r) => `${familyName(r)}\u2019s Cottage` };
  for (const kind of kinds) {
    if (!rng.chance(0.75)) continue;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = rng.range(b.x0 + 160, b.x1 - 160);
      const z = rng.range(b.z0 + 160, b.z1 - 160);
      const near = cb.nearestRoadPoint(x, z);
      if (near && near.dist < 160) continue;
      if (Math.hypot(x - cb.c.castles[0]!.x, z - cb.c.castles[0]!.z) < 420) continue;
      if (cb.c.buildings.some((bd) => Math.hypot(bd.x - x, bd.z - z) < 170)) continue;
      if (cb.c.fields.some((f) => Math.hypot(f.x - x, f.z - z) < 120)) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 300)) continue;
      if (cb.reserves.some((r) => Math.hypot(r.x - x, r.z - z) < r.r + 60)) continue;
      const e = 10;
      const slope = Math.hypot(macro.height(x + e, z) - macro.height(x - e, z), macro.height(x, z + e) - macro.height(x, z - e)) / (2 * e);
      if (slope > (kind === 'cottage' ? 0.18 : 0.26)) continue;
      out.push({ id: `${seed}/vale/${kind}${out.length}`, kind, name: uniqueName(rng, used, names[kind]!), x, z, reserve: kind === 'cottage' ? 22 : 24, seed: rng.int(0, 2 ** 31) });
      break;
    }
  }
  return out;
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
