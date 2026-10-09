/**
 * Weapon finds and chests at their planned places in the world. Each find's
 * weapon is generated deterministically from its seed and local luck; taking
 * one swaps it with the weapon in hand, which is left in its place (nothing is
 * lost). State lives for the journey; persistent saves arrive with Milestone 4.
 */
import * as THREE from 'three';
import { deriveSeed, Rng } from '../core/rng';
import { MeshBuilder, col } from '../assets/geo';
import { buildWeapon } from '../assets/weaponMesh';
import { generateWeapon, type WeaponClass, type WeaponGenome } from './weapons';
import { RARITY_COLOURS } from './luck';
import type { MaterialLibrary } from '../rendering/materials';
import type { TerrainLike } from '../world/terrain';
import type { PropPlan, WeaponFind } from '../world/types';
import type { WeaponRef } from './save';

/** The plain arms a journey can begin with (the reference seed always starts with a longsword). */
const STARTER_CLASSES: WeaponClass[] = ['longsword', 'shortsword', 'sabre', 'falchion', 'axe', 'mace', 'spear', 'dagger'];

export function starterWeapon(seed: string): WeaponGenome {
  const cls = seed === 'reference-valley' ? 'longsword' : new Rng(deriveSeed(seed, 'loot/starter-class')).pick(STARTER_CLASSES);
  return generateWeapon(deriveSeed(seed, 'loot/starter'), { id: `${seed}/weapon/starter`, cls, rarity: 'common', materials: ['steel', 'iron'] });
}

export function findWeapon(find: WeaponFind): WeaponGenome {
  return generateWeapon(find.seed, { id: find.id, luck: find.luck, cls: find.cls });
}

/** The recipe of a weapon (for saves): every weapon in a journey is the starter or a find's roll. */
export function weaponRef(w: WeaponGenome, finds: Map<string, WeaponFind>): WeaponRef {
  const f = finds.get(w.id);
  return f ? { kind: 'find', id: f.id, seed: f.seed, luck: f.luck, cls: f.cls } : { kind: 'starter' };
}

export function weaponFromRef(ref: WeaponRef, journeySeed: string): WeaponGenome {
  return ref.kind === 'starter' ? starterWeapon(journeySeed) : generateWeapon(ref.seed, { id: ref.id, luck: ref.luck, cls: ref.cls });
}

interface FindState {
  find: WeaponFind;
  weapon: WeaponGenome;
  group: THREE.Group;
  glint: THREE.Points;
  phase: number;
  anchor: THREE.Vector3;
  areaId: string;
  /** Chests: the lid, and how far it has swung open (0..1). */
  lid?: THREE.Group;
  lidOpen: number;
}

/**
 * Weapon finds in the loaded parts of the world. Areas stream in and out; what
 * the player has done (swapped a weapon, opened a chest) is remembered for the
 * journey, so a region looks the same when you come back to it.
 */
export class LootSystem {
  readonly group = new THREE.Group();
  private readonly states = new Map<string, FindState>();
  private readonly areas = new Map<string, { finds: WeaponFind[]; props: PropPlan[] }>();
  /** Weapons the player left in place of the ones they took. */
  private readonly swapped = new Map<string, WeaponGenome>();
  private readonly opened = new Set<string>();
  /** Every find seen this journey (so a weapon's recipe is known after its region unloads). */
  readonly known = new Map<string, WeaponFind>();
  private readonly glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  private time = 0;

  constructor(
    private readonly terrain: TerrainLike,
    private readonly materials: MaterialLibrary,
  ) {
    this.group.name = 'loot';
  }

  /** A new journey: every find restored, every chest shut. */
  reset(): void {
    this.swapped.clear();
    this.opened.clear();
    for (const [id, a] of [...this.areas]) {
      this.removeArea(id);
      this.addArea(id, a.finds, a.props);
    }
  }

  addArea(areaId: string, finds: WeaponFind[], props: PropPlan[]): void {
    if (this.areas.has(areaId)) return;
    this.areas.set(areaId, { finds, props });
    for (const find of finds) {
      this.known.set(find.id, find);
      const weapon = this.swapped.get(find.id) ?? findWeapon(find);
      const st: FindState = { find, weapon, group: new THREE.Group(), glint: this.makeGlint(weapon), phase: (find.seed % 1000) / 159, anchor: new THREE.Vector3(), areaId, lidOpen: this.opened.has(find.id) ? 1 : 0 };
      this.states.set(find.id, st);
      this.place(st, props);
      this.group.add(st.group, st.glint);
      if (st.lid) this.group.add(st.lid);
    }
  }

  removeArea(areaId: string): void {
    if (!this.areas.delete(areaId)) return;
    for (const [id, st] of [...this.states]) {
      if (st.areaId !== areaId) continue;
      this.group.remove(st.group, st.glint);
      if (st.lid) {
        this.group.remove(st.lid);
        this.disposeGroup(st.lid);
      }
      this.disposeGroup(st.group);
      st.glint.geometry.dispose();
      this.states.delete(id);
    }
  }

  get finds(): FindState[] {
    return [...this.states.values()];
  }

  weaponAt(id: string): WeaponGenome | undefined {
    return this.states.get(id)?.weapon;
  }

  /** What a journey has changed, for saving. */
  snapshot(): { swapped: Record<string, WeaponRef>; opened: string[] } {
    const swapped: Record<string, WeaponRef> = {};
    for (const [id, w] of this.swapped) swapped[id] = weaponRef(w, this.known);
    return { swapped, opened: [...this.opened] };
  }

  /** Restore a saved journey's changes (areas already loaded are rebuilt). */
  restore(s: { swapped: Record<string, WeaponRef>; opened: string[] }, journeySeed: string, finds: WeaponFind[]): void {
    for (const f of finds) this.known.set(f.id, f);
    this.swapped.clear();
    this.opened.clear();
    for (const [id, ref] of Object.entries(s.swapped)) {
      if (ref.kind === 'find') this.known.set(ref.id, { id: ref.id, x: 0, z: 0, yaw: 0, pose: 'lying', seed: ref.seed, luck: ref.luck, cls: ref.cls, story: '' });
      this.swapped.set(id, weaponFromRef(ref, journeySeed));
    }
    for (const id of s.opened) this.opened.add(id);
    for (const [id, a] of [...this.areas]) {
      this.removeArea(id);
      this.addArea(id, a.finds, a.props);
    }
  }

  /** A chest that has not been opened yet. */
  isClosedChest(id: string): boolean {
    const st = this.states.get(id);
    return !!st && st.find.pose === 'chest' && !this.opened.has(id);
  }

  /** Open a chest: the lid swings up and its weapon is revealed. */
  open(id: string): WeaponGenome | null {
    const st = this.states.get(id);
    if (!st || st.find.pose !== 'chest' || this.opened.has(id)) return null;
    this.opened.add(id);
    st.group.visible = true;
    return st.weapon;
  }

  /** Swap: take the find's weapon, leave `current` in its place. */
  take(id: string, current: WeaponGenome): WeaponGenome {
    const st = this.states.get(id)!;
    const taken = st.weapon;
    st.weapon = current;
    this.swapped.set(id, current);
    this.group.remove(st.group, st.glint);
    this.disposeGroup(st.group);
    st.glint.geometry.dispose();
    st.group = new THREE.Group();
    st.glint = this.makeGlint(current);
    const area = this.areas.get(st.areaId);
    this.place(st, area?.props ?? [], false);
    this.group.add(st.group, st.glint);
    return taken;
  }

  private makeGlint(w: WeaponGenome): THREE.Points {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const m = new THREE.PointsMaterial({ color: new THREE.Color(RARITY_COLOURS[w.rarity]).multiplyScalar(1.6), size: 3, sizeAttenuation: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  }

  private place(st: FindState, props: PropPlan[], makeLid = true): void {
    const { find, weapon } = st;
    const b = new MeshBuilder();
    buildWeapon(b, weapon);
    for (const [key, geo] of b.build()) {
      const mat = key === 'glow' ? this.glow : this.materials.get(key === 'steel' ? 'metal' : 'plain');
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      st.group.add(mesh);
    }
    const ground = find.y ?? this.terrain.height(find.x, find.z);
    const hafted = weapon.family !== 'blade';
    const len = hafted ? weapon.shape.gripLength + 0.12 : weapon.shape.bladeLength;
    const g = st.group;
    g.rotation.order = 'YXZ';
    g.rotation.y = find.yaw;
    if (find.pose === 'chest') {
      // Lying across the open chest; hidden until the lid is lifted.
      g.rotation.y = find.yaw + Math.PI / 2;
      g.rotation.x = -Math.PI / 2;
      g.rotation.z = 0.1;
      g.position.set(find.x, ground + 0.5, find.z);
      st.anchor.set(find.x, ground + 0.7, find.z);
      g.visible = this.opened.has(find.id);
      if (makeLid && !st.lid) {
        const lb = new MeshBuilder();
        lb.box('planks', new THREE.Matrix4(), 0, 0.06, 0.3, 0.94, 0.12, 0.62, { color: col('#a87c50') });
        for (const sx of [-0.3, 0.3]) lb.box('metal', new THREE.Matrix4(), sx, 0.07, 0.3, 0.07, 0.14, 0.64, { color: col('#3a3430') });
        const lid = new THREE.Group();
        for (const [key, geo] of lb.build()) lid.add(new THREE.Mesh(geo, this.materials.get(key as 'planks' | 'metal')));
        // Hinged along the chest's back edge (local −Z).
        const back = new THREE.Vector3(0, 0, -0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), find.yaw);
        lid.position.set(find.x + back.x, ground + 0.46, find.z + back.z);
        lid.rotation.order = 'YXZ';
        lid.rotation.y = find.yaw;
        st.lid = lid;
      }
    } else if (find.pose === 'lying') {
      g.rotation.x = -Math.PI / 2;
      g.rotation.z = 0.15;
      g.position.set(find.x, ground + 0.04, find.z);
      st.anchor.set(find.x, ground + 0.35, find.z);
    } else if (find.pose === 'stuck') {
      // Point (or head) down, a third of it in the ground or block.
      const blockTop = props.some((p) => p.kind === 'chopping-block' && Math.hypot(p.x - find.x, p.z - find.z) < 0.5) ? 0.5 : 0;
      g.rotation.x = Math.PI + 0.12;
      g.rotation.z = 0.08;
      const above = hafted ? weapon.shape.gripLength - 0.04 : len * 0.68 + 0.03;
      g.position.set(find.x, ground + blockTop + above, find.z);
      st.anchor.set(find.x, ground + blockTop + above + 0.2, find.z);
    } else {
      // Leaning back against a wall behind it (local −Z).
      g.rotation.x = -0.24;
      const base = hafted ? 0.14 : weapon.shape.gripLength + 0.04;
      g.position.set(find.x, ground + base, find.z);
      st.anchor.set(find.x, ground + base + 0.6, find.z);
    }
    st.glint.position.copy(st.anchor);
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.time += dt;
    for (const st of this.states.values()) {
      const closed = st.find.pose === 'chest' && !this.opened.has(st.find.id);
      if (st.lid) {
        const target = closed ? 0 : 1;
        st.lidOpen += (target - st.lidOpen) * Math.min(1, dt * 4);
        st.lid.rotation.x = -1.95 * st.lidOpen;
      }
      if (closed) {
        st.glint.visible = false;
        continue;
      }
      const d = st.anchor.distanceTo(cam);
      // A brief twinkle every few seconds, visible within ~45 m; rarer finds twinkle more.
      const tw = Math.sin(this.time * (1.3 + (st.weapon.rarity === 'common' ? 0 : 0.6)) + st.phase * 6.283);
      st.glint.visible = d < 45 && tw > 0.9;
    }
  }

  private disposeGroup(g: THREE.Group): void {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
