/**
 * Game orchestrator: renderer + pixel pipeline, lighting, the current world,
 * the player, view model, audio, input and the front-end state machine
 * (title → loading → intro → capture → playing ⇄ paused).
 */
import * as THREE from 'three';
import { PixelPipeline } from '../rendering/pipeline';
import { createSky } from '../rendering/sky';
import { MaterialLibrary } from '../rendering/materials';
import { PRESETS, applyPresetUniforms, atmosphereUniforms, sunDirection, type LightingPreset } from '../rendering/atmosphere';
import { WorldRuntime } from './worldRuntime';
import { CharacterController, PLAYER } from '../player/controller';
import { ViewModel } from '../player/viewModel';
import { AudioManager, type Surface } from '../audio/audio';
import { Input } from './input';
import { UI } from '../ui/ui';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Guidance } from './guidance';
import { canonicalizeSeed } from '../core/rng';
import { REFERENCE_SEED } from '../world/plan';
import { damp, clamp } from '../core/math';
import { starterWeapon } from '../gameplay/loot';
import { RARITY_COLOURS } from '../gameplay/luck';
import type { WeaponGenome } from '../gameplay/weapons';
import { Gallery } from './gallery';

type State = 'boot' | 'title' | 'loading' | 'intro' | 'capture' | 'playing' | 'paused' | 'gallery';

export interface GameOptions {
  autotest: boolean;
  seed: string | null;
  debug: boolean;
  /** Developer gallery of generated creatures and weapons. */
  gallery: boolean;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly pipeline: PixelPipeline;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly materials = new MaterialLibrary();
  readonly input: Input;
  readonly ui = new UI();
  readonly audio = new AudioManager();
  readonly viewModel: ViewModel;
  settings: Settings;
  state: State = 'boot';
  world: WorldRuntime | null = null;
  player: CharacterController | null = null;
  private guidance: Guidance | null = null;
  private gallery: Gallery | null = null;
  /** The weapon in hand (procedurally generated). */
  weapon: WeaponGenome | null = null;
  private readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sky = createSky();
  private preset: LightingPreset;
  private yaw = 0;
  private pitch = 0;
  private eyeOffset = 0;
  private landingDip = 0;
  private lastStride = 0;
  private time = 0;
  private stateTime = 0;
  private fpsAvg = 60;
  private frameMs = 16;
  private debugOn = false;
  private debugTimer = 0;
  private building: Promise<void> | null = null;
  private lookDX = 0;
  private lookDY = 0;
  private titleYaw = 0;
  private readonly wind = new THREE.Vector2(1, 0.3);
  readonly errors: string[] = [];
  /** Rolling CPU timings (ms) of the world streaming update, for perf tests and the overlay. */
  readonly perf = { worldMs: [] as number[] };
  private autopilot: { road: number; index: number; speed: number; perFrame: boolean } | null = null;

  /** Test/benchmark helper: travel along a planned road at a fixed speed, streaming as a player would. */
  private stepAutopilot(dt: number): void {
    const a = this.autopilot!;
    const road = this.world?.plan.roads[a.road];
    if (!road || !this.player) return;
    // perFrame: advance a fixed distance each frame (stress mode independent of frame rate).
    a.index = Math.min(road.points.length - 1, a.index + (a.perFrame ? a.speed : a.speed * dt) / 2);
    const i = Math.floor(a.index);
    const p = road.points[i]!;
    const q = road.points[Math.min(i + 6, road.points.length - 1)]!;
    this.player.teleport(p.x, p.z);
    this.yaw = Math.atan2(-(q.x - p.x), -(q.z - p.z));
    this.pitch = 0;
    if (i >= road.points.length - 1) this.autopilot = null;
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly opts: GameOptions,
  ) {
    this.settings = loadSettings();
    this.preset = PRESETS[this.settings.timeOfDay];
    // Automated tests read pixels back from the canvas, which needs a preserved buffer.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: opts.autotest });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.pipeline = new PixelPipeline(this.renderer, { internalHeight: this.settings.internalHeight, ditherLevels: 30, outlines: this.settings.outlines });
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 16 / 9, 0.3, 9000);
    this.camera.rotation.order = 'YXZ';
    this.input = new Input(canvas);
    this.input.allowUnlocked = opts.autotest;
    this.viewModel = new ViewModel(ViewModel.createMaterials());
    this.viewModel.onSwing = () => this.audio.whoosh();

    this.scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 10;
    sc.far = 500;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.35;
    this.applyLighting();

    this.ui.onAction = (a) => this.onAction(a);
    this.ui.onSettings = (s) => this.applySettings(s);
    this.ui.bindSettings(this.settings);
    this.input.onPointerLockChange = (locked) => this.onLockChange(locked);
    this.input.onKey = (code) => this.onKey(code);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => {
      if (this.state === 'playing' && !this.opts.autotest) this.pause();
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.audio.suspend() : this.audio.resume()));
    this.resize();
  }

  // ---------------------------------------------------------------- setup

  start(): void {
    this.ui.show('title');
    this.ui.seedInput.value = this.opts.seed ?? REFERENCE_SEED;
    this.state = 'title';
    this.ui.setTitleStatus('Preparing the vale…', false);
    // Build the reference world behind the title as a living backdrop.
    this.building = this.loadWorld(this.opts.seed ?? REFERENCE_SEED, (stage, f) => {
      if (this.state === 'title') this.ui.setTitleStatus(`${stage}… ${Math.round(f * 100)}%`, false);
      if (this.state === 'loading') this.ui.setProgress(f, stage);
    }).then(() => {
      if (this.state === 'title') this.ui.setTitleStatus('', true);
      if (this.opts.gallery && this.world) {
        this.state = 'gallery';
        this.ui.show(null);
        this.gallery = new Gallery(this.world, this.materials);
        this.scene.add(this.gallery.group);
      }
    });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private quality(): { treeFar: number } {
    return { treeFar: this.settings.internalHeight === 180 ? 1000 : this.settings.internalHeight === 270 ? 1300 : 1500 };
  }

  private async loadWorld(seed: string, progress: (stage: string, f: number) => void): Promise<void> {
    const canonical = canonicalizeSeed(seed);
    if (this.world?.seed === canonical) return;
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }
    const w = new WorldRuntime(canonical, this.materials);
    await w.build(progress, this.quality());
    this.world = w;
    this.scene.add(w.group);
    this.player = new CharacterController(w.collision, w.plan.spawn.x, w.plan.spawn.z);
    this.equip(starterWeapon(w.seed));
    this.yaw = w.plan.spawn.yaw;
    this.titleYaw = this.yaw;
    this.pitch = 0.02;
    this.updatePixelScale();
  }

  private async beginJourney(): Promise<void> {
    const seed = canonicalizeSeed(this.ui.seedInput.value || REFERENCE_SEED);
    this.audio.start();
    this.audio.setVolume(this.settings.volume);
    this.state = 'loading';
    this.ui.show('loading');
    this.ui.setProgress(0, 'Charting the vale');
    try {
      if (this.building) await this.building;
      if (this.world?.seed !== seed) {
        this.building = this.loadWorld(seed, (stage, f) => this.ui.setProgress(f, stage));
        await this.building;
      }
    } catch (e) {
      this.fail(e);
      return;
    }
    const w = this.world!;
    // A new journey starts fresh: finds restored, the humble starting blade in hand.
    w.loot.reset();
    this.equip(starterWeapon(w.seed));
    this.player!.teleport(w.plan.spawn.x, w.plan.spawn.z);
    this.yaw = w.plan.spawn.yaw;
    this.pitch = -0.28;
    this.guidance = new Guidance(this.ui, w.plan);
    this.ui.setProgress(1, 'Ready');
    this.history.replaceState(seed);
    this.startIntro();
  }

  private readonly history = {
    replaceState: (seed: string): void => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('seed', seed);
        window.history.replaceState(null, '', url);
      } catch {
        /* non-fatal */
      }
    },
  };

  private startIntro(): void {
    this.state = 'intro';
    this.stateTime = 0;
    this.ui.show(null);
    this.ui.showIntro(false);
    this.pipeline.fade = 0;
    if (this.opts.autotest) {
      this.ui.hideIntro();
      this.pipeline.fade = 1;
      this.pitch = 0;
      this.enterPlay();
      return;
    }
    requestAnimationFrame(() => this.ui.showIntro(true));
    setTimeout(() => this.audio.bell(), 400);
  }

  private enterCapture(): void {
    this.state = 'capture';
    this.input.enabled = false;
    this.ui.show(null);
    this.ui.setHud(true);
    this.ui.setCapture(true);
  }

  private enterPlay(): void {
    this.state = 'playing';
    this.input.clear();
    this.input.enabled = true;
    this.ui.show(null);
    this.ui.setCapture(false);
    this.ui.setHud(true);
    this.audio.resume();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.releaseLock();
    this.ui.prompt(null);
    this.ui.show('pause');
  }

  private resume(): void {
    if (this.opts.autotest) return this.enterPlay();
    this.enterCapture();
  }

  private toTitle(): void {
    this.input.releaseLock();
    this.input.enabled = false;
    this.state = 'title';
    this.ui.setHud(false);
    this.ui.setCapture(false);
    this.ui.hint(null);
    this.ui.clearMessage();
    this.ui.show('title');
    this.ui.setTitleStatus('', true);
    if (this.world) {
      this.titleYaw = this.world.plan.spawn.yaw;
      this.player?.teleport(this.world.plan.spawn.x, this.world.plan.spawn.z);
    }
  }

  private fail(e: unknown): void {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    this.errors.push(msg);
    console.error(e);
    this.ui.error(`Something went wrong while building the world.\n${msg}`);
  }

  // ---------------------------------------------------------------- events

  private onAction(a: string): void {
    this.audio.click();
    switch (a) {
      case 'new-journey':
        this.ui.push('new-journey');
        break;
      case 'random-seed':
        this.ui.seedInput.value = randomSeedName();
        break;
      case 'begin':
        void this.beginJourney();
        break;
      case 'open-settings':
        this.ui.push('settings');
        break;
      case 'open-credits':
        this.ui.push('credits');
        break;
      case 'back':
        this.ui.pop();
        break;
      case 'capture':
        this.input.requestLock();
        break;
      case 'resume':
        this.resume();
        break;
      case 'controls':
        this.ui.toggleControls();
        break;
      case 'to-title':
        this.toTitle();
        break;
    }
  }

  private onLockChange(locked: boolean): void {
    if (locked && (this.state === 'capture' || this.state === 'paused')) this.enterPlay();
    else if (!locked && this.state === 'playing' && !this.opts.autotest) this.pause();
  }

  private onKey(code: string): void {
    if (code === 'F3') {
      this.debugOn = !this.debugOn;
      if (!this.debugOn) this.ui.debug(null);
      return;
    }
    if (code === 'Escape') {
      if (this.state === 'paused' || this.state === 'title') {
        if (!this.ui.pop() && this.state === 'paused') this.resume();
      } else if (this.state === 'playing' && this.opts.autotest) this.pause();
      else if (this.state === 'capture') {
        this.state = 'paused';
        this.ui.setCapture(false);
        this.ui.show('pause');
      }
    }
    if (code === 'Enter' && this.ui.top === 'new-journey') void this.beginJourney();
  }

  private equip(w: WeaponGenome): void {
    this.weapon = w;
    this.viewModel.setWeapon(w);
  }

  private applySettings(s: Settings): void {
    const prev = this.settings;
    this.settings = s;
    if (s.internalHeight !== prev.internalHeight) {
      this.pipeline.setInternalHeight(s.internalHeight);
      this.updatePixelScale();
    }
    if (s.timeOfDay !== prev.timeOfDay) {
      this.preset = PRESETS[s.timeOfDay];
      this.applyLighting();
    }
    if (s.shadows !== prev.shadows) {
      this.renderer.shadowMap.enabled = s.shadows;
      this.sun.castShadow = s.shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
      });
    }
    this.pipeline.setOutlines(s.outlines);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.updatePixelScale();
    this.audio.setVolume(s.volume);
    this.ui.settingsStatus(saveSettings(s) ? 'Saved.' : 'Settings could not be saved in this browser (storage blocked); they apply for this session.');
  }

  private applyLighting(): void {
    const p = this.preset;
    applyPresetUniforms(p);
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.set(p.skyLight);
    this.hemi.groundColor.set(p.groundLight);
    this.hemi.intensity = p.hemiIntensity;
  }

  private resize(): void {
    this.pipeline.resize();
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel.setAspect(w / h);
    this.updatePixelScale();
  }

  private updatePixelScale(): void {
    const scale = this.pipeline.lowSize.h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.world?.setPixelScale(scale);
  }

  // ---------------------------------------------------------------- loop

  private readonly clock = new THREE.Clock();

  private frame(): void {
    const t0 = performance.now();
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    this.time += dt;
    this.stateTime += dt;
    atmosphereUniforms.uTime.value = this.time;
    // Wind slowly veers and gusts.
    const wa = 0.4 + Math.sin(this.time * 0.05) * 0.6;
    const ws = 0.8 + 0.4 * Math.sin(this.time * 0.13) * Math.sin(this.time * 0.31);
    this.wind.set(Math.cos(wa) * ws, Math.sin(wa) * ws);
    atmosphereUniforms.uWind.value.copy(this.wind);
    try {
      this.update(dt);
      this.render();
    } catch (e) {
      this.renderer.setAnimationLoop(null);
      this.fail(e);
    }
    this.input.endFrame();
    this.frameMs = performance.now() - t0;
    this.fpsAvg += (1 / Math.max(rawDt, 1e-3) - this.fpsAvg) * 0.05;
  }

  private update(dt: number): void {
    this.ui.update(dt);
    const w = this.world;
    const p = this.player;
    if (this.state === 'intro') this.updateIntro();

    if (w && p) {
      if (this.state === 'title') {
        // Slow cinematic drift beneath the ancient tree.
        this.titleYaw += dt * 0.012;
        this.yaw = w.plan.spawn.yaw + Math.sin(this.titleYaw * 3) * 0.22;
        this.pitch = 0.04 + Math.sin(this.time * 0.07) * 0.03;
      }
      if (this.state === 'playing') this.updatePlayer(dt);
      if (this.state === 'gallery' && this.gallery) {
        const cam = this.gallery.camera(dt);
        p.teleport(cam.pos.x, cam.pos.z, cam.pos.y - PLAYER.eye);
        const d = cam.target.clone().sub(cam.pos);
        this.yaw = Math.atan2(-d.x, -d.z);
        this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      }
      if (this.autopilot) this.stepAutopilot(dt);
      // Camera.
      this.eyeOffset += (0 - this.eyeOffset) * damp(14, dt);
      this.landingDip += (0 - this.landingDip) * damp(8, dt);
      const bobAmt = this.settings.headBob && p.onGround ? clamp(p.speed / PLAYER.walk, 0, 1.5) : 0;
      const bob = Math.abs(Math.sin((p.stride / 2.4) * Math.PI)) * 0.045 * bobAmt;
      this.camera.position.set(p.x, p.y + PLAYER.eye - this.eyeOffset - this.landingDip + bob, p.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      this.camera.updateMatrixWorld();
      const tw = performance.now();
      w.update(dt, this.camera.position, this.wind, this.state === 'playing' ? 5 : 8);
      const wms = performance.now() - tw;
      this.perf.worldMs.push(wms);
      if (this.perf.worldMs.length > 600) this.perf.worldMs.shift();
      this.audio.forestAmount = w.ecology.forestBase(p.x, p.z, p.y);
    }
    this.audio.update(dt);
    this.sky.position.copy(this.camera.position);
    this.sky.scale.setScalar(this.camera.far * 0.9);

    // Shadow frustum follows the player, snapped to texels to avoid shimmer.
    const sunDir = sunDirection(this.preset);
    const texel = 140 / 2048;
    const fx = Math.round(this.camera.position.x / texel) * texel;
    const fz = Math.round(this.camera.position.z / texel) * texel;
    const fy = Math.round(this.camera.position.y / texel) * texel;
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx + sunDir.x * 240, fy + sunDir.y * 240, fz + sunDir.z * 240);
    this.sun.target.updateMatrixWorld();

    this.viewModel.syncLighting(this.camera.quaternion, this.hemi.color, this.hemi.groundColor, this.hemi.intensity);
    this.viewModel.update(dt, {
      speed: p?.speed ?? 0,
      stride: p?.stride ?? 0,
      sprinting: this.input.down('ShiftLeft') || this.input.down('ShiftRight'),
      onGround: p?.onGround ?? true,
      landing: p ? p.landingImpulse : 0,
      lookDX: this.lookDX,
      lookDY: this.lookDY,
      bob: this.settings.headBob,
    });
    if (p) p.landingImpulse = 0;
    this.lookDX = this.lookDY = 0;

    if (this.debugOn) {
      this.debugTimer -= dt;
      if (this.debugTimer <= 0) {
        this.debugTimer = 0.25;
        this.ui.debug(this.debugText());
      }
    }
  }

  private updateIntro(): void {
    const t = this.stateTime;
    if (t > 3.4) this.ui.showIntro(false);
    if (t > 4.6) {
      this.ui.hideIntro();
      this.pipeline.fade = clamp((t - 4.6) / 2.6, 0, 1);
      // Waking: the gaze lifts from the roots to the vale.
      this.pitch = THREE.MathUtils.lerp(-0.28, 0.0, THREE.MathUtils.smoothstep(t, 4.6, 8.2));
    }
    if (t > 6.2 && t - (1 / 60) <= 6.2 + 1 / 30 && this.world) this.ui.banner('', this.world.plan.regionName, 6);
    if (t > 8.4) this.enterCapture();
  }

  private updatePlayer(dt: number): void {
    const p = this.player!;
    const w = this.world!;
    const m = this.input.takeMouse();
    const sens = 0.0022 * this.settings.mouseSensitivity;
    this.yaw -= m.dx * sens;
    this.pitch -= m.dy * sens * (this.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    this.lookDX = m.dx;
    this.lookDY = m.dy;
    const fwd = (this.input.down('KeyW') || this.input.down('ArrowUp') ? 1 : 0) - (this.input.down('KeyS') || this.input.down('ArrowDown') ? 1 : 0);
    const right = (this.input.down('KeyD') || this.input.down('ArrowRight') ? 1 : 0) - (this.input.down('KeyA') || this.input.down('ArrowLeft') ? 1 : 0);
    const sprint = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    const jump = this.input.consume('Space');
    const before = { x: p.x, z: p.z };
    p.update(dt, { forward: fwd, right, sprint, jump }, this.yaw);
    if (p.stepOffset > 0) this.eyeOffset += p.stepOffset; // smooth step-ups
    if (p.landingImpulse > 0) this.landingDip += Math.min(0.25, p.landingImpulse * 0.02);

    const g = this.guidance!;
    const movedNow = Math.hypot(p.x - before.x, p.z - before.z);
    g.state.moved += movedNow;
    if (sprint && fwd > 0) g.state.sprinted += movedNow;
    g.state.looked += Math.abs(m.dx) + Math.abs(m.dy);
    if (jump) g.state.jumped = true;
    if (this.input.takeClicks() > 0) {
      this.viewModel.attack();
      g.state.swung = true;
    }
    g.update(dt, p.x, p.z);

    // Footsteps follow the stride; surface from the road/ruin data.
    const strideLen = sprint ? 1.6 : 1.25;
    if (Math.floor(p.stride / strideLen) !== Math.floor(this.lastStride / strideLen) && p.onGround) this.audio.footstep(this.surfaceAt(p.x, p.z), sprint ? 1.2 : 0.9);
    this.lastStride = p.stride;

    // Interactables (signs, stones, weapon finds): nearest one in front within reach.
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    type Target = { position: THREE.Vector3; label: string; color?: string; act: () => void };
    const targets: Target[] = w.interactables.map((it) => ({
      position: it.position,
      label: it.label,
      act: () => {
        this.ui.message(it.text, 9);
        g.state.interacted = true;
        this.audio.click();
      },
    }));
    for (const f of w.loot.finds) {
      targets.push({
        position: f.anchor,
        label: `Take ${f.weapon.title ?? f.weapon.name}`,
        color: RARITY_COLOURS[f.weapon.rarity],
        act: () => {
          const taken = w.loot.take(f.find.id, this.weapon!);
          this.equip(taken);
          this.ui.weaponCard(taken, `${f.find.story} You take it up.`, 10);
          this.audio.whoosh();
          g.state.interacted = true;
        },
      });
    }
    let best: Target | null = null;
    let bestScore = 0;
    for (const it of targets) {
      const d = it.position.distanceTo(this.camera.position);
      if (d > 3.2) continue;
      const dir = it.position.clone().sub(this.camera.position).normalize();
      const score = dir.dot(camDir);
      if (score > 0.82 && score > bestScore) {
        best = it;
        bestScore = score;
      }
    }
    this.ui.prompt(best ? best.label : null, best?.color);
    if (best && this.input.consume('KeyE')) best.act();
    if (this.input.consume('KeyI') && this.weapon) {
      if (this.ui.weaponCardVisible) this.ui.weaponCard(null);
      else this.ui.weaponCard(this.weapon, 'In your hand');
    }
  }

  private surfaceAt(x: number, z: number): Surface {
    const w = this.world!;
    const hit = w.terrain.roadIndex.query(x, z);
    if (hit && hit.dist < hit.road.halfWidth + 0.3) {
      const hamlet = w.plan.settlements.find((s) => s.kind === 'hamlet');
      if (hit.road.kind === 'trade-road' && hamlet && Math.hypot(x - hamlet.x, z - hamlet.z) < 80) return 'stone';
      return 'dirt';
    }
    for (const r of w.plan.ruins) if (Math.hypot(x - r.x, z - r.z) < r.radius) return 'stone';
    return 'grass';
  }

  /** Asset-inspection mode: render only the view model against a neutral backdrop. */
  private inspectScene: THREE.Scene | null = null;

  private render(): void {
    this.renderer.info.reset();
    if (this.inspectScene) {
      this.pipeline.render(this.inspectScene, this.camera, { scene: this.viewModel.scene, camera: this.viewModel.camera }, atmosphereUniforms.uSunDir.value, atmosphereUniforms.uSunColor.value);
      return;
    }
    const showView = this.state !== 'gallery' && (this.state === 'playing' || this.state === 'capture' || this.state === 'paused' || (this.state === 'intro' && this.stateTime > 4.6));
    this.pipeline.render(this.scene, this.camera, showView ? { scene: this.viewModel.scene, camera: this.viewModel.camera } : null, atmosphereUniforms.uSunDir.value, atmosphereUniforms.uSunColor.value);
  }

  private debugText(): string {
    const p = this.player;
    const w = this.world;
    const info = this.renderer.info;
    const lines = [
      `FPS ${this.fpsAvg.toFixed(0)}  frame ${this.frameMs.toFixed(1)} ms  state ${this.state}`,
      `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k  geos ${info.memory.geometries}  tex ${info.memory.textures}`,
      `internal ${this.pipeline.lowSize.w}x${this.pipeline.lowSize.h}`,
    ];
    if (w && p) {
      const t = w.terrainStreamer.stats;
      const v = w.vegetation.stats;
      const c = w.collision.counts;
      lines.push(
        `seed ${w.seed}  gen v${w.plan.generatorVersion}`,
        `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  yaw ${this.yaw.toFixed(2)}  ground ${p.onGround ? 'yes' : 'no'}`,
        `terrain nodes ${t.nodes} queued ${t.queued} build ${t.lastBuildMs.toFixed(1)}ms max ${t.maxBuildMs.toFixed(1)}ms`,
        `veg chunks ${v.chunks} trees ${v.trees} ground ${v.ground} grass ${v.grass} pending ${v.pending} rebuild ${v.rebuildMs.toFixed(1)}ms`,
        `gen workers ${w.pool.stats.workers || 'none (inline)'} jobs ${w.pool.stats.jobs} queued ${w.pool.stats.queued}`,
        `colliders ${c.boxes} boxes ${c.circles} circles ${c.dynamic} trunks`,
        `streaming cpu ${(this.perf.worldMs[this.perf.worldMs.length - 1] ?? 0).toFixed(2)} ms (max ${Math.max(0, ...this.perf.worldMs).toFixed(1)})`,
        `validation ${w.validation.ok ? 'OK' : 'ISSUES ' + w.validation.issues.length} (${w.validation.checks} checks)`,
        `load ms ${Object.entries(w.timings).map(([k, v2]) => `${k}:${v2}`).join(' ')}`,
      );
    }
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- test hooks

  get testApi(): Record<string, unknown> {
    return {
      state: () => this.state,
      ready: () => this.world !== null,
      plan: () => this.world?.plan,
      player: () => (this.player ? { x: this.player.x, y: this.player.y, z: this.player.z, yaw: this.yaw, pitch: this.pitch, onGround: this.player.onGround } : null),
      teleport: (x: number, z: number, yaw?: number, pitch?: number) => {
        this.player?.teleport(x, z);
        if (yaw !== undefined) this.yaw = yaw;
        if (pitch !== undefined) this.pitch = pitch;
      },
      look: (yaw: number, pitch: number) => {
        this.yaw = yaw;
        this.pitch = pitch;
      },
      attack: () => this.viewModel.attack(),
      inspectViewModel: (on: boolean) => {
        this.inspectScene = on ? new THREE.Scene() : null;
        if (this.inspectScene) this.inspectScene.background = new THREE.Color('#5a5f6a');
      },
      viewModel: this.viewModel,
      setTimeOfDay: (t: Settings['timeOfDay']) => this.applySettings({ ...this.settings, timeOfDay: t }),
      setSettings: (s: Partial<Settings>) => this.applySettings({ ...this.settings, ...s }),
      validation: () => this.world?.validation,
      gallery: () => (this.gallery ? { mode: this.gallery.mode, index: this.gallery.index, current: this.gallery.current } : null),
      galleryAction: (a: string) => this.gallery?.action(a),
      gallerySet: (mode: 'creatures' | 'weapons', index: number, luck = 0) => {
        if (!this.gallery) return;
        this.gallery.mode = mode;
        this.gallery.index = index;
        this.gallery.luck = luck;
        this.gallery.show();
      },
      stats: () => ({
        fps: this.fpsAvg,
        frameMs: this.frameMs,
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        terrain: this.world?.terrainStreamer.stats,
        vegetation: this.world?.vegetation.stats,
        timings: this.world?.timings,
        geometries: this.renderer.info.memory.geometries,
      }),
      errors: this.errors,
      autopilot: (road: number, speed: number, perFrame = false) => {
        this.autopilot = { road, index: 0, speed, perFrame };
      },
      errorList: () => this.errors.slice(),
      weapon: () => this.weapon,
      finds: () => this.world?.loot.finds.map((f) => ({ id: f.find.id, x: f.find.x, z: f.find.z, anchor: f.anchor.toArray(), name: f.weapon.title ?? f.weapon.name, rarity: f.weapon.rarity })),
      equipSeed: (seed: number, luck = 0) => {
        void import('../gameplay/weapons').then((m) => this.equip(m.generateWeapon(seed, { luck })));
      },
      autopilotActive: () => this.autopilot !== null,
      perf: () => {
        const a = this.perf.worldMs.slice().sort((x, y) => x - y);
        const pick = (q: number): number => a[Math.min(a.length - 1, Math.floor(q * a.length))] ?? 0;
        return { samples: a.length, median: pick(0.5), p95: pick(0.95), max: a[a.length - 1] ?? 0 };
      },
      resetPerf: () => {
        this.perf.worldMs.length = 0;
        if (this.world) this.world.terrainStreamer.stats.maxBuildMs = 0;
      },
      /** Mean luminance and colour variety of the current frame (0–255), for "not a blank screen" checks. */
      frameStats: () => {
        const src = this.renderer.domElement;
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 90;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(src, 0, 0, 160, 90);
        const d = ctx.getImageData(0, 0, 160, 90).data;
        let sum = 0;
        const colours = new Set<number>();
        for (let i = 0; i < d.length; i += 4) {
          sum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
          colours.add(((d[i]! >> 3) << 10) | ((d[i + 1]! >> 3) << 5) | (d[i + 2]! >> 3));
        }
        return { mean: sum / (d.length / 4), colours: colours.size };
      },
      settled: () => (this.world ? this.world.terrainStreamer.stats.queued === 0 && this.world.vegetation.stats.pending === 0 : false),
    };
  }
}

const SEED_WORDS = ['amber', 'briar', 'cinder', 'dusk', 'elder', 'fallow', 'gloam', 'hollow', 'ivy', 'jade', 'kestrel', 'lantern', 'moss', 'nettle', 'oriel', 'pale', 'quill', 'rook', 'sable', 'thorn', 'umber', 'vesper', 'willow', 'yew'];

function randomSeedName(): string {
  // Seed *selection* may be random; everything generated from it is deterministic.
  const pick = (): string => SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]!;
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 900 + 100)}`;
}
