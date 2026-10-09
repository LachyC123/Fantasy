/**
 * The open world's region grid. Every region is a square cell planned from
 * (seed, rx, rz) alone, so any region can be generated in any order, on any
 * thread, and always comes out the same. Neighbours agree on where roads cross
 * their shared border through "gates", which are a pure function of the edge.
 *
 * The opening vale owns a block of cells and is planned by its own authored
 * generator; it exposes gates on its outer border like any other region.
 */
import { deriveSeed, hashInts, Rng } from '../core/rng';
import type { MacroField } from './macro';
import type { Bounds, CastlePlan, Gate, SiteKind } from './types';
import { planCastleAt } from './castle';
import { castleName, keepName, villageName, towerName, stonesName, shrineName, campName, regionName, familyName, farmName, uniqueName } from './names';

/** Region edge length in metres. */
export const REGION = 1024;
/** Cells owned by the opening vale (inclusive). */
export const VALE_CELLS = { rx0: -2, rx1: 1, rz0: -2, rz1: 0 };
export const VALE_BOUNDS: Bounds = {
  x0: VALE_CELLS.rx0 * REGION,
  z0: VALE_CELLS.rz0 * REGION,
  x1: (VALE_CELLS.rx1 + 1) * REGION,
  z1: (VALE_CELLS.rz1 + 1) * REGION,
};
/** Planned content keeps this far inside its region's border (gate roads excepted). */
export const BORDER_MARGIN = 90;

export const cellOf = (v: number): number => Math.floor(v / REGION);

export function inVale(rx: number, rz: number): boolean {
  return rx >= VALE_CELLS.rx0 && rx <= VALE_CELLS.rx1 && rz >= VALE_CELLS.rz0 && rz <= VALE_CELLS.rz1;
}

export function regionBounds(rx: number, rz: number): Bounds {
  return { x0: rx * REGION, z0: rz * REGION, x1: (rx + 1) * REGION, z1: (rz + 1) * REGION };
}

export const regionId = (seed: string, rx: number, rz: number): string => `${seed}/r${rx},${rz}`;

/** Edge identity: 'v' = vertical edge x = (i+1)·REGION between cells i and i+1 at row j; 'h' = horizontal edge z = (j+1)·REGION. */
type EdgeKind = 'v' | 'h';

function edgeIsValeInternal(kind: EdgeKind, i: number, j: number): boolean {
  return kind === 'v' ? inVale(i, j) && inVale(i + 1, j) : inVale(i, j) && inVale(i, j + 1);
}

function edgeOnValeBorder(kind: EdgeKind, i: number, j: number): boolean {
  return kind === 'v' ? inVale(i, j) !== inVale(i + 1, j) : inVale(i, j) !== inVale(i, j + 1);
}

interface EdgeGate {
  x: number;
  z: number;
  slope: number;
}

const gateCache = new Map<string, EdgeGate | null>();

/**
 * Where (if anywhere) a road crosses this edge. Candidates along the middle of
 * the edge are scored by local slope; impassable edges have no gate. Edges on
 * the vale's border always open on the gentlest crossing of each vale side.
 */
function edgeGate(seed: string, macro: MacroField, kind: EdgeKind, i: number, j: number): EdgeGate | null {
  const key = `${seed}|${kind}|${i}|${j}`;
  const cached = gateCache.get(key);
  if (cached !== undefined) return cached;
  let result: EdgeGate | null = null;
  if (!edgeIsValeInternal(kind, i, j)) {
    const h = hashInts(deriveSeed(seed, 'region/edge'), kind === 'v' ? 1 : 2, i, j);
    const r = h / 4294967296;
    const best = bestCrossing(seed, macro, kind, i, j);
    const vale = edgeOnValeBorder(kind, i, j);
    const open = vale ? r < 0.5 || isValeSideFavourite(seed, macro, kind, i, j) : r < 0.72;
    if (open && best && best.slope < 0.28) result = best;
  }
  if (gateCache.size > 20000) gateCache.clear();
  gateCache.set(key, result);
  return result;
}

function bestCrossing(seed: string, macro: MacroField, kind: EdgeKind, i: number, j: number): EdgeGate | null {
  const salt = deriveSeed(seed, 'region/gate');
  let best: EdgeGate | null = null;
  let bestScore = Infinity;
  for (let k = 0; k <= 12; k++) {
    const t = 0.22 + (0.56 * k) / 12;
    const x = kind === 'v' ? (i + 1) * REGION : (i + t) * REGION;
    const z = kind === 'v' ? (j + t) * REGION : (j + 1) * REGION;
    const e = 10;
    const h = macro.height(x, z);
    const slope = Math.hypot(macro.height(x + e, z) - macro.height(x - e, z), macro.height(x, z + e) - macro.height(x, z - e)) / (2 * e);
    const score = slope + (hashInts(salt, i, j, k, kind === 'v' ? 1 : 2) / 4294967296) * 0.04 + Math.max(0, h - 180) * 0.0008;
    if (score < bestScore) {
      bestScore = score;
      best = { x, z, slope };
    }
  }
  return best;
}

/** On each side of the vale, the gentlest border edge is always open (the vale always has exits). */
function isValeSideFavourite(seed: string, macro: MacroField, kind: EdgeKind, i: number, j: number): boolean {
  const V = VALE_CELLS;
  const edges: [EdgeKind, number, number][] = [];
  if (kind === 'v' && i === V.rx1) for (let z = V.rz0; z <= V.rz1; z++) edges.push(['v', V.rx1, z]); // east
  else if (kind === 'v' && i === V.rx0 - 1) for (let z = V.rz0; z <= V.rz1; z++) edges.push(['v', V.rx0 - 1, z]); // west
  else if (kind === 'h' && j === V.rz1) for (let x = V.rx0; x <= V.rx1; x++) edges.push(['h', x, V.rz1]); // south
  else if (kind === 'h' && j === V.rz0 - 1) for (let x = V.rx0; x <= V.rx1; x++) edges.push(['h', x, V.rz0 - 1]); // north
  let fav: [EdgeKind, number, number] | null = null;
  let favSlope = Infinity;
  for (const e of edges) {
    const g = bestCrossing(seed, macro, ...e);
    if (g && g.slope < favSlope) {
      favSlope = g.slope;
      fav = e;
    }
  }
  return fav !== null && fav[0] === kind && fav[1] === i && fav[2] === j;
}

/** Gates on the border of a cell (or, for the vale, of the whole vale block). */
export function cellGates(seed: string, macro: MacroField, rx: number, rz: number): Gate[] {
  const out: Gate[] = [];
  const add = (g: EdgeGate | null, id: string, inX: number, inZ: number): void => {
    if (g) out.push({ id: `${seed}/gate/${id}`, x: g.x, z: g.z, inX, inZ });
  };
  add(edgeGate(seed, macro, 'v', rx, rz), `v${rx},${rz}`, -1, 0); // east edge
  add(edgeGate(seed, macro, 'v', rx - 1, rz), `v${rx - 1},${rz}`, 1, 0); // west edge
  add(edgeGate(seed, macro, 'h', rx, rz), `h${rx},${rz}`, 0, -1); // south edge (+Z)
  add(edgeGate(seed, macro, 'h', rx, rz - 1), `h${rx},${rz - 1}`, 0, 1); // north edge
  return out;
}

export function valeGates(seed: string, macro: MacroField): Gate[] {
  const out: Gate[] = [];
  const V = VALE_CELLS;
  for (let rx = V.rx0; rx <= V.rx1; rx++)
    for (let rz = V.rz0; rz <= V.rz1; rz++) for (const g of cellGates(seed, macro, rx, rz)) out.push(g);
  return out;
}

// ---------------------------------------------------------------- skeleton

export interface SiteSeed {
  id: string;
  kind: Exclude<SiteKind, 'hamlet' | 'crossroads'>;
  name: string;
  x: number;
  z: number;
  /** Ground reserved for the site's own layout (roads route around other sites' reservations). */
  reserve: number;
  seed: number;
}

/**
 * The cheap first stage of a region: its name, fortune, gates, the kinds and
 * positions of its sites, and its castle layout. It needs only the macro
 * height field, so far-away terrain can respect castle summits without the
 * full plan.
 */
export interface RegionSkeleton {
  id: string;
  rx: number;
  rz: number;
  name: string;
  fortune: number;
  gates: Gate[];
  sites: SiteSeed[];
  castles: CastlePlan[];
}

interface Candidate {
  x: number;
  z: number;
  h: number;
  slope: number;
  prominence: number;
  used: boolean;
}

const RESERVE: Record<SiteSeed['kind'], number> = {
  village: 95,
  farmstead: 120,
  cottage: 22,
  watchtower: 24,
  castle: 150,
  stones: 22,
  shrine: 10,
  camp: 20,
};

export function regionSkeleton(seed: string, macro: MacroField, rx: number, rz: number): RegionSkeleton {
  const id = regionId(seed, rx, rz);
  const rng = new Rng(deriveSeed(seed, 'region/v1', rx, rz));
  const b = regionBounds(rx, rz);
  const gates = cellGates(seed, macro, rx, rz);

  // Candidate grid: 8×8 jittered samples inside the border margin.
  const cands: Candidate[] = [];
  const n = 8;
  const inner = REGION - 2 * (BORDER_MARGIN + 40);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = b.x0 + BORDER_MARGIN + 40 + ((i + rng.range(0.15, 0.85)) / n) * inner;
      const z = b.z0 + BORDER_MARGIN + 40 + ((j + rng.range(0.15, 0.85)) / n) * inner;
      const h = macro.height(x, z);
      const e = 12;
      const slope = Math.hypot(macro.height(x + e, z) - macro.height(x - e, z), macro.height(x, z + e) - macro.height(x, z - e)) / (2 * e);
      let ring = 0;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ring += macro.height(x + Math.cos(a) * 200, z + Math.sin(a) * 200);
      }
      cands.push({ x, z, h, slope, prominence: h - ring / 6, used: false });
    }

  // Distance from the spawn makes the wider world a little wilder and luckier.
  const far = Math.hypot((rx + 0.5) * REGION, (rz + 0.5) * REGION);
  const fortune = Math.max(-2.5, Math.min(2.5, rng.gaussian() * 0.75 + Math.min(0.8, far / 9000)));

  const sites: SiteSeed[] = [];
  const castles: CastlePlan[] = [];
  const used = new Set<string>();
  const nm = (gen: (r: Rng) => string): string => uniqueName(rng, used, gen);
  const spacingOk = (c: Candidate, reserve: number): boolean => {
    for (const s of sites) if (Math.hypot(s.x - c.x, s.z - c.z) < s.reserve + reserve + 50) return false;
    for (const g of gates) if (Math.hypot(g.x - c.x, g.z - c.z) < reserve + 60) return false;
    return true;
  };
  const inside = (c: Candidate, r: number): boolean => c.x - r > b.x0 + BORDER_MARGIN - 30 && c.x + r < b.x1 - BORDER_MARGIN + 30 && c.z - r > b.z0 + BORDER_MARGIN - 30 && c.z + r < b.z1 - BORDER_MARGIN + 30;
  const pick = (kind: SiteSeed['kind'], score: (c: Candidate) => number): Candidate | null => {
    let best: Candidate | null = null;
    let bestS = -Infinity;
    for (const c of cands) {
      if (c.used || !inside(c, RESERVE[kind] * 0.5) || !spacingOk(c, RESERVE[kind])) continue;
      const s = score(c) + rng.range(0, 0.15);
      if (s > bestS) {
        bestS = s;
        best = c;
      }
    }
    if (best && Number.isFinite(bestS)) best.used = true;
    return best && Number.isFinite(bestS) ? best : null;
  };
  const add = (kind: SiteSeed['kind'], c: Candidate, name: string): SiteSeed => {
    const s: SiteSeed = { id: `${id}/${kind}${sites.length}`, kind, name, x: c.x, z: c.z, reserve: RESERVE[kind], seed: rng.int(0, 2 ** 31) };
    sites.push(s);
    return s;
  };
  const flatLow = (c: Candidate): number => (c.slope < 0.13 && c.h < 230 ? 1 - c.slope * 5 - c.h / 600 : -Infinity);

  // A castle crowns a prominent summit (rare).
  if (rng.chance(0.16)) {
    const c = pick('castle', (k) => (k.prominence > 16 && k.slope < 0.4 && k.h < 420 && inside(k, 210) ? k.prominence / 40 : -Infinity));
    if (c) {
      const great = rng.chance(0.22);
      const s = add('castle', c, '');
      const castle = planCastleAt({
        id: `${s.id}/castle`,
        rng: new Rng(s.seed),
        x: c.x,
        z: c.z,
        radius: great ? rng.range(95, 110) : rng.range(52, 68),
        yaw: rng.range(0, Math.PI * 2),
        great,
        height: (x, z) => macro.height(x, z),
        name: great ? castleName : keepName,
      });
      s.name = castle.name;
      castles.push(castle);
    }
  }
  if (rng.chance(0.55)) {
    const c = pick('village', flatLow);
    if (c) add('village', c, nm(villageName));
  }
  for (let k = rng.int(0, 2); k > 0; k--) {
    const c = pick('farmstead', flatLow);
    if (c) add('farmstead', c, nm(farmName));
  }
  if (rng.chance(0.5)) {
    const c = pick('watchtower', (k) => (k.slope < 0.3 ? k.prominence / 20 : -Infinity));
    if (c) add('watchtower', c, nm(towerName));
  }
  if (rng.chance(0.32)) {
    const c = pick('stones', (k) => (k.slope < 0.2 ? k.prominence / 30 + k.h / 400 : -Infinity));
    if (c) add('stones', c, nm(stonesName));
  }
  if (rng.chance(0.38)) {
    const c = pick('shrine', (k) => (k.slope < 0.25 ? 0 : -Infinity));
    if (c) add('shrine', c, nm(shrineName));
  }
  if (rng.chance(0.34)) {
    const c = pick('camp', (k) => (k.slope < 0.2 ? -k.prominence / 30 : -Infinity));
    if (c) add('camp', c, nm(campName));
  }
  for (let k = rng.int(0, 2); k > 0; k--) {
    const c = pick('cottage', (k2) => (k2.slope < 0.2 ? -k2.slope : -Infinity));
    if (c) add('cottage', c, nm((r) => `${familyName(r)}’s Cottage`));
  }
  return { id, rx, rz, name: regionName(rng), fortune, gates, sites, castles };
}
