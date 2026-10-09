/**
 * Full plan of one procedural region (Section 56 pipeline, per region):
 * skeleton (gates, sites, castles) → a road network grown as a tree from the
 * village street or a crossroads → every gate and castle joined to it →
 * minor sites by footpath (some left off the map for wanderers) → each site
 * populated → buildings seated and pads emitted.
 */
import { Rng, deriveSeed } from '../core/rng';
import type { MacroField } from './macro';
import { ContentBuilder, facing } from './contentBuilder';
import { regionBounds, regionSkeleton, type RegionSkeleton, type SiteSeed } from './regions';
import { populateCamp, populateCastle, populateCottage, populateFarmstead, populateShrine, populateStones, populateVillage, populateWatchtower, siteLevelPads, type SiteContext } from './sitegen';
import type { Gate, P2, Pad, RegionPlan } from './types';

export function planRegion(seed: string, macro: MacroField, rx: number, rz: number, skeleton?: RegionSkeleton): RegionPlan {
  const sk = skeleton ?? regionSkeleton(seed, macro, rx, rz);
  const cb = new ContentBuilder(seed, macro, sk.id, regionBounds(rx, rz), { gates: sk.gates });
  for (const c of sk.castles) cb.addCastle(c);
  // Roads may run through villages (they become streets); other sites keep their ground clear.
  cb.reserves = sk.sites.map((s) => ({ id: s.id, x: s.x, z: s.z, r: s.kind === 'village' ? 0 : s.reserve }));
  for (const c of sk.castles) cb.reserves.push({ id: c.id, x: c.x, z: c.z, r: c.plateauRadius + 20 });
  const rng = new Rng(deriveSeed(seed, 'region/plan', rx, rz));
  const ctx: SiteContext = { cb, fortune: sk.fortune };
  const site = (kind: SiteSeed['kind']): SiteSeed[] => sk.sites.filter((s) => s.kind === kind);

  // --- 1. The network's root: a village street, or a crossroads hub ------
  const village = site('village')[0];
  const castleSites = site('castle');
  const minor = sk.sites.filter((s) => s.kind === 'watchtower' || s.kind === 'stones' || s.kind === 'shrine' || s.kind === 'camp');
  // Some minor sites stay off the roads: found only by wandering.
  const connected = new Set(minor.filter(() => rng.chance(0.65)).map((s) => s.id));
  const majorCount = sk.gates.length + castleSites.length;
  if (village) {
    streetThrough(cb, village, sk.gates, rng);
  } else if (majorCount + connected.size >= 2) {
    hub(cb, sk, rng);
  } else if (sk.gates.length) {
    // A lone road in: it leads to the region's most notable place rather than stopping at the border.
    const anchor = sk.sites.find((s) => s.kind === 'farmstead') ?? sk.sites.find((s) => s.kind === 'cottage') ?? minor[0];
    if (anchor && anchor.kind !== 'cottage' && anchor.kind !== 'farmstead') connected.add(anchor.id);
    hub(cb, sk, rng, anchor);
  }

  // --- 2. Join castles and gates (nearest first, Prim-like) ----------------
  if (cb.c.roads.length || cb.c.sites.some((s) => s.kind === 'crossroads')) {
    const pending: { id: string; p: P2; gate?: Gate; castle?: (typeof sk.castles)[number] }[] = [
      ...sk.gates.map((g) => ({ id: g.id, p: { x: g.x, z: g.z }, gate: g })),
      ...sk.castles.map((c) => ({ id: c.id, p: { x: c.gate.x, z: c.gate.z }, castle: c })),
    ];
    while (pending.length) {
      const goals = cb.networkGoals();
      const hubGoal = cb.c.sites.find((s) => s.kind === 'crossroads');
      const goalPts = goals.length ? goals.map((g) => g.p) : hubGoal ? [hubGoal] : [];
      if (!goalPts.length) break;
      let bi = 0;
      let bd = Infinity;
      pending.forEach((n, i) => {
        for (const g of goalPts) {
          const d = Math.hypot(n.p.x - g.x, n.p.z - g.z);
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
      });
      const n = pending.splice(bi, 1)[0]!;
      const explicit = goals.length ? undefined : [{ p: { x: hubGoal!.x, z: hubGoal!.z }, h: cb.heightB(hubGoal!.x, hubGoal!.z), id: hubGoal!.id }];
      if (n.gate) {
        cb.route({ id: `${n.id}/road`, name: 'The Old Road', kind: 'trade-road', from: n.id, start: n.p, gate: n.gate, goals: explicit });
      } else if (n.castle) {
        const c = n.castle;
        const out = { x: Math.sin(c.gate.yaw), z: Math.cos(c.gate.yaw) };
        const lead = [
          { x: c.gate.x + out.x * 8, z: c.gate.z + out.z * 8 },
          { x: c.gate.x + out.x * (c.plateauRadius * 0.25 + 30), z: c.gate.z + out.z * (c.plateauRadius * 0.25 + 30) },
        ];
        cb.route({ id: `${c.id}/road`, name: `The Road to ${c.name}`, kind: 'trade-road', from: c.id, start: { x: c.gate.x, z: c.gate.z }, startHeight: c.plateauHeight, lead, allow: [c.id, castleSites.find((s) => s.x === c.x)?.id ?? ''], goals: explicit });
      }
    }
  }

  // --- 3. Populate sites ---------------------------------------------------
  for (const s of castleSites) populateCastle(ctx, s, sk.castles.find((c) => Math.hypot(c.x - s.x, c.z - s.z) < 1)!);
  if (village) populateVillage(ctx, village);
  for (const s of site('farmstead')) populateFarmstead(ctx, s);
  for (const s of site('cottage')) populateCottage(ctx, s);
  for (const s of site('watchtower')) populateWatchtower(ctx, s, connected.has(s.id));
  for (const s of site('stones')) populateStones(ctx, s, connected.has(s.id));
  for (const s of site('shrine')) populateShrine(ctx, s, connected.has(s.id));
  for (const s of site('camp')) populateCamp(ctx, s, connected.has(s.id));

  // --- 4. Signposts where side roads join the network ----------------------
  junctionSigns(cb);

  // --- 5. Seat and pad -----------------------------------------------------
  const extra: Pad[] = siteLevelPads(cb).map((p) => ({ x: p.x, z: p.z, yaw: 0, halfW: p.r, halfD: p.r, circle: true, height: cb.heightB(p.x, p.z), falloff: 6 }));
  const content = cb.finalize(extra);
  return { ...content, rx, rz, name: sk.name, fortune: sk.fortune };
}

/** A village's main street: a gently curving road through its centre, aimed towards a gate if any. */
function streetThrough(cb: ContentBuilder, v: SiteSeed, gates: Gate[], rng: Rng): void {
  let dir = rng.range(0, Math.PI);
  if (gates.length) {
    const g = gates.reduce((a, b) => (Math.hypot(a.x - v.x, a.z - v.z) < Math.hypot(b.x - v.x, b.z - v.z) ? a : b));
    dir = Math.atan2(g.x - v.x, g.z - v.z);
  }
  // Choose the direction (± a little) with the gentlest fall across the street.
  let best = dir;
  let bestSlope = Infinity;
  for (let k = -3; k <= 3; k++) {
    const a = dir + k * 0.2;
    const h0 = cb.heightA(v.x - Math.sin(a) * 80, v.z - Math.cos(a) * 80);
    const h1 = cb.heightA(v.x + Math.sin(a) * 80, v.z + Math.cos(a) * 80);
    const sl = Math.abs(h1 - h0) / 160 + Math.abs(k) * 0.005;
    if (sl < bestSlope) {
      bestSlope = sl;
      best = a;
    }
  }
  const sx = Math.sin(best);
  const sz = Math.cos(best);
  const bend = rng.range(-14, 14);
  const control: P2[] = [
    { x: v.x - sx * 95, z: v.z - sz * 95 },
    { x: v.x - sx * 45 + sz * bend, z: v.z - sz * 45 - sx * bend },
    { x: v.x, z: v.z },
    { x: v.x + sx * 45 - sz * bend, z: v.z + sz * 45 + sx * bend },
    { x: v.x + sx * 95, z: v.z + sz * 95 },
  ];
  const road = cb.route({
    id: `${v.id}/street`,
    name: `${v.name} Street`,
    kind: 'trade-road',
    from: v.id,
    start: control[0]!,
    lead: control.slice(1, 4),
    goals: [{ p: control[4]!, h: cb.heightA(control[4]!.x, control[4]!.z), id: v.id }],
    allow: [v.id],
  });
  if (!road) return;
}

/** Crossroads: where a region without a village gathers its roads, marked by a waystone. */
function hub(cb: ContentBuilder, sk: RegionSkeleton, rng: Rng, near?: SiteSeed): void {
  const b = cb.c.bounds;
  const pts = sk.gates.length ? sk.gates : [{ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }];
  let cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  let cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  if (near) {
    // Just outside the site's own ground, on the side facing the way in.
    const a = Math.atan2(cx - near.x, cz - near.z);
    cx = near.x + Math.sin(a) * (near.reserve + 45);
    cz = near.z + Math.cos(a) * (near.reserve + 45);
  }
  let best = { x: cx, z: cz };
  let bestScore = Infinity;
  for (let i = 0; i < 24; i++) {
    const spread = near ? 40 : 180;
    const x = Math.min(b.x1 - 160, Math.max(b.x0 + 160, cx + rng.range(-spread, spread)));
    const z = Math.min(b.z1 - 160, Math.max(b.z0 + 160, cz + rng.range(-spread, spread)));
    if (cb.reserves.some((r) => Math.hypot(r.x - x, r.z - z) < r.r + 30)) continue;
    const e = 10;
    const slope = Math.hypot(cb.heightA(x + e, z) - cb.heightA(x - e, z), cb.heightA(x, z + e) - cb.heightA(x, z - e)) / (2 * e);
    const score = slope + Math.hypot(x - cx, z - cz) / 2000;
    if (score < bestScore) {
      bestScore = score;
      best = { x, z };
    }
  }
  const id = `${sk.id}/crossroads`;
  cb.c.sites.push({ id, kind: 'crossroads', name: `${sk.name.replace(/^the /, '')} Crossroads`.replace(/^./, (c) => c.toUpperCase()), x: best.x, z: best.z, radius: 20 });
  cb.reserves.push({ id, x: best.x, z: best.z, r: 0 });
  const yaw = rng.range(0, Math.PI * 2);
  cb.c.props.push({ id: `${id}/waystone`, kind: 'waystone', x: best.x + Math.sin(yaw) * 6, z: best.z + Math.cos(yaw) * 6, yaw: facing(best.x + Math.sin(yaw) * 6, best.z + Math.cos(yaw) * 6, best.x, best.z) });
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Compass word for a direction (yaw 0 = north = −Z). */
export function compassWord(dx: number, dz: number): string {
  const a = Math.atan2(dx, -dz);
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS[i]!;
}

/** A signpost wherever a road to a named place leaves the network. */
function junctionSigns(cb: ContentBuilder): void {
  const named = new Map(cb.c.sites.map((s) => [s.id, s] as const));
  for (const castle of cb.c.castles) named.set(castle.id, { id: castle.id, kind: 'castle', name: castle.name, x: castle.x, z: castle.z, radius: 0 });
  let i = 0;
  for (const road of cb.c.roads) {
    const dest = named.get(road.from);
    if (!dest || dest.kind === 'crossroads' || road.id.endsWith('/street')) continue;
    const n = road.points.length;
    if (n < 12) continue;
    // The far end of the road (where it meets the network); the sign stands a few metres along it.
    const j = n - 6;
    const f = ContentBuilder.frame(road, j);
    const x = f.p.x + f.nx * (road.halfWidth + 1.6);
    const z = f.p.z + f.nz * (road.halfWidth + 1.6);
    if (cb.c.props.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) continue;
    if (cb.c.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < Math.max(b.width, b.depth) / 2 + 2)) continue;
    if (cb.terrain.roadIndex.surfaceDistance(x, z) < 0.6) continue;
    const word = compassWord(dest.x - x, dest.z - z);
    cb.c.props.push({ id: `${cb.c.id}/sign${i++}`, kind: 'signpost', x, z, yaw: facing(0, 0, -f.tx, -f.tz), label: dest.name, text: `“${dest.name}” — the arm points ${word}, along the ${road.kind === 'footpath' ? 'path' : road.kind === 'farm-track' ? 'track' : 'road'}.` });
  }
}
