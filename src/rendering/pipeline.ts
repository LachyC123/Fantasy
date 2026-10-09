/**
 * Painterly pixel pipeline:
 *   1. world + first-person view model → low-res HDR target (nearest upscale)
 *   2. sun-shaft pass: radial blur of visible sky towards the sun
 *   3. final pass: tone map, warm/cool split grade, silhouette ink lines,
 *      ordered-dither posterisation in low-res pixel space, upscale to screen.
 */
import * as THREE from 'three';

export interface PipelineSettings {
  internalHeight: number;
  ditherLevels: number;
  outlines: boolean;
}

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const RAYS_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSunScreen;
uniform float uSunVisible;
varying vec2 vUv;
void main() {
  if (uSunVisible <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 delta = (uSunScreen - vUv) / 40.0;
  vec2 uv = vUv;
  float illum = 0.0;
  float decay = 1.0;
  for (int i = 0; i < 40; i++) {
    uv += delta;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float d = texture2D(tDepth, uv).r;
    float sky = step(0.99999, d);
    vec3 c = texture2D(tColor, uv).rgb;
    float lum = dot(c, vec3(0.3, 0.55, 0.15));
    illum += sky * smoothstep(0.35, 1.4, lum) * decay;
    decay *= 0.965;
  }
  float falloff = 1.0 - smoothstep(0.0, 0.85, distance(vUv, uSunScreen));
  gl_FragColor = vec4(vec3(illum / 40.0 * falloff * uSunVisible), 1.0);
}
`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tRays;
uniform vec2 uLowSize;
uniform vec3 uSunColor;
uniform float uLevels;
uniform float uOutlines;
uniform float uNear;
uniform float uFar;
uniform float uFade;
varying vec2 vUv;

float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[idx] / 16.0;
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  // Snap to the centre of the low-res texel so the image stays crisp.
  vec2 pix = floor(vUv * uLowSize);
  vec2 uv = (pix + 0.5) / uLowSize;
  vec3 c = texture2D(tColor, uv).rgb;

  // Sun shafts (computed at half res, slightly blurred by bilinear).
  float rays = texture2D(tRays, uv).r;
  c += uSunColor * rays * 0.55;

  // Silhouette ink: darken pixels whose neighbours are much farther away.
  if (uOutlines > 0.5) {
    float d0 = linDepth(texture2D(tDepth, uv).r);
    vec2 px = 1.0 / uLowSize;
    float dmax = max(max(linDepth(texture2D(tDepth, uv + vec2(px.x, 0.0)).r), linDepth(texture2D(tDepth, uv - vec2(px.x, 0.0)).r)),
                     max(linDepth(texture2D(tDepth, uv + vec2(0.0, px.y)).r), linDepth(texture2D(tDepth, uv - vec2(0.0, px.y)).r)));
    float edge = step(d0 * 1.12 + 0.6, dmax) * (1.0 - smoothstep(60.0, 260.0, d0));
    c = mix(c, c * vec3(0.42, 0.38, 0.55), edge * 0.6);
  }

  // Filmic tone map then grade in display space.
  c = aces(c * 1.05);
  c = toSRGB(c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.16);                                   // richer colour
  vec3 shadowTint = vec3(0.30, 0.27, 0.52);
  vec3 highTint = vec3(1.0, 0.9, 0.72);
  c = mix(c, c * 0.6 + shadowTint * 0.4, (1.0 - smoothstep(0.0, 0.45, l)) * 0.38); // violet shadows
  c = mix(c, c * highTint * 1.08, smoothstep(0.55, 1.0, l) * 0.35);              // warm highlights
  c = clamp((c - 0.5) * 1.06 + 0.5, 0.0, 1.0);

  // Ordered-dither posterisation in low-res pixel space.
  float b = bayer4(pix) - 0.5;
  c = floor(c * uLevels + 0.5 + b) / uLevels;

  // Vignette and fade.
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.35;
  c *= uFade;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class PixelPipeline {
  readonly settings: PipelineSettings;
  private rtScene!: THREE.WebGLRenderTarget;
  private rtRays!: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly raysMat: THREE.ShaderMaterial;
  private readonly finalMat: THREE.ShaderMaterial;
  private lowW = 0;
  private lowH = 0;
  fade = 1;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    settings: PipelineSettings,
  ) {
    this.settings = { ...settings };
    this.raysMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: RAYS_FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uSunScreen: { value: new THREE.Vector2() },
        uSunVisible: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.finalMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FINAL_FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tRays: { value: null },
        uLowSize: { value: new THREE.Vector2() },
        uSunColor: { value: new THREE.Color() },
        uLevels: { value: settings.ditherLevels },
        uOutlines: { value: settings.outlines ? 1 : 0 },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uFade: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.finalMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.resize();
  }

  /**
   * Half-float scene targets keep the tone map smooth; GPUs that cannot render to them
   * (some older phones) fall back to 8-bit, which the dither and posterise hide well.
   */
  private targetType(): THREE.TextureDataType {
    const ext = this.renderer.extensions;
    return ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
  }

  get lowSize(): { w: number; h: number } {
    return { w: this.lowW, h: this.lowH };
  }

  setInternalHeight(h: number): void {
    this.settings.internalHeight = h;
    this.resize();
  }

  setOutlines(on: boolean): void {
    this.settings.outlines = on;
    this.finalMat.uniforms.uOutlines!.value = on ? 1 : 0;
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h, false);
    const lowH = this.settings.internalHeight;
    const lowW = Math.max(16, Math.round((lowH * w) / h));
    if (lowW === this.lowW && lowH === this.lowH && this.rtScene) return;
    this.lowW = lowW;
    this.lowH = lowH;
    this.rtScene?.dispose();
    this.rtRays?.dispose();
    const depthTexture = new THREE.DepthTexture(lowW, lowH);
    depthTexture.type = THREE.UnsignedIntType;
    this.rtScene = new THREE.WebGLRenderTarget(lowW, lowH, {
      type: this.targetType(),
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture,
      depthBuffer: true,
    });
    this.rtRays = new THREE.WebGLRenderTarget(Math.ceil(lowW / 2), Math.ceil(lowH / 2), {
      type: this.targetType(),
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    (this.finalMat.uniforms.uLowSize!.value as THREE.Vector2).set(lowW, lowH);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, view: { scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null, sunDir: THREE.Vector3, sunColor: THREE.Color): void {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear(true, true, true);
    r.render(scene, camera);
    if (view) {
      r.clearDepth();
      r.render(view.scene, view.camera);
    }

    // Sun position on screen (only meaningful when in front of the camera).
    const sunWorld = camera.position.clone().addScaledVector(sunDir, 1000);
    const ndc = sunWorld.project(camera);
    const camFwd = new THREE.Vector3();
    camera.getWorldDirection(camFwd);
    const facing = camFwd.dot(sunDir);
    const visible = facing > 0 ? THREE.MathUtils.smoothstep(facing, 0.0, 0.5) : 0;
    this.raysMat.uniforms.tColor!.value = this.rtScene.texture;
    this.raysMat.uniforms.tDepth!.value = this.rtScene.depthTexture;
    (this.raysMat.uniforms.uSunScreen!.value as THREE.Vector2).set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
    this.raysMat.uniforms.uSunVisible!.value = visible;
    this.quad.material = this.raysMat;
    r.setRenderTarget(this.rtRays);
    r.render(this.quadScene, this.quadCam);

    const u = this.finalMat.uniforms;
    u.tColor!.value = this.rtScene.texture;
    u.tDepth!.value = this.rtScene.depthTexture;
    u.tRays!.value = this.rtRays.texture;
    (u.uSunColor!.value as THREE.Color).copy(sunColor);
    u.uNear!.value = camera.near;
    u.uFar!.value = camera.far;
    u.uLevels!.value = this.settings.ditherLevels;
    u.uFade!.value = this.fade;
    this.quad.material = this.finalMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  dispose(): void {
    this.rtScene.dispose();
    this.rtRays.dispose();
    this.raysMat.dispose();
    this.finalMat.dispose();
  }
}
