/**
 * Cheap pooled particle systems drawn as pixel-sized points:
 * chimney smoke (rising, drifting, swelling, fading) and ambient motes /
 * drifting leaves around the player. Fixed-size pools: no per-frame allocation.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { atmosphereUniforms, ATMOSPHERE_GLSL } from '../rendering/atmosphere';

const POINT_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uPixelScale;
uniform float uMaxSize;
varying float vAlpha;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uPixelScale / -mv.z, 1.0, uMaxSize);
  vAlpha = aAlpha;
  vColor = aColor;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
}
`;

const POINT_FRAG = /* glsl */ `
${ATMOSPHERE_GLSL}
varying float vAlpha;
varying vec3 vColor;
varying vec3 vWorld;
uniform float uSoft;
float bayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[idx] / 16.0;
}
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = vAlpha * (1.0 - smoothstep(1.0 - uSoft, 1.0, d));
  // Dithered transparency keeps the pixel-art look (no soft blending).
  if (a < bayer(gl_FragCoord.xy) * 0.95 + 0.02) discard;
  vec3 col = vColor;
  float f = haFogAmount(cameraPosition, vWorld);
  col = mix(col, haFogColor(normalize(vWorld - cameraPosition)), f);
  gl_FragColor = vec4(col, 1.0);
}
`;

class PointPool {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  readonly color: Float32Array;
  readonly material: THREE.ShaderMaterial;

  constructor(readonly capacity: number, soft: number, maxSize = 48) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      uniforms: { ...atmosphereUniforms, uPixelScale: { value: 300 }, uSoft: { value: soft }, uMaxSize: { value: maxSize } },
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
  }

  flush(): void {
    const g = this.points.geometry;
    for (const name of ['position', 'aSize', 'aAlpha', 'aColor']) g.getAttribute(name).needsUpdate = true;
  }
}

interface Puff {
  emitter: number;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export class ChimneySmoke {
  readonly pool: PointPool;
  private readonly puffs: Puff[] = [];
  private readonly rng = new Rng(0x5a0c);
  private emitters: THREE.Vector3[] = [];
  private all: THREE.Vector3[] = [];
  private spawnAcc: number[] = [];
  private readonly maxEmitters: number;
  private pick = 0;

  /** Chimneys anywhere in the loaded world; the nearest few actually smoke. */
  constructor(emitters: THREE.Vector3[], maxEmitters = 36) {
    this.maxEmitters = maxEmitters;
    const per = 26;
    this.pool = new PointPool(maxEmitters * per, 0.35);
    this.setEmitters(emitters);
    for (let i = 0; i < this.pool.capacity; i++) this.puffs.push({ emitter: -1, age: 0, life: 1, x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0 });
    this.pool.points.name = 'smoke';
  }

  setPixelScale(s: number): void {
    this.pool.material.uniforms.uPixelScale!.value = s;
  }

  setEmitters(all: THREE.Vector3[]): void {
    this.all = all;
    this.pick = 0;
  }

  private choose(cam: THREE.Vector3 | null): void {
    const list = cam ? this.all.filter((e) => e.distanceToSquared(cam) < 600 * 600).sort((a, b) => a.distanceToSquared(cam) - b.distanceToSquared(cam)) : this.all;
    const next = list.slice(0, this.maxEmitters);
    // Puffs already drifting from a chimney that is no longer chosen simply fade out.
    for (const p of this.puffs) if (p.emitter >= 0 && !next.includes(this.emitters[p.emitter]!)) p.emitter = -2;
    for (const p of this.puffs) if (p.emitter >= 0) p.emitter = next.indexOf(this.emitters[p.emitter]!);
    this.emitters = next;
    this.spawnAcc = next.map(() => 0);
  }

  update(dt: number, wind: THREE.Vector2, cam: THREE.Vector3 | null = null): void {
    this.pick -= dt;
    if (this.pick <= 0) {
      this.pick = 1.5;
      this.choose(cam);
    }
    const rng = this.rng;
    for (let e = 0; e < this.emitters.length; e++) {
      this.spawnAcc[e]! += dt * 3.2;
      while (this.spawnAcc[e]! >= 1) {
        this.spawnAcc[e]! -= 1;
        const free = this.puffs.find((p) => p.emitter === -1);
        if (!free) break;
        const src = this.emitters[e]!;
        Object.assign(free, { emitter: e, age: 0, life: rng.range(6, 9), x: src.x + rng.range(-0.15, 0.15), y: src.y, z: src.z + rng.range(-0.15, 0.15), vx: rng.range(-0.1, 0.1), vy: rng.range(0.9, 1.3), vz: rng.range(-0.1, 0.1) });
      }
    }
    const P = this.pool;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i]!;
      if (p.emitter === -1) {
        P.alpha[i] = 0;
        P.pos[i * 3 + 1] = -9999;
        continue;
      }
      p.age += dt;
      if (p.age > p.life) {
        p.emitter = -1;
        P.alpha[i] = 0;
        continue;
      }
      const t = p.age / p.life;
      p.vx += wind.x * 0.35 * dt;
      p.vz += wind.y * 0.35 * dt;
      p.vy *= 1 - 0.08 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      P.pos[i * 3] = p.x;
      P.pos[i * 3 + 1] = p.y;
      P.pos[i * 3 + 2] = p.z;
      P.size[i] = 0.7 + t * 4.2;
      P.alpha[i] = (1 - t) * Math.min(1, t * 6) * 0.8;
      const c = 0.78 + t * 0.12;
      P.color[i * 3] = c * 0.95;
      P.color[i * 3 + 1] = c * 0.93;
      P.color[i * 3 + 2] = c;
    }
    P.flush();
  }
}

/** Motes in sunlight and drifting leaves around the player. */
export class AmbientMotes {
  readonly pool: PointPool;
  private readonly rng = new Rng(0x3073);
  private readonly vel: Float32Array;
  private readonly kind: Uint8Array;

  constructor(count = 220) {
    this.pool = new PointPool(count, 0.05, 2.5);
    this.vel = new Float32Array(count * 3);
    this.kind = new Uint8Array(count);
    for (let i = 0; i < count; i++) this.pool.pos[i * 3 + 1] = -9999;
    this.pool.points.name = 'motes';
  }

  setPixelScale(s: number): void {
    this.pool.material.uniforms.uPixelScale!.value = s;
  }

  update(dt: number, cam: THREE.Vector3, ground: (x: number, z: number) => number, forestAt: (x: number, z: number) => number, wind: THREE.Vector2): void {
    const P = this.pool;
    const rng = this.rng;
    const R = 22;
    for (let i = 0; i < P.capacity; i++) {
      let x = P.pos[i * 3]!;
      let y = P.pos[i * 3 + 1]!;
      let z = P.pos[i * 3 + 2]!;
      const far = Math.abs(x - cam.x) > R || Math.abs(z - cam.z) > R || y < -9000;
      if (far || y < ground(x, z) - 0.1 || y > cam.y + 14) {
        // Respawn near the player.
        x = cam.x + rng.range(-R, R);
        z = cam.z + rng.range(-R, R);
        const g = ground(x, z);
        const leaf = forestAt(x, z) > 0.35 && rng.chance(0.55);
        this.kind[i] = leaf ? 1 : 0;
        y = leaf ? g + rng.range(4, 12) : g + rng.range(0.3, 4.5);
        this.vel[i * 3] = rng.range(-0.2, 0.2);
        this.vel[i * 3 + 1] = leaf ? -rng.range(0.5, 0.9) : rng.range(-0.05, 0.08);
        this.vel[i * 3 + 2] = rng.range(-0.2, 0.2);
        const c = leaf ? rng.pick([[0.55, 0.62, 0.18], [0.78, 0.55, 0.16], [0.42, 0.55, 0.2]]) : [1.0, 0.94, 0.7];
        P.color.set(c, i * 3);
        P.size[i] = leaf ? 0.09 : 0.045;
      }
      const t = performance.now() * 0.001 + i;
      const flutter = this.kind[i] === 1 ? Math.sin(t * 3.1) * 0.6 : Math.sin(t * 0.7) * 0.15;
      x += (this.vel[i * 3]! + wind.x * 0.4 + flutter) * dt;
      y += this.vel[i * 3 + 1]! * dt;
      z += (this.vel[i * 3 + 2]! + wind.y * 0.4 + Math.cos(t * 2.3) * 0.2) * dt;
      P.pos[i * 3] = x;
      P.pos[i * 3 + 1] = y;
      P.pos[i * 3 + 2] = z;
      P.alpha[i] = this.kind[i] === 1 ? 1 : 0.55 + 0.45 * Math.sin(t * 1.7);
    }
    P.flush();
  }
}
