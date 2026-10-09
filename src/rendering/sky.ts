/**
 * Painterly sky dome: layered gradient, sun glow and illustrated cumulus
 * masses with banded, dithered shading (apricot lit edges, violet shadows),
 * matching the cloud treatment in the reference images.
 */
import * as THREE from 'three';
import { atmosphereUniforms, ATMOSPHERE_GLSL } from './atmosphere';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // render at the far plane
}
`;

const frag = /* glsl */ `
${ATMOSPHERE_GLSL}
uniform vec3 uZenith;
uniform vec3 uUpper;
uniform vec3 uCloudLit;
uniform vec3 uCloudMid;
uniform vec3 uCloudShadow;
uniform float uCloudCover;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}
float cloudDensity(vec2 p) {
  vec2 q = p + vec2(fbm(p * 0.7 + uTime * 0.004), fbm(p * 0.7 - 3.1)) * 1.6;
  float base = fbm(q * 0.55);
  // Billowing cumulus: sharpen towards round heaped tops.
  float d = smoothstep(1.0 - uCloudCover - 0.05, 1.0 - uCloudCover + 0.22, base);
  d *= 0.75 + 0.5 * fbm(q * 2.3 + 4.0);
  return clamp(d, 0.0, 1.0);
}

float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[idx] / 16.0;
}

void main() {
  vec3 dir = normalize(vDir);
  float y = dir.y;
  float sunAmt = max(dot(dir, uSunDir), 0.0);

  // Gradient: zenith → upper violet → warm horizon band.
  vec3 col = mix(uUpper, uZenith, smoothstep(0.12, 0.75, y));
  col = mix(uHorizon, col, smoothstep(-0.02, 0.28, y));
  col = mix(col, uSunGlow, 0.5 * pow(sunAmt, 6.0) * smoothstep(-0.1, 0.4, 1.0 - y));
  // Below the horizon the haze takes over (normally hidden by terrain).
  col = mix(col, haFogColor(dir), smoothstep(0.02, -0.08, y));

  // Clouds on a curved plane above the world.
  if (y > -0.02) {
    float yy = max(y, 0.0) + 0.06;
    vec2 p = dir.xz / yy * 1.35 + vec2(uTime * 0.0035, uTime * 0.0012);
    float d = cloudDensity(p);
    if (d > 0.001) {
      // Self-shadowing towards the sun gives lit rims and violet bellies.
      vec2 sunStep = normalize(uSunDir.xz + 1e-4) * 0.18;
      float occ = cloudDensity(p + sunStep) * 0.6 + cloudDensity(p + sunStep * 2.2) * 0.4;
      float light = clamp(1.0 - occ * 1.15 + 0.25 * (1.0 - d), 0.0, 1.0);
      light = clamp(light + 0.45 * pow(sunAmt, 4.0), 0.0, 1.0);
      // Banded, dithered shading for the painted pixel look.
      float dither = bayer4(gl_FragCoord.xy) - 0.5;
      float bands = 4.0;
      float lb = floor(light * bands + dither * 0.9) / bands;
      vec3 cc = mix(uCloudShadow, uCloudMid, smoothstep(0.0, 0.55, lb));
      cc = mix(cc, uCloudLit, smoothstep(0.5, 1.0, lb));
      // Distant clouds melt into the haze near the horizon.
      float horizonFade = smoothstep(0.0, 0.22, y);
      cc = mix(haFogColor(dir), cc, 0.35 + 0.65 * horizonFade);
      float alpha = smoothstep(0.08, 0.35, d + dither * 0.12);
      alpha *= smoothstep(-0.02, 0.06, y);
      col = mix(col, cc, alpha);
    }
  }

  // Sun disc.
  float disc = smoothstep(0.9993, 0.9997, sunAmt);
  col = mix(col, vec3(1.0, 0.97, 0.88), disc);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: atmosphereUniforms,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.scale.setScalar(1000);
  mesh.name = 'sky';
  return mesh;
}
