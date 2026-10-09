/**
 * Hinged doors of enterable buildings. A door is a separate mesh pivoting on
 * its hinge; while shut it carries a collider, while open the doorway is
 * clear. Doors swing inward and remember their state for the journey.
 */
import * as THREE from 'three';
import { MeshBuilder, col } from '../assets/geo';
import type { Doorway } from '../assets/buildings';
import type { MaterialLibrary, MaterialName } from '../rendering/materials';
import type { CollisionWorld } from '../player/collision';

export class Door {
  readonly pivot = new THREE.Group();
  open = false;
  private angle = 0;
  readonly center: THREE.Vector3;

  constructor(
    readonly id: string,
    readonly doorway: Doorway,
    materials: MaterialLibrary,
    private readonly collision: CollisionWorld,
  ) {
    const { width: w, height: h } = doorway;
    const b = new MeshBuilder();
    const I = new THREE.Matrix4();
    b.box('planks', I, w / 2, h / 2, 0, w - 0.04, h - 0.02, 0.08, { color: col('#a87c50') });
    for (const y of [0.35, h - 0.4]) b.box('metal', I, w * 0.4, y, 0.05, w * 0.7, 0.08, 0.02, { color: col('#2a2622') });
    b.box('metal', I, w - 0.18, h * 0.48, 0.07, 0.07, 0.07, 0.06, { color: col('#c8a050') });
    for (const [key, geo] of b.build()) {
      const mesh = new THREE.Mesh(geo, materials.get(key as MaterialName));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.pivot.add(mesh);
    }
    this.pivot.position.copy(doorway.hinge);
    this.pivot.rotation.y = doorway.yaw;
    const along = new THREE.Vector3(Math.cos(doorway.yaw), 0, -Math.sin(doorway.yaw));
    this.center = doorway.hinge.clone().addScaledVector(along, w / 2).setY(doorway.hinge.y + 1.2);
    this.addCollider();
  }

  private get group(): string {
    return `door:${this.id}`;
  }

  private addCollider(): void {
    const d = this.doorway;
    const g = this.collision.group;
    this.collision.group = this.group;
    this.collision.addBox({ x: this.center.x, z: this.center.z, yaw: d.yaw, hw: d.width / 2, hd: 0.08, y0: d.hinge.y - 0.2, y1: d.hinge.y + d.height, tag: this.id });
    this.collision.group = g;
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) this.collision.removeGroup(this.group);
    else this.addCollider();
  }

  update(dt: number): void {
    const target = this.open ? 1.75 : 0;
    this.angle += (target - this.angle) * Math.min(1, dt * 5);
    this.pivot.rotation.y = this.doorway.yaw + this.angle;
  }

  dispose(): void {
    this.collision.removeGroup(this.group);
    this.pivot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
