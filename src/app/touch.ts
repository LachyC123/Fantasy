/**
 * Touch controls for phones and tablets: a floating thumbstick on the left,
 * drag-to-look anywhere else, and buttons for swing, jump, use, the weapon
 * card and pause. Everything feeds the same `Input` the keyboard and mouse
 * use, so gameplay code has a single path.
 */
import type { Input } from './input';

/** Stick travel in CSS pixels for full deflection. */
const STICK_RADIUS = 56;
/** Deflection beyond which the player runs. */
const SPRINT_AT = 0.92;
/** Look speed relative to mouse movement: a 300 px swipe turns about 95°. */
const LOOK_SCALE = 2.5;

export interface TouchHandlers {
  pause: () => void;
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly useBtn: HTMLButtonElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  constructor(
    private readonly input: Input,
    handlers: TouchHandlers,
  ) {
    const root = document.createElement('div');
    root.id = 'touch';
    root.hidden = true;
    root.innerHTML = `
      <div class="touch-surface"></div>
      <div class="touch-stick"><div class="touch-knob"></div></div>
      <button class="tb tb-pause" aria-label="Pause">❚❚</button>
      <button class="tb tb-card" aria-label="Inspect your weapon">⚔ Weapon</button>
      <button class="tb tb-use" aria-label="Use" hidden>Use</button>
      <button class="tb tb-jump" aria-label="Jump">Jump</button>
      <button class="tb tb-swing" aria-label="Swing">Swing</button>`;
    document.getElementById('ui')!.appendChild(root);
    this.root = root;
    this.base = root.querySelector('.touch-stick')!;
    this.knob = root.querySelector('.touch-knob')!;
    this.useBtn = root.querySelector('.tb-use')!;

    const surface = root.querySelector<HTMLDivElement>('.touch-surface')!;
    surface.addEventListener('pointerdown', (e) => this.down(e));
    surface.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) surface.addEventListener(ev, (e) => this.up(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    const tap = (sel: string, fn: () => void): void => {
      const b = root.querySelector<HTMLButtonElement>(sel)!;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('held');
        fn();
      });
      const release = (): void => b.classList.remove('held');
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('pointerleave', release);
    };
    tap('.tb-swing', () => this.input.addClick());
    tap('.tb-jump', () => this.input.tapKey('Space'));
    tap('.tb-use', () => this.input.tapKey('KeyE'));
    tap('.tb-card', () => this.input.tapKey('KeyI'));
    tap('.tb-pause', () => handlers.pause());
    // The on-screen prompt itself is also a Use button.
    document.querySelector<HTMLElement>('#hud .prompt')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.tapKey('KeyE');
    });
    this.resetStick();
  }

  set visible(on: boolean) {
    this.root.hidden = !on;
    if (!on) this.releaseAll();
  }

  /** Show the Use button while something usable is in front of the player. */
  setUseAvailable(on: boolean): void {
    if (this.useBtn.hidden === on) this.useBtn.hidden = !on;
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    const leftSide = e.clientX < window.innerWidth * 0.42;
    if (leftSide && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.base.classList.add('active');
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.setKnob(0, 0);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    } else return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) {
        dx *= STICK_RADIUS / len;
        dy *= STICK_RADIUS / len;
      }
      this.setKnob(dx, dy);
      const mag = Math.min(1, len / STICK_RADIUS);
      // Small dead zone, then a full-range response.
      const k = mag < 0.12 ? 0 : (mag - 0.12) / 0.88 / Math.max(mag, 1e-6);
      this.input.axis.x = (dx / STICK_RADIUS) * k;
      this.input.axis.y = (-dy / STICK_RADIUS) * k;
      this.input.axis.sprint = mag >= SPRINT_AT && -dy > Math.abs(dx) * 0.5;
      this.base.classList.toggle('sprint', this.input.axis.sprint);
    } else if (e.pointerId === this.lookId) {
      if (this.input.enabled) this.input.injectLook((e.clientX - this.lookLast.x) * LOOK_SCALE, (e.clientY - this.lookLast.y) * LOOK_SCALE);
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.resetStick();
    } else if (e.pointerId === this.lookId) this.lookId = null;
  }

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Idle stick rests in the lower-left corner as a hint of where to press. */
  private resetStick(): void {
    this.base.classList.remove('active', 'sprint');
    this.base.style.left = '';
    this.base.style.top = '';
    this.setKnob(0, 0);
    this.input.axis.x = this.input.axis.y = 0;
    this.input.axis.sprint = false;
  }

  private releaseAll(): void {
    this.stickId = null;
    this.lookId = null;
    this.resetStick();
  }
}
