/**
 * Shared atmosphere: lighting presets, global shader uniforms and a material
 * patch that replaces Three's flat fog with painterly aerial perspective
 * (violet-blue distance haze, warm sun-side scattering, valley height mist)
 * and adds wind sway to foliage. Every world material goes through
 * `patchMaterial` so the whole scene shares one lighting language.
 */
import * as THREE from 'three';

export type TimeOfDay = 'morning' | 'afternoon' | 'golden' | 'dusk';
export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  golden: 'Golden hour',
  dusk: 'Dusk',
};

export interface LightingPreset {
  sunAzimuth: number; // radians, 0 = north (-Z), positive towards west (-X)
  sunElevation: number; // radians
  sunColor: string;
  sunIntensity: number;
  skyLight: string;
  groundLight: string;
  hemiIntensity: number;
  zenith: string;
  upper: string;
  horizon: string;
  haze: string;
  sunGlow: string;
  cloudLit: string;
  cloudMid: string;
  cloudShadow: string;
  cloudCover: number;
  hazeDensity: number;
  exposure: number;
}

export const PRESETS: Record<TimeOfDay, LightingPreset> = {
  morning: {
    sunAzimuth: -2.2,
    sunElevation: 0.32,
    sunColor: '#ffe2b8',
    sunIntensity: 2.6,
    skyLight: '#a9b8e8',
    groundLight: '#5d6a3a',
    hemiIntensity: 1.25,
    zenith: '#4f6db8',
    upper: '#8fa6dc',
    horizon: '#e9d2bf',
    haze: '#b8c3dc',
    sunGlow: '#ffe1b0',
    cloudLit: '#fff2dc',
    cloudMid: '#d6c8d8',
    cloudShadow: '#8f8fb8',
    cloudCover: 0.42,
    hazeDensity: 0.00034,
    exposure: 1.0,
  },
  afternoon: {
    sunAzimuth: 0.95,
    sunElevation: 0.62,
    sunColor: '#fff0d2',
    sunIntensity: 2.9,
    skyLight: '#9fb4ea',
    groundLight: '#556a30',
    hemiIntensity: 1.3,
    zenith: '#3f63b5',
    upper: '#7f9ee0',
    horizon: '#dfe0e6',
    haze: '#aebfe0',
    sunGlow: '#fff2cf',
    cloudLit: '#fffaf0',
    cloudMid: '#d7d9ea',
    cloudShadow: '#8d97c2',
    cloudCover: 0.45,
    hazeDensity: 0.0003,
    exposure: 1.0,
  },
  golden: {
    sunAzimuth: 0.85,
    sunElevation: 0.3,
    sunColor: '#ffd29a',
    sunIntensity: 3.0,
    skyLight: '#9a9fe0',
    groundLight: '#4e5a2c',
    hemiIntensity: 1.2,
    zenith: '#3d4596',
    upper: '#7f78c4',
    horizon: '#f4c39a',
    haze: '#b9a9d2',
    sunGlow: '#ffcf8a',
    cloudLit: '#ffd9a0',
    cloudMid: '#e2a3a6',
    cloudShadow: '#7a6aa8',
    cloudCover: 0.5,
    hazeDensity: 0.0003,
    exposure: 1.0,
  },
  dusk: {
    sunAzimuth: 0.7,
    sunElevation: 0.09,
    sunColor: '#ffa070',
    sunIntensity: 2.1,
    skyLight: '#7a73c6',
    groundLight: '#3a3a3a',
    hemiIntensity: 1.1,
    zenith: '#2a2c6e',
    upper: '#6a58a8',
    horizon: '#f0a07a',
    haze: '#8f7bb8',
    sunGlow: '#ff9a62',
    cloudLit: '#ffb07c',
    cloudMid: '#c97a9a',
    cloudShadow: '#5a4a8e',
    cloudCover: 0.55,
    hazeDensity: 0.00042,
    exposure: 0.95,
  },
};

/** Uniforms shared by every patched material and the sky. */
export const atmosphereUniforms = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uHaze: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunGlow: { value: new THREE.Color() },
  uZenith: { value: new THREE.Color() },
  uUpper: { value: new THREE.Color() },
  uCloudLit: { value: new THREE.Color() },
  uCloudMid: { value: new THREE.Color() },
  uCloudShadow: { value: new THREE.Color() },
  uCloudCover: { value: 0.5 },
  uHazeDensity: { value: 0.0003 },
  uMistHeight: { value: 8.0 },
  uMistDensity: { value: 0.0016 },
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(1, 0.3) },
};

export function sunDirection(p: LightingPreset): THREE.Vector3 {
  const ce = Math.cos(p.sunElevation);
  return new THREE.Vector3(-Math.sin(p.sunAzimuth) * ce, Math.sin(p.sunElevation), -Math.cos(p.sunAzimuth) * ce).normalize();
}

export function applyPresetUniforms(p: LightingPreset): void {
  const u = atmosphereUniforms;
  u.uSunDir.value.copy(sunDirection(p));
  u.uSunColor.value.set(p.sunColor);
  u.uHaze.value.set(p.haze);
  u.uHorizon.value.set(p.horizon);
  u.uSunGlow.value.set(p.sunGlow);
  u.uZenith.value.set(p.zenith);
  u.uUpper.value.set(p.upper);
  u.uCloudLit.value.set(p.cloudLit);
  u.uCloudMid.value.set(p.cloudMid);
  u.uCloudShadow.value.set(p.cloudShadow);
  u.uCloudCover.value = p.cloudCover;
  u.uHazeDensity.value = p.hazeDensity;
}

/** GLSL shared by materials and the sky: aerial perspective colour + amount. */
export const ATMOSPHERE_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHaze;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform float uHazeDensity;
uniform float uMistHeight;
uniform float uMistDensity;

vec3 haFogColor(vec3 dir) {
  float sunAmt = max(dot(dir, uSunDir), 0.0);
  vec3 c = mix(uHaze, uHorizon, 0.35 + 0.35 * pow(sunAmt, 2.0));
  c = mix(c, uSunGlow, 0.55 * pow(sunAmt, 8.0));
  return c;
}

float haFogAmount(vec3 camPos, vec3 worldPos) {
  vec3 v = worldPos - camPos;
  float dist = length(v);
  // Aerial perspective: distant land turns towards the haze colour but the far
  // castle and mountains stay legible as layered silhouettes.
  float haze = (1.0 - exp(-dist * uHazeDensity * 1.15)) * 0.92;
  // Analytic exponential height mist pooled in the valley floor.
  float b = 1.0 / uMistHeight;
  float rd = v.y / max(dist, 1e-3);
  float camTerm = exp(-max(camPos.y, -50.0) * b);
  // Integral of exp(-y·b) along the ray, written in a form that stays stable
  // for horizontal rays (x → 0), so no seam appears at the horizon.
  float x = dist * rd * b;
  float f = abs(x) < 1e-3 ? 1.0 - 0.5 * x : (1.0 - exp(-x)) / x;
  float mist = uMistDensity * camTerm * dist * f;
  mist = clamp(mist, 0.0, 0.32);
  return clamp(haze + mist * (1.0 - haze), 0.0, 1.0);
}
`;

export type WindMode = 'none' | 'foliage' | 'grass' | 'trunk';

export interface PatchOptions {
  wind?: WindMode;
  /** Brighten / tint where the surface faces away from light (subsurface leaves). */
  translucency?: number;
  /** Keep fog off (e.g. view-model). */
  noFog?: boolean;
}

const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
vec3 haWind(vec3 pos, vec3 worldBase, float mode) {
  float phase = dot(worldBase.xz, vec2(0.13, 0.09));
  float gust = 0.6 + 0.4 * sin(uTime * 0.6 + worldBase.x * 0.02 + worldBase.z * 0.015);
  if (mode < 1.5) {
    // Foliage: sway grows with height above the instance origin.
    float h = max(pos.y, 0.0);
    float s = sin(uTime * 1.3 + phase) * 0.5 + sin(uTime * 2.7 + phase * 1.7 + pos.x) * 0.18;
    vec2 off = uWind * s * gust * 0.022 * h;
    float flutter = sin(uTime * 6.0 + pos.x * 3.1 + pos.z * 2.3 + phase) * 0.035 * clamp(h * 0.12, 0.0, 1.0);
    return pos + vec3(off.x + flutter, 0.0, off.y + flutter * 0.7);
  } else if (mode < 2.5) {
    // Grass: tip bends strongly.
    float h = clamp(pos.y, 0.0, 2.0);
    float s = sin(uTime * 2.0 + phase * 3.0) * 0.6 + sin(uTime * 3.7 + phase * 5.1) * 0.25;
    vec2 off = uWind * (s * gust + 0.35) * 0.22 * h * h;
    return pos + vec3(off.x, -0.05 * h * h * gust, off.y);
  }
  // Trunk: barely moves.
  float s = sin(uTime * 1.3 + phase) * 0.5;
  vec2 off = uWind * s * gust * 0.004 * max(pos.y, 0.0);
  return pos + vec3(off.x, 0.0, off.y);
}
`;

/**
 * Patch a built-in material (Lambert/Basic/Standard) in place.
 * Adds world position varyings, aerial-perspective fog and optional wind.
 */
export function patchMaterial<T extends THREE.Material>(material: T, opts: PatchOptions = {}): T {
  const wind = opts.wind ?? 'none';
  const windMode = wind === 'foliage' ? 1 : wind === 'grass' ? 2 : wind === 'trunk' ? 3 : 0;
  const translucency = opts.translucency ?? 0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, atmosphereUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vHaWorld;
${windMode ? WIND_GLSL : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        windMode
          ? `#include <begin_vertex>
{
  vec3 haBase = vec3(0.0);
  #ifdef USE_INSTANCING
    haBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
    haBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  transformed = haWind(transformed, haBase, ${windMode.toFixed(1)});
}`
          : '#include <begin_vertex>',
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
{
  vec4 haW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    haW = instanceMatrix * haW;
  #endif
  vHaWorld = (modelMatrix * haW).xyz;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vHaWorld;
${ATMOSPHERE_GLSL}`,
      )
      .replace(
        '#include <fog_fragment>',
        opts.noFog
          ? ''
          : `{
  vec3 haDir = normalize(vHaWorld - cameraPosition);
  float haF = haFogAmount(cameraPosition, vHaWorld);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, haFogColor(haDir), haF);
}`,
      );
    if (translucency > 0) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `{
  vec3 haV = normalize(vHaWorld - cameraPosition);
  float back = pow(max(dot(haV, uSunDir), 0.0), 3.0);
  outgoingLight += diffuseColor.rgb * uSunColor * back * ${translucency.toFixed(3)};
}
#include <opaque_fragment>`,
      );
    }
  };
  // Distinct program cache keys per patch variant.
  material.customProgramCacheKey = () => `ha-${windMode}-${translucency}-${opts.noFog ? 1 : 0}`;
  return material;
}

/** Depth material for shadow casting that follows the same wind displacement. */
export function windDepthMaterial(mode: WindMode, alphaMap?: THREE.Texture): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: alphaMap ?? null, alphaTest: alphaMap ? 0.5 : 0 });
  const windMode = mode === 'foliage' ? 1 : mode === 'grass' ? 2 : mode === 'trunk' ? 3 : 0;
  if (!windMode) return m;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, atmosphereUniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${WIND_GLSL}`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
  vec3 haBase = vec3(0.0);
  #ifdef USE_INSTANCING
    haBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  transformed = haWind(transformed, haBase, ${windMode.toFixed(1)});
}`,
    );
  };
  m.customProgramCacheKey = () => `ha-depth-${windMode}`;
  return m;
}
