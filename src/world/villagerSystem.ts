/**
 * Living residents: they stroll their stretch of street, pause, glance about,
 * stand at their posts (the inn counter, the church porch), step aside for
 * nobody but stop when you are in their way, and turn to face you when you
 * talk to them. Only residents near the camera are animated.
 */
import * as THREE from 'three';
import { buildVillager, type VillagerRig } from '../assets/villagerMesh';
import { planVillagers, type VillagerPlan } from '../gameplay/villagers';
import { Rng, deriveSeed } from '../core/rng';
import type { MaterialLibrary } from '../rendering/materials';
import type { TerrainLike } from './terrain';
import type { WorldContent } from './types';

const VISIBLE = 240;

export class Villager {
  readonly rig: VillagerRig;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  private state: 'idle' | 'walk' | 'talk' = 'idle';
  private timer = 1;
  private s = 0;
  private dir = 1;
  private readonly arc: number[] = [];
  private readonly speed: number;
  private phase = 0;
  private walkAmt = 0;
  private faceYaw = 0;
  private readonly rng: Rng;
  private talkYaw = 0;

  constructor(
    readonly plan: VillagerPlan,
    materials: MaterialLibrary,
    private readonly terrain: TerrainLike,
  ) {
    this.rig = buildVillager(plan.look, materials);
    this.rng = new Rng(deriveSeed(plan.id, 'behaviour'));
    this.speed = this.rng.range(1.05, 1.45);
    if (plan.route) {
      let acc = 0;
      plan.route.forEach((p, i) => {
        if (i > 0) acc += Math.hypot(p.x - plan.route![i - 1]!.x, p.z - plan.route![i - 1]!.z);
        this.arc.push(acc);
      });
      this.s = this.rng.range(0, acc);
      this.dir = this.rng.chance(0.5) ? 1 : -1;
      this.place();
    } else if (plan.post) {
      this.x = plan.post.x;
      this.z = plan.post.z;
      this.yaw = this.faceYaw = plan.post.yaw;
    }
    this.y = plan.post?.y ?? terrain.height(this.x, this.z);
    this.rig.root.position.set(this.x, this.y, this.z);
    this.rig.root.rotation.y = this.yaw;
  }

  /** Head height, for interaction targeting. */
  get headPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y + this.plan.look.height * 0.92, this.z);
  }

  private place(): void {
    const r = this.plan.route!;
    const total = this.arc[this.arc.length - 1]!;
    this.s = Math.max(0, Math.min(total, this.s));
    let i = 1;
    while (i < this.arc.length - 1 && this.arc[i]! < this.s) i++;
    const a = r[i - 1]!;
    const b = r[i]!;
    const seg = this.arc[i]! - this.arc[i - 1]! || 1;
    const t = (this.s - this.arc[i - 1]!) / seg;
    this.x = a.x + (b.x - a.x) * t;
    this.z = a.z + (b.z - a.z) * t;
    const dx = (b.x - a.x) * this.dir;
    const dz = (b.z - a.z) * this.dir;
    if (dx || dz) this.faceYaw = Math.atan2(dx, dz);
  }

  /** Stop and face the player for a while. */
  talk(px: number, pz: number): void {
    this.state = 'talk';
    this.timer = 9;
    this.talkYaw = Math.atan2(px - this.x, pz - this.z);
  }

  update(dt: number, cam: THREE.Vector3, player: THREE.Vector3): void {
    const d = Math.hypot(this.x - cam.x, this.z - cam.z);
    this.rig.root.visible = d < VISIBLE;
    if (d > VISIBLE) return;
    const rng = this.rng;
    const close = Math.hypot(player.x - this.x, player.z - this.z);
    this.timer -= dt;
    if (this.state === 'talk') {
      this.faceYaw = this.talkYaw;
      if (this.timer <= 0) {
        this.state = 'idle';
        this.timer = rng.range(1, 3);
      }
    } else if (this.plan.route) {
      if (this.state === 'walk') {
        // Stop rather than walk into the player.
        const ahead = (player.x - this.x) * Math.sin(this.faceYaw) + (player.z - this.z) * Math.cos(this.faceYaw);
        if (close < 1.6 && ahead > 0) {
          this.state = 'idle';
          this.timer = rng.range(1.5, 3);
        } else {
          this.s += this.dir * this.speed * dt;
          const total = this.arc[this.arc.length - 1]!;
          if (this.s <= 0 || this.s >= total) {
            this.dir = -this.dir;
            this.state = 'idle';
            this.timer = rng.range(2, 6);
          } else if (rng.next() < dt * 0.06) {
            this.state = 'idle';
            this.timer = rng.range(1.5, 4);
          }
          this.place();
        }
      } else if (this.timer <= 0) {
        this.state = 'walk';
        this.timer = 0;
        this.place();
      }
      this.y = this.terrain.height(this.x, this.z);
    } else if (this.plan.post && close < 5) {
      // At a post: turn towards someone who comes close.
      this.faceYaw = Math.atan2(player.x - this.x, player.z - this.z);
    } else if (this.plan.post && this.timer <= 0) {
      this.faceYaw = this.plan.post.yaw + rng.range(-0.6, 0.6);
      this.timer = rng.range(3, 8);
    }
    // Turn smoothly.
    let dy = this.faceYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 5);
    // Walk cycle and idle.
    const walking = this.state === 'walk' ? 1 : 0;
    this.walkAmt += (walking - this.walkAmt) * Math.min(1, dt * 6);
    this.phase += dt * (walking ? this.speed * 5.2 : 1.1);
    const r = this.rig;
    const swing = Math.sin(this.phase) * 0.55 * this.walkAmt;
    r.legL.rotation.x = swing;
    r.legR.rotation.x = -swing;
    r.armL.rotation.x = -swing * 0.8;
    r.armR.rotation.x = swing * 0.8;
    const talking = this.state === 'talk' ? 1 : 0;
    r.armR.rotation.z = talking * (0.25 + 0.15 * Math.sin(this.phase * 2.3));
    r.body.position.y = Math.abs(Math.sin(this.phase)) * 0.035 * this.walkAmt + (1 - this.walkAmt) * Math.sin(this.phase * 0.9) * 0.006;
    r.head.rotation.y = (1 - this.walkAmt) * Math.sin(this.phase * 0.37) * 0.35;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.y = this.yaw;
  }

  dispose(): void {
    this.rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}

export class VillagerSystem {
  readonly group = new THREE.Group();
  private readonly areas = new Map<string, Villager[]>();

  constructor(
    private readonly materials: MaterialLibrary,
    private readonly terrain: TerrainLike,
  ) {
    this.group.name = 'villagers';
  }

  addArea(id: string, content: WorldContent): void {
    if (this.areas.has(id)) return;
    const list = planVillagers(content).map((p) => new Villager(p, this.materials, this.terrain));
    for (const v of list) this.group.add(v.rig.root);
    this.areas.set(id, list);
  }

  removeArea(id: string): void {
    const list = this.areas.get(id);
    if (!list) return;
    for (const v of list) {
      this.group.remove(v.rig.root);
      v.dispose();
    }
    this.areas.delete(id);
  }

  get all(): Villager[] {
    return [...this.areas.values()].flat();
  }

  update(dt: number, cam: THREE.Vector3, player: THREE.Vector3): void {
    for (const list of this.areas.values()) for (const v of list) v.update(dt, cam, player);
  }
}
