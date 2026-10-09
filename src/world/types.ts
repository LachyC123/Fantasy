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

export type BuildingKind = 'cottage' | 'farmhouse' | 'barn' | 'shed' | 'longhouse';
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
  /** Interiors arrive in Milestone 2; nothing here pretends to be enterable. */
  enterable: false;
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
  kind: 'hamlet' | 'farmstead';
  x: number;
  z: number;
  buildingIds: string[];
}

export interface Clearing {
  x: number;
  z: number;
  radius: number;
}

export interface WorldPlan {
  seed: string;
  generatorVersion: number;
  regionName: string;
  spawn: { x: number; z: number; yaw: number };
  ancientTree: { x: number; z: number };
  castle: CastlePlan;
  ruins: RuinPlan[];
  settlements: SettlementPlan[];
  buildings: BuildingPlan[];
  roads: RoadPlan[];
  fields: FieldPlan[];
  fences: FencePlan[];
  pads: Pad[];
  clearings: Clearing[];
  /** Tree-free view wedge from the spawn towards the castle (widens by `spread` per metre). */
  sightline: { from: P2; to: P2; halfWidth: number; spread: number };
  props: PropPlan[];
}

export type PropKind = 'well' | 'haystack' | 'cart' | 'barrel' | 'signpost' | 'waystone' | 'woodpile' | 'bench';

export interface PropPlan {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
  yaw: number;
  /** Optional sign text for signposts. */
  label?: string;
}
