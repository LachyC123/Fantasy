/**
 * Weapon finds at their planned places in the world. Each find's weapon is
 * generated deterministically from its seed and local luck; taking one swaps
 * it with the weapon in hand, which is left in its place (nothing is lost).
 * State lives for the session; persistent saves arrive with Milestone 4.
 */
import * as THREE from 'three';
import { deriveSeed } from '../core/rng';
import { MeshBuilder } from '../assets/geo';
import { buildWeapon } from '../assets/weaponMesh';
import { generateWeapon, type WeaponGenome } from './weapons';
import { RARITY_COLOURS } from './luck';
import type { MaterialLibrary } from '../rendering/materials';
import type { Terrain } from '../world/terrain';
import type { WeaponFind, WorldPlan } from '../world/types';

export function starterWeapon(seed: string): WeaponGenome {
  return generateWeapon(deriveSeed(seed, 'loot/starter'), { id: `${seed}/weapon/starter`, cls: 'longsword', rarity: 'common', materials: ['steel', 'iron'] });
}

export function findWeapon(find: WeaponFind): WeaponGenome {
  return generateWeapon(find.seed, { id: find.id, luck: find.luck, cls: find.cls });
}

interface FindState {
  find: WeaponFind;
  weapon: WeaponGenome;
  group: THREE.Group;
  glint: THREE.Points;
  phase: number;
  anchor: THREE.Vector3;
}

export class LootSystem {
  readonly group = new THREE.Group();
  private readonly states = new Map<string, FindState>();
  private readonly glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  private time = 0;

  constructor(
    private readonly plan: WorldPlan,
    private readonly terrain: Terrain,
    private readonly materials: MaterialLibrary,
  ) {
    this.group.name = 'loot';
    this.reset();
  }

  /** Restore every find to its generated weapon (new journey). */
  reset(): void {
    for (const s of this.states.values()) this.disposeGroup(s.group);
    this.states.clear();
    this.group.clear();
    for (const find of this.plan.finds) {
      const weapon = findWeapon(find);
      const st: FindState = { find, weapon, group: new THREE.Group(), glint: this.makeGlint(weapon), phase: (find.seed % 1000) / 159, anchor: new THREE.Vector3() };
      this.states.set(find.id, st);
      this.place(st);
      this.group.add(st.group, st.glint);
    }
  }

  get finds(): FindState[] {
    return [...this.states.values()];
  }

  weaponAt(id: string): WeaponGenome | undefined {
    return this.states.get(id)?.weapon;
  }

  /** Swap: take the find's weapon, leave `current` in its place. */
  take(id: string, current: WeaponGenome): WeaponGenome {
    const st = this.states.get(id)!;
    const taken = st.weapon;
    st.weapon = current;
    this.group.remove(st.group, st.glint);
    this.disposeGroup(st.group);
    st.group = new THREE.Group();
    st.glint = this.makeGlint(current);
    this.place(st);
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

  private place(st: FindState): void {
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
    const ground = this.terrain.height(find.x, find.z);
    const hafted = weapon.family !== 'blade';
    const len = hafted ? weapon.shape.gripLength + 0.12 : weapon.shape.bladeLength;
    const g = st.group;
    g.rotation.order = 'YXZ';
    g.rotation.y = find.yaw;
    if (find.pose === 'lying') {
      g.rotation.x = -Math.PI / 2;
      g.rotation.z = 0.15;
      g.position.set(find.x, ground + 0.04, find.z);
      st.anchor.set(find.x, ground + 0.35, find.z);
    } else if (find.pose === 'stuck') {
      // Point (or head) down, a third of it in the ground or block.
      const blockTop = this.plan.props.some((p) => p.kind === 'chopping-block' && Math.hypot(p.x - find.x, p.z - find.z) < 0.5) ? 0.5 : 0;
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
