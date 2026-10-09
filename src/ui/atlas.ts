/**
 * The Hollow Atlas: a parchment map drawn from the world itself. Only ground
 * the player has travelled near is inked in; everything else is blank
 * vellum. Discovered places carry their names; roads appear where they have
 * been walked or seen.
 */
import type { RoadPlan, SiteKind, SitePlan } from '../world/types';

export interface AtlasView {
  x: number;
  z: number;
  yaw: number;
  /** Metres across the map. */
  extent: number;
  height: (x: number, z: number) => number;
  forest: (x: number, z: number, h: number) => number;
  explored: (x: number, z: number) => boolean;
  roads: RoadPlan[];
  sites: SitePlan[];
  /** Places heard of but not found: shown where the rumour puts them. */
  rumours: SitePlan[];
  regions: { name: string; x: number; z: number }[];
  heading: string;
  stats: string;
}

const INK = '#3b2b1c';
const VELLUM = '#e9dcbc';

export const ATLAS_ZOOMS = [1600, 3200, 6400, 12800];

export class Atlas {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly title: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly list: HTMLElement;
  zoom = 1;
  onClose: (() => void) | null = null;
  onZoom: ((z: number) => void) | null = null;

  constructor() {
    this.el = document.getElementById('atlas')!;
    this.canvas = this.el.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.title = this.el.querySelector('.atlas-region')!;
    this.stats = this.el.querySelector('.atlas-stats')!;
    this.list = this.el.querySelector('.atlas-places')!;
    this.el.querySelector('[data-atlas="close"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClose?.();
    });
    this.el.querySelector('[data-atlas="in"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setZoom(this.zoom - 1);
    });
    this.el.querySelector('[data-atlas="out"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setZoom(this.zoom + 1);
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setZoom(this.zoom + (e.deltaY > 0 ? 1 : -1));
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  get extent(): number {
    return ATLAS_ZOOMS[this.zoom]!;
  }

  setZoom(z: number): void {
    const next = Math.max(0, Math.min(ATLAS_ZOOMS.length - 1, z));
    if (next === this.zoom) return;
    this.zoom = next;
    this.onZoom?.(next);
  }

  show(on: boolean): void {
    this.el.hidden = !on;
  }

  draw(v: AtlasView): void {
    const cv = this.canvas;
    const size = Math.round(Math.min(cv.clientWidth || 640, cv.clientHeight || 640));
    if (cv.width !== size) {
      cv.width = size;
      cv.height = size;
    }
    const ctx = this.ctx;
    const W = cv.width;
    const scale = W / v.extent;
    const x0 = v.x - v.extent / 2;
    const z0 = v.z - v.extent / 2;
    const toX = (x: number): number => (x - x0) * scale;
    const toY = (z: number): number => (z - z0) * scale;

    // Vellum.
    ctx.fillStyle = VELLUM;
    ctx.fillRect(0, 0, W, W);

    // Explored ground: hill-shaded relief with stippled forests.
    const N = Math.min(220, Math.round(W / 3));
    const cell = v.extent / N;
    const px = W / N;
    const img = ctx.getImageData(0, 0, W, W);
    const d = img.data;
    const hs = new Float32Array((N + 1) * (N + 1));
    const ex = new Uint8Array(N * N);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) hs[j * (N + 1) + i] = v.height(x0 + i * cell, z0 + j * cell);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = x0 + (i + 0.5) * cell;
        const z = z0 + (j + 0.5) * cell;
        if (!v.explored(x, z)) continue;
        ex[j * N + i] = 1;
        const h = hs[j * (N + 1) + i]!;
        const hx = hs[j * (N + 1) + i + 1]! - h;
        const hz = hs[(j + 1) * (N + 1) + i]! - h;
        const shade = Math.max(0.55, Math.min(1.25, 1 - (hx + hz) / cell * 1.4));
        // Lowland green wash → upland ochre → mountain grey.
        const t = Math.max(0, Math.min(1, (h - 20) / 260));
        let r = 176 + (190 - 176) * t;
        let g = 186 + (164 - 186) * t;
        let b = 128 + (120 - 128) * t;
        if (h > 300) {
          const m = Math.min(1, (h - 300) / 200);
          r += (200 - r) * m;
          g += (196 - g) * m;
          b += (186 - b) * m;
        }
        const f = v.forest(x, z, h);
        if (f > 0.35) {
          r *= 0.78;
          g *= 0.86;
          b *= 0.74;
        }
        const x1 = Math.floor(i * px);
        const x2 = Math.floor((i + 1) * px);
        const y1 = Math.floor(j * px);
        const y2 = Math.floor((j + 1) * px);
        for (let yy = y1; yy < y2; yy++)
          for (let xx = x1; xx < x2; xx++) {
            const k = (yy * W + xx) * 4;
            // Paper grain.
            const grain = ((xx * 73856093) ^ (yy * 19349663)) & 15;
            d[k] = r * shade - grain;
            d[k + 1] = g * shade - grain;
            d[k + 2] = b * shade - grain;
          }
      }
    ctx.putImageData(img, 0, 0);

    // Forest stipple and the inked edge of the known world.
    ctx.fillStyle = 'rgba(52, 70, 40, 0.55)';
    for (let j = 0; j < N; j += 2)
      for (let i = (j / 2) % 2; i < N; i += 2) {
        if (!ex[j * N + i]) continue;
        const x = x0 + (i + 0.5) * cell;
        const z = z0 + (j + 0.5) * cell;
        if (v.forest(x, z, hs[j * (N + 1) + i]!) > 0.45) ctx.fillRect(i * px, j * px, Math.max(1, px * 0.9), Math.max(1, px * 0.9));
      }
    ctx.strokeStyle = 'rgba(59, 43, 28, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        if (!ex[j * N + i]) continue;
        if (i + 1 < N && !ex[j * N + i + 1]) {
          ctx.moveTo((i + 1) * px, j * px);
          ctx.lineTo((i + 1) * px, (j + 1) * px);
        }
        if (i > 0 && !ex[j * N + i - 1]) {
          ctx.moveTo(i * px, j * px);
          ctx.lineTo(i * px, (j + 1) * px);
        }
        if (j + 1 < N && !ex[(j + 1) * N + i]) {
          ctx.moveTo(i * px, (j + 1) * px);
          ctx.lineTo((i + 1) * px, (j + 1) * px);
        }
        if (j > 0 && !ex[(j - 1) * N + i]) {
          ctx.moveTo(i * px, j * px);
          ctx.lineTo((i + 1) * px, j * px);
        }
      }
    ctx.stroke();

    // Roads, where known.
    ctx.lineCap = 'round';
    for (const r of v.roads) {
      ctx.strokeStyle = r.kind === 'trade-road' ? 'rgba(110, 70, 40, 0.9)' : 'rgba(110, 70, 40, 0.6)';
      ctx.lineWidth = r.kind === 'trade-road' ? 2 : 1;
      ctx.setLineDash(r.kind === 'footpath' ? [3, 3] : []);
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < r.points.length; i += 3) {
        const p = r.points[i]!;
        const inside = p.x > x0 && p.x < x0 + v.extent && p.z > z0 && p.z < z0 + v.extent && v.explored(p.x, p.z);
        if (!inside) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(toX(p.x), toY(p.z));
        else ctx.moveTo(toX(p.x), toY(p.z));
        pen = true;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Region names, faintly.
    ctx.fillStyle = 'rgba(59, 43, 28, 0.35)';
    ctx.textAlign = 'center';
    ctx.font = `italic ${Math.max(12, Math.round(W / 36))}px 'IM Fell English', Georgia, serif`;
    for (const r of v.regions) if (r.x > x0 && r.x < x0 + v.extent && r.z > z0 && r.z < z0 + v.extent) ctx.fillText(r.name, toX(r.x), toY(r.z));

    // Discovered places.
    ctx.font = `${Math.max(11, Math.round(W / 46))}px 'IM Fell English', Georgia, serif`;
    for (const s of v.sites) {
      const sx = toX(s.x);
      const sy = toY(s.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > W + 20) continue;
      drawIcon(ctx, s.kind, sx, sy);
      ctx.fillStyle = INK;
      ctx.fillText(s.name, sx, sy - 10);
    }

    // Rumoured places: a question mark where you were told to look.
    ctx.font = `italic ${Math.max(11, Math.round(W / 46))}px 'IM Fell English', Georgia, serif`;
    for (const s of v.rumours) {
      const sx = toX(s.x);
      const sy = toY(s.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > W + 20) continue;
      ctx.strokeStyle = 'rgba(122, 40, 30, 0.75)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(122, 40, 30, 0.9)';
      ctx.fillText('?', sx, sy + 4);
      ctx.fillText(`${s.name} (rumoured)`, sx, sy - 13);
    }

    // You are here.
    ctx.save();
    ctx.translate(toX(v.x), toY(v.z));
    ctx.rotate(-v.yaw);
    ctx.fillStyle = '#a3261c';
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Compass rose and scale bar.
    ctx.fillStyle = INK;
    ctx.font = `${Math.max(12, Math.round(W / 40))}px 'IM Fell English', Georgia, serif`;
    ctx.fillText('N', W - 28, 26);
    ctx.beginPath();
    ctx.moveTo(W - 28, 30);
    ctx.lineTo(W - 22, 48);
    ctx.lineTo(W - 28, 43);
    ctx.lineTo(W - 34, 48);
    ctx.closePath();
    ctx.fill();
    const bar = niceLength(v.extent / 4);
    ctx.fillRect(16, W - 22, bar * scale, 3);
    ctx.textAlign = 'left';
    ctx.fillText(bar >= 1000 ? `${bar / 1000} km` : `${bar} m`, 16, W - 28);

    this.title.textContent = v.heading;
    this.stats.textContent = v.stats;
    const found = v.sites
      .slice()
      .reverse()
      .map((s) => `<li><span class="atlas-kind">${KIND_NAME[s.kind] ?? s.kind}</span> ${escapeHtml(s.name)}</li>`)
      .join('');
    const heard = v.rumours.map((s) => `<li class="atlas-rumour"><span class="atlas-kind">Rumour</span> ${escapeHtml(s.name)}</li>`).join('');
    this.list.innerHTML = found || heard ? heard + found : '<li class="atlas-empty">Nothing found yet. Wander off the road, or ask the locals.</li>';
  }
}

const KIND_NAME: Record<SiteKind, string> = {
  village: 'Village',
  hamlet: 'Hamlet',
  farmstead: 'Farm',
  cottage: 'Cottage',
  watchtower: 'Ruin',
  castle: 'Castle',
  stones: 'Stones',
  shrine: 'Shrine',
  camp: 'Camp',
  crossroads: 'Crossroads',
};

function niceLength(m: number): number {
  for (const n of [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000]) if (n >= m * 0.7) return n;
  return 5000;
}

function drawIcon(ctx: CanvasRenderingContext2D, kind: SiteKind, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  switch (kind) {
    case 'castle':
      ctx.fillRect(-6, -4, 12, 8);
      for (const sx of [-6, -1, 4]) ctx.fillRect(sx, -7, 2, 3);
      ctx.fillRect(-1.5, -10, 3, 6);
      break;
    case 'village':
    case 'hamlet':
      for (const sx of [-5, 3]) {
        ctx.beginPath();
        ctx.moveTo(sx - 3, 2);
        ctx.lineTo(sx - 3, -2);
        ctx.lineTo(sx, -5);
        ctx.lineTo(sx + 3, -2);
        ctx.lineTo(sx + 3, 2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'farmstead':
    case 'cottage':
      ctx.beginPath();
      ctx.moveTo(-4, 3);
      ctx.lineTo(-4, -1);
      ctx.lineTo(0, -5);
      ctx.lineTo(4, -1);
      ctx.lineTo(4, 3);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'watchtower':
      ctx.beginPath();
      ctx.moveTo(-3, 4);
      ctx.lineTo(-3, -6);
      ctx.lineTo(-1, -4);
      ctx.lineTo(1, -7);
      ctx.lineTo(3, -3);
      ctx.lineTo(3, 4);
      ctx.closePath();
      ctx.fill();
      break;
    case 'stones':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.fillRect(Math.sin(a) * 5 - 1, Math.cos(a) * 5 - 1.5, 2, 3);
      }
      break;
    case 'shrine':
      ctx.fillRect(-0.8, -6, 1.6, 10);
      ctx.fillRect(-3.5, -3.5, 7, 1.6);
      break;
    case 'camp':
      ctx.beginPath();
      ctx.moveTo(-5, 4);
      ctx.lineTo(0, -5);
      ctx.lineTo(5, 4);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'crossroads':
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(4, 4);
      ctx.moveTo(4, -4);
      ctx.lineTo(-4, 4);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
