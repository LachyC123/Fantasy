/**
 * Unobtrusive guidance: a short sequence of control hints that advance as
 * the player actually performs each action, and place-name banners when the
 * player first comes upon a real generated place.
 */
import type { UI } from '../ui/ui';
import type { WorldPlan } from '../world/types';

interface Step {
  html: string;
  done: (s: GuidanceState) => boolean;
}

export interface GuidanceState {
  moved: number;
  looked: number;
  sprinted: number;
  jumped: boolean;
  swung: boolean;
  interacted: boolean;
}

const STEPS: Step[] = [
  { html: '<b>W A S D</b> to walk', done: (s) => s.moved > 4 },
  { html: 'Move the <b>mouse</b> to look around', done: (s) => s.looked > 400 },
  { html: 'Hold <b>Shift</b> to run', done: (s) => s.sprinted > 6 },
  { html: '<b>Space</b> to jump', done: (s) => s.jumped },
  { html: '<b>Left click</b> to swing your sword', done: (s) => s.swung },
  { html: 'Follow the path down to the vale. <b>E</b> reads signs and stones.', done: (s) => s.moved > 140 || s.interacted },
];

interface Place {
  id: string;
  kicker: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

export class Guidance {
  readonly state: GuidanceState = { moved: 0, looked: 0, sprinted: 0, jumped: false, swung: false, interacted: false };
  private step = 0;
  private stepTimer = 0;
  private gap = 1.2;
  private readonly places: Place[];
  private readonly seen = new Set<string>();

  constructor(
    private readonly ui: UI,
    plan: WorldPlan,
  ) {
    this.places = [];
    for (const s of plan.settlements) {
      if (s.kind === 'hamlet') this.places.push({ id: s.id, kicker: 'Hamlet', name: s.name, x: s.x, z: s.z, radius: 80 });
      else if (s.id === 'farm') this.places.push({ id: s.id, kicker: 'Farmstead', name: s.name, x: s.x, z: s.z, radius: 55 });
    }
    for (const r of plan.ruins) this.places.push({ id: r.id, kicker: 'Ruin', name: r.name, x: r.x, z: r.z, radius: 22 });
    this.places.push({ id: plan.castle.id, kicker: 'The great castle', name: plan.castle.name, x: plan.castle.gate.x, z: plan.castle.gate.z, radius: 70 });
  }

  update(dt: number, px: number, pz: number): void {
    // Control hints.
    if (this.step < STEPS.length) {
      if (this.gap > 0) {
        this.gap -= dt;
        if (this.gap <= 0) this.ui.hint(STEPS[this.step]!.html);
      } else {
        this.stepTimer += dt;
        if (STEPS[this.step]!.done(this.state) || this.stepTimer > 14) {
          this.step++;
          this.stepTimer = 0;
          this.gap = 1.4;
          this.ui.hint(null);
        }
      }
    }
    // Place discovery banners (first visit only).
    for (const p of this.places) {
      if (this.seen.has(p.id)) continue;
      if (Math.hypot(px - p.x, pz - p.z) < p.radius) {
        this.seen.add(p.id);
        this.ui.banner(p.kicker, p.name, 5);
      }
    }
  }

  skipHints(): void {
    this.step = STEPS.length;
    this.ui.hint(null);
  }
}
