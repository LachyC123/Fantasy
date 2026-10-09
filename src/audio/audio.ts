/**
 * Web Audio soundscape. All sounds are synthesised at runtime and are
 * explicitly PLACEHOLDERS until recorded/licensed assets replace them:
 * layered wind with gusts, forest rustle, birdsong phrases, a distant bell,
 * surface-aware footsteps, sword whoosh and UI clicks.
 */

export type Surface = 'grass' | 'dirt' | 'stone' | 'wood';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambience!: GainNode;
  private sfx!: GainNode;
  private windFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private rustleGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private birdTimer = 2;
  private gust = 0;
  private volume = 0.8;
  forestAmount = 0;
  outdoors = true;

  /** Must be called from a user gesture (browser autoplay policy). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.55;
    this.ambience.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);

    // Brown-ish noise buffer shared by wind, rustle, footsteps and whooshes.
    const len = ctx.sampleRate * 3;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.035 * white) / 1.035;
      d[i] = last * 3.2 + white * 0.08;
    }

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.35;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.ambience);
    wind.start();

    const rustle = ctx.createBufferSource();
    rustle.buffer = this.noiseBuffer;
    rustle.loop = true;
    rustle.playbackRate.value = 1.7;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.6;
    this.rustleGain = ctx.createGain();
    this.rustleGain.gain.value = 0;
    rustle.connect(bp).connect(this.rustleGain).connect(this.ambience);
    rustle.start();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Slow gusts.
    this.gust += dt * 0.25;
    const g = 0.5 + 0.5 * Math.sin(this.gust) * Math.sin(this.gust * 0.37 + 1.3);
    this.windFilter.frequency.setTargetAtTime(280 + g * 520, ctx.currentTime, 0.4);
    this.windGain.gain.setTargetAtTime(0.18 + g * 0.3, ctx.currentTime, 0.4);
    this.rustleGain.gain.setTargetAtTime(this.forestAmount * (0.04 + g * 0.09), ctx.currentTime, 0.4);
    // Birdsong phrases at random intervals; more of them near woodland.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.2 + Math.random() * (5 - this.forestAmount * 3);
      this.bird();
    }
  }

  private envGain(t: number, attack: number, peak: number, decay: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private bird(): void {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.ambience);
    const kind = Math.floor(Math.random() * 3);
    const notes = kind === 0 ? 3 + Math.floor(Math.random() * 4) : kind === 1 ? 2 : 6;
    const base = 2200 + Math.random() * 1800;
    let t = ctx.currentTime + 0.05;
    const vol = 0.025 + Math.random() * 0.03;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = base * (kind === 1 ? (i === 0 ? 1.25 : 1) : 1 + Math.random() * 0.3);
      const dur = kind === 2 ? 0.05 : 0.09 + Math.random() * 0.08;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (kind === 0 ? 1.35 : 0.8), t + dur);
      const g = this.envGain(t, 0.01, vol, dur);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + dur + 0.05);
      t += dur + (kind === 2 ? 0.03 : 0.05 + Math.random() * 0.08);
    }
  }

  /** Distant tolling bell: inharmonic partials through a feedback echo. */
  bell(distance = 1): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.05;
    const out = ctx.createGain();
    out.gain.value = 0.22 / Math.max(1, distance);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.37;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    out.connect(lp).connect(this.ambience);
    lp.connect(delay).connect(fb).connect(delay);
    fb.connect(this.ambience);
    const f = 196;
    for (const [ratio, amp, decay] of [
      [0.5, 0.5, 7],
      [1, 1, 5],
      [1.19, 0.5, 4],
      [1.5, 0.35, 3],
      [2.0, 0.4, 2.5],
      [2.74, 0.25, 1.8],
      [3.76, 0.15, 1.2],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const g = this.envGain(t, 0.005, amp * 0.3, decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  footstep(surface: Surface, intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = surface === 'stone' ? 2.2 : surface === 'wood' ? 1.4 : surface === 'dirt' ? 1.2 : 0.9;
    const f = ctx.createBiquadFilter();
    f.type = surface === 'grass' ? 'lowpass' : 'bandpass';
    f.frequency.value = surface === 'stone' ? 2400 : surface === 'wood' ? 900 : surface === 'dirt' ? 1100 : 700 + Math.random() * 300;
    f.Q.value = surface === 'stone' ? 1.5 : 0.7;
    const dur = surface === 'grass' ? 0.16 : 0.09;
    const g = this.envGain(t, 0.005, (surface === 'grass' ? 0.22 : 0.3) * intensity, dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 2, dur + 0.05);
  }

  whoosh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 2.5;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
    f.frequency.exponentialRampToValueAtTime(800, t + 0.25);
    const g = this.envGain(t, 0.04, 0.45, 0.22);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random(), 0.35);
  }

  click(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(440, t + 0.06);
    const g = this.envGain(t, 0.003, 0.08, 0.07);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.1);
  }
}
