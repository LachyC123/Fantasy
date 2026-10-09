/**
 * Compass ribbon across the top of the view: cardinal points, places you
 * have found (gold), and — when you are close — the pull of places you have
 * not (a faint mark, no name). It points the way without telling you what is
 * there.
 */

export interface CompassMark {
  id: string;
  x: number;
  z: number;
  known: boolean;
  name: string;
}

const CARDINALS: [string, number][] = [
  ['N', 0],
  ['NW', Math.PI / 4],
  ['W', Math.PI / 2],
  ['SW', (3 * Math.PI) / 4],
  ['S', Math.PI],
  ['SE', -(3 * Math.PI) / 4],
  ['E', -Math.PI / 2],
  ['NE', -Math.PI / 4],
];

const wrap = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export class Compass {
  private readonly el: HTMLElement;
  private readonly labels: HTMLElement[] = [];
  private readonly pool: HTMLElement[] = [];

  constructor() {
    this.el = document.querySelector('#hud .compass')!;
    for (const [name] of CARDINALS) {
      const s = document.createElement('span');
      s.className = name.length === 1 ? 'cardinal major' : 'cardinal';
      s.textContent = name;
      this.el.appendChild(s);
      this.labels.push(s);
    }
  }

  /** `yaw` is the camera yaw (0 looks north, −Z). */
  update(yaw: number, px: number, pz: number, marks: CompassMark[]): void {
    const half = this.el.clientWidth / 2 || 200;
    const place = (el: HTMLElement, targetYaw: number): boolean => {
      const d = wrap(targetYaw - yaw);
      if (Math.abs(d) > Math.PI / 2) {
        el.style.display = 'none';
        return false;
      }
      el.style.display = '';
      el.style.transform = `translateX(${(-d / (Math.PI / 2)) * half}px)`;
      el.style.opacity = String(1 - Math.max(0, Math.abs(d) / (Math.PI / 2) - 0.6) / 0.4);
      return true;
    };
    CARDINALS.forEach(([, a], i) => place(this.labels[i]!, a));
    while (this.pool.length < marks.length) {
      const m = document.createElement('span');
      this.el.appendChild(m);
      this.pool.push(m);
    }
    this.pool.forEach((m, i) => {
      const mk = marks[i];
      if (!mk) {
        m.style.display = 'none';
        return;
      }
      m.className = mk.known ? 'mark known' : 'mark unknown';
      m.title = mk.known ? mk.name : '';
      place(m, Math.atan2(-(mk.x - px), -(mk.z - pz)));
    });
  }

  show(on: boolean): void {
    this.el.hidden = !on;
  }
}
