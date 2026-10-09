/**
 * First-person character controller: capsule of radius 0.35 m and height
 * 1.75 m with grounded detection, acceleration, sprint, jump, gravity,
 * step-up onto low obstacles, snap-down on descents and a slope limit.
 * Pure logic over a CollisionWorld, so it is unit-testable.
 */
import type { CollisionWorld } from './collision';
import { damp } from '../core/math';

export interface MoveInput {
  forward: number; // -1..1
  right: number; // -1..1
  sprint: boolean;
  jump: boolean;
}

export const PLAYER = {
  radius: 0.35,
  height: 1.75,
  eye: 1.62,
  step: 0.48,
  walk: 4.2,
  sprint: 7.4,
  jumpSpeed: 6.2,
  gravity: 21,
  /** Max walkable slope (rise/run) ≈ 42°. */
  maxSlope: 0.9,
};

export class CharacterController {
  x: number;
  y: number;
  z: number;
  vx = 0;
  vy = 0;
  vz = 0;
  onGround = false;
  /** Distance travelled on the ground (drives head bob / footsteps). */
  stride = 0;
  /** Vertical landing impulse for camera dip (m/s at impact). */
  landingImpulse = 0;
  /** Amount the ground stepped up this frame (smoothed by the camera). */
  stepOffset = 0;

  constructor(
    readonly world: CollisionWorld,
    x: number,
    z: number,
  ) {
    this.x = x;
    this.z = z;
    this.y = world.groundAt(x, z, Infinity, PLAYER.radius);
    this.onGround = true;
  }

  teleport(x: number, z: number, y?: number): void {
    this.x = x;
    this.z = z;
    this.y = y ?? this.world.groundAt(x, z, Infinity, PLAYER.radius);
    this.vx = this.vy = this.vz = 0;
    this.onGround = true;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  update(dt: number, input: MoveInput, yaw: number): void {
    dt = Math.min(dt, 0.1);
    // Desired velocity from input relative to view yaw (yaw 0 looks down -Z).
    let ix = input.right;
    let iz = -input.forward;
    const il = Math.hypot(ix, iz);
    if (il > 1) {
      ix /= il;
      iz /= il;
    }
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const speed = input.sprint && input.forward > 0.1 ? PLAYER.sprint : PLAYER.walk;
    const wx = (c * ix + s * iz) * speed;
    const wz = (-s * ix + c * iz) * speed;
    const accel = this.onGround ? (il > 0.01 ? 11 : 14) : 2.2;
    const k = damp(accel, dt);
    this.vx += (wx - this.vx) * k;
    this.vz += (wz - this.vz) * k;

    if (input.jump && this.onGround) {
      this.vy = PLAYER.jumpSpeed;
      this.onGround = false;
    }

    // Horizontal motion in small substeps with collision resolution.
    const dist = Math.hypot(this.vx, this.vz) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    const sx = (this.vx * dt) / steps;
    const sz = (this.vz * dt) / steps;
    const startY = this.y;
    let stepped = 0;
    for (let i = 0; i < steps; i++) {
      let nx = this.x + sx;
      let nz = this.z + sz;
      // Slope limit: refuse to climb terrain steeper than maxSlope.
      if (this.onGround) {
        const gNow = this.world.groundAt(this.x, this.z, this.y + PLAYER.step, PLAYER.radius);
        const gNext = this.world.groundAt(nx, nz, this.y + PLAYER.step, PLAYER.radius);
        const run = Math.hypot(sx, sz);
        if (run > 1e-5 && gNext - gNow > PLAYER.maxSlope * run + 0.02 && gNext - this.y > PLAYER.step * 0.25) {
          // Too steep: slide along the contour instead of climbing.
          const tHere = this.world.heightAt(this.x, this.z);
          const gx = this.world.heightAt(this.x + 0.3, this.z) - tHere;
          const gz = this.world.heightAt(this.x, this.z + 0.3) - tHere;
          const gl = Math.hypot(gx, gz) || 1;
          const dot = (sx * gx + sz * gz) / gl;
          nx = this.x + sx - (gx / gl) * Math.max(0, dot);
          nz = this.z + sz - (gz / gl) * Math.max(0, dot);
        }
      }
      const r = this.world.resolve(nx, nz, PLAYER.radius, this.y, this.y + PLAYER.height, PLAYER.step);
      this.x = r.x;
      this.z = r.z;
      if (r.hit) {
        // Remove the velocity component into the obstacle so we slide along it.
        const px = r.x - nx;
        const pz = r.z - nz;
        const pl = Math.hypot(px, pz);
        if (pl > 1e-6) {
          const vn = (this.vx * px + this.vz * pz) / pl;
          if (vn < 0) {
            this.vx -= (px / pl) * vn;
            this.vz -= (pz / pl) * vn;
          }
        }
      }
      if (this.onGround) {
        const g = this.world.groundAt(this.x, this.z, this.y + PLAYER.step, PLAYER.radius);
        if (g > this.y) {
          stepped += g - this.y;
          this.y = g; // step up
        }
      }
    }

    // Vertical.
    this.vy -= PLAYER.gravity * dt;
    this.y += this.vy * dt;
    const ground = this.world.groundAt(this.x, this.z, Math.max(this.y, startY) + PLAYER.step, PLAYER.radius);
    if (this.y <= ground) {
      if (!this.onGround && this.vy < -2) this.landingImpulse = -this.vy;
      this.y = ground;
      this.vy = 0;
      this.onGround = true;
    } else if (this.onGround && this.vy <= 0 && this.y - ground < 0.45 + Math.hypot(this.vx, this.vz) * dt * PLAYER.maxSlope) {
      // Snap down when walking downhill so we don't skip off slopes.
      this.y = ground;
      this.vy = 0;
    } else {
      this.onGround = false;
    }
    this.stepOffset = stepped;
    if (this.onGround) this.stride += Math.hypot(this.vx, this.vz) * dt;
  }
}
