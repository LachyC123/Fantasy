/**
 * Unobtrusive guidance: a short sequence of control hints that advance as
 * the player actually performs each action, and place-name banners when the
 * player first comes upon a real generated place.
 */
import type { UI } from '../ui/ui';
import type { SiteKind, SitePlan } from '../world/types';

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

const TOUCH_STEPS: Step[] = [
  { html: 'Hold your <b>left thumb</b> down and slide it to walk', done: (s) => s.moved > 4 },
  { html: '<b>Drag</b> on the right to look around', done: (s) => s.looked > 400 },
  { html: 'Push the stick <b>to its edge</b> to run', done: (s) => s.sprinted > 6 },
  { html: 'Tap <b>Jump</b>', done: (s) => s.jumped },
  { html: 'Tap <b>Swing</b> to swing your sword', done: (s) => s.swung },
  { html: 'Follow the path down to the vale. <b>Use</b> reads signs and stones.', done: (s) => s.moved > 140 || s.interacted },
];

const KICKER: Record<SiteKind, string> = {
  village: 'Village',
  hamlet: 'Hamlet',
  farmstead: 'Farmstead',
  cottage: 'Cottage',
  watchtower: 'Ruin',
  castle: 'Castle',
  stones: 'Standing stones',
  shrine: 'Wayside shrine',
  camp: 'Camp',
  crossroads: 'Crossroads',
};

export class Guidance {
  readonly state: GuidanceState = { moved: 0, looked: 0, sprinted: 0, jumped: false, swung: false, interacted: false };
  private step = 0;
  private stepTimer = 0;
  private gap = 1.2;
  /** Places already found this journey (by id). */
  readonly seen = new Set<string>();
  private readonly steps: Step[];
  private scan = 0;
  private region = '';
  /** Called once per place, the first time the player comes upon it. */
  onDiscover: ((site: SitePlan) => void) | null = null;

  constructor(
    private readonly ui: UI,
    private readonly sites: () => SitePlan[],
    private readonly regionAt: (x: number, z: number) => string,
    private readonly greatCastle: string,
    touch = false,
  ) {
    this.steps = touch ? TOUCH_STEPS : STEPS;
  }

  update(dt: number, px: number, pz: number): void {
    // Control hints.
    if (this.step < this.steps.length) {
      if (this.gap > 0) {
        this.gap -= dt;
        if (this.gap <= 0) this.ui.hint(this.steps[this.step]!.html);
      } else {
        this.stepTimer += dt;
        if (this.steps[this.step]!.done(this.state) || this.stepTimer > 14) {
          this.step++;
          this.stepTimer = 0;
          this.gap = 1.4;
          this.ui.hint(null);
        }
      }
    }
    // Discovery (first visit only), checked a few times a second.
    this.scan -= dt;
    if (this.scan > 0) return;
    this.scan = 0.3;
    for (const p of this.sites()) {
      if (this.seen.has(p.id)) continue;
      if (Math.hypot(px - p.x, pz - p.z) < p.radius) {
        this.seen.add(p.id);
        const kicker = p.kind === 'castle' && p.id === this.greatCastle ? 'The great castle' : KICKER[p.kind];
        this.ui.banner(kicker, p.name, 5);
        this.onDiscover?.(p);
        return;
      }
    }
    // Crossing into a new region names it.
    const r = this.regionAt(px, pz);
    if (r !== this.region) {
      const first = this.region === '';
      this.region = r;
      if (!first) this.ui.banner('You enter', r, 4);
    }
  }

  skipHints(): void {
    this.step = this.steps.length;
    this.ui.hint(null);
  }
}
