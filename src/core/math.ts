/** Small allocation-free math helpers shared by generation and runtime code. */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const saturate = (v: number): number => clamp(v, 0, 1);

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach factor. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Squared distance from point p to segment ab in XZ, plus the param t along it. */
export function distSqToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d2: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = saturate(t);
  const cx = ax + dx * t - px;
  const cz = az + dz * t - pz;
  return { d2: cx * cx + cz * cz, t };
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Catmull-Rom interpolation in XZ for a closed-open polyline. */
export function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number): number =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) };
}
