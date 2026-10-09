/**
 * Semantic world records. These are plain serialisable data — no Three.js
 * objects — so a site exists logically before (and after) its meshes do.
 */

export interface P2 {
  x: number;
  z: number;
}

export type RoadKind = 'trade-road' | 'farm-track' | 'footpath';

export interface RoadPlan {
  id: string;
  name: string;
  kind: RoadKind;
  /** Half width of the walkable surface in metres. */
  halfWidth: number;
  /** Distance beyond the half width over which terrain blends back. */
  blend: number;
  /** Densely sampled centreline (≈2 m spacing). */
  points: P2[];
  /** Graded surface height for every centreline point. */
  heights: number[];
  /** Cumulative arc length at every centreline point. */
  arc: number[];
  /** Site ids at the two ends (a road always leads somewhere). */
  from: string;
  to: string;
}

export type BuildingKind = 'cottage' | 'farmhouse' | 'barn' | 'shed' | 'longhouse' | 'church' | 'inn';
export type WallStyle = 'stone' | 'timber' | 'plaster';
export type RoofMaterial = 'tile' | 'slate' | 'thatch';

export interface BuildingPlan {
  id: string;
  kind: BuildingKind;
  /** Footprint centre. */
  x: number;
  z: number;
  /** Rotation about Y; the door is on the local +Z face. */
  yaw: number;
  width: number;
  depth: number;
  floors: number;
  wallStyle: WallStyle;
  upperStyle: WallStyle;
  roof: RoofMaterial;
  roofPitch: number;
  chimney: 'none' | 'left' | 'right';
  /** Height of the ground floor surface. */
  padHeight: number;
  seed: number;
  /** Enterable buildings (inns) have a real doorway, interior and stairs; others are closed. */
  enterable: boolean;
  settlementId: string;
  /** Lived-in buildings emit chimney smoke. */
  inhabited: boolean;
}

export interface CastleTower {
  x: number;
  z: number;
  radius: number;
  height: number;
  roof: 'spire' | 'crown' | 'pinnacles';
  square: boolean;
}

export interface CastlePlan {
  id: string;
  name: string;
  x: number;
  z: number;
  yaw: number;
  plateauRadius: number;
  plateauHeight: number;
  seed: number;
  /** Curtain wall ring (closed polygon, local coordinates around centre). */
  wall: P2[];
  wallHeight: number;
  towers: CastleTower[];
  keep: { x: number; z: number; w: number; d: number; h: number };
  cathedral: { x: number; z: number; length: number; width: number; height: number; spire: number; yaw: number };
  gate: { x: number; z: number; yaw: number };
}

export interface RuinPlan {
  id: string;
  name: string;
  kind: 'watchtower';
  x: number;
  z: number;
  yaw: number;
  radius: number;
  height: number;
  padHeight: number;
  seed: number;
}

export interface FieldPlan {
  id: string;
  x: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
  crop: 'wheat' | 'barley' | 'fallow' | 'cabbage';
}

export interface FencePlan {
  id: string;
  kind: 'wood-fence' | 'stone-wall' | 'hedge';
  points: P2[];
}

export interface Pad {
  /** Oriented rectangle (or circle when `circle` is true) flattened to height. */
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfD: number;
  circle: boolean;
  height: number;
  falloff: number;
}

export interface SettlementPlan {
  id: string;
  name: string;
  kind: 'hamlet' | 'farmstead' | 'village';
  x: number;
  z: number;
  buildingIds: string[];
}

export interface Clearing {
  x: number;
  z: number;
  radius: number;
}

/** A named place the player can discover (shown on the Atlas once found). */
export type SiteKind = 'village' | 'hamlet' | 'farmstead' | 'cottage' | 'watchtower' | 'castle' | 'stones' | 'shrine' | 'camp' | 'crossroads';

export interface SitePlan {
  id: string;
  kind: SiteKind;
  name: string;
  x: number;
  z: number;
  /** Discovery radius in metres. */
  radius: number;
}

/** Axis-aligned world bounds of a piece of planned content. */
export interface Bounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Everything planned for one area of the world (the opening vale, or one procedural region).
 * Content never reaches outside its bounds, except roads that end exactly on a border gate.
 */
export interface WorldContent {
  id: string;
  bounds: Bounds;
  castles: CastlePlan[];
  ruins: RuinPlan[];
  settlements: SettlementPlan[];
  buildings: BuildingPlan[];
  roads: RoadPlan[];
  fields: FieldPlan[];
  fences: FencePlan[];
  pads: Pad[];
  clearings: Clearing[];
  props: PropPlan[];
  /** Weapons lying in the world; each is generated from its seed with a local luck bias. */
  finds: WeaponFind[];
  /** Pads applied before roads are graded (castle summits). */
  prePads: Pad[];
  sites: SitePlan[];
  /** Border crossings where this area's roads meet its neighbours'. */
  gates: Gate[];
  /** Tree-free view wedge (the vale's opening vista). */
  sightline?: { from: P2; to: P2; halfWidth: number; spread: number };
}

export interface WorldPlan extends WorldContent {
  seed: string;
  generatorVersion: number;
  regionName: string;
  spawn: { x: number; z: number; yaw: number };
  ancientTree: { x: number; z: number };
  castle: CastlePlan;
  /** Tree-free view wedge from the spawn towards the castle (widens by `spread` per metre). */
  sightline: { from: P2; to: P2; halfWidth: number; spread: number };
}

/** A road crossing on a region border, agreed by the regions on both sides. */
export interface Gate {
  id: string;
  x: number;
  z: number;
  /** Unit direction pointing into the region that owns this copy of the gate. */
  inX: number;
  inZ: number;
}

/** One procedurally planned region of the open world (a square cell of the region grid). */
export interface RegionPlan extends WorldContent {
  rx: number;
  rz: number;
  name: string;
  /** Regional fortune: shifts the luck of everything found here (can be negative). */
  fortune: number;
}

export interface WeaponFind {
  id: string;
  x: number;
  z: number;
  yaw: number;
  pose: 'lying' | 'stuck' | 'leaning' | 'chest';
  seed: number;
  /** Luck bias for the rarity/condition roll (negative = humble places). */
  luck: number;
  /** Indoors: which building, and how far above its floor pad (final height is set in `y`). */
  level?: { building: string; height: number };
  /** Absolute height for finds indoors (upstairs); otherwise they rest on the ground. */
  y?: number;
  cls?: 'axe' | 'spear';
  /** A line describing how it was left there. */
  story: string;
}

export type PropKind =
  | 'well'
  | 'haystack'
  | 'cart'
  | 'barrel'
  | 'signpost'
  | 'waystone'
  | 'woodpile'
  | 'bench'
  | 'chopping-block'
  | 'chest'
  | 'standing-stone'
  | 'shrine'
  | 'tent'
  | 'campfire'
  | 'lantern'
  | 'grave';

export interface PropPlan {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  yaw: number;
  /** Optional sign text for signposts. */
  label?: string;
  /** Size multiplier (standing stones; negative = fallen). */
  scale?: number;
  /** What the player reads when examining it. */
  text?: string;
  /** Indoors: which building, and how far above its floor pad (final height is set in `y`). */
  level?: { building: string; height: number };
  /** Absolute height for props indoors; otherwise they stand on the ground. */
  y?: number;
}
