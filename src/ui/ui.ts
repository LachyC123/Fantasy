/**
 * DOM front end: title, new journey, settings, credits, loading, intro,
 * HUD, capture prompt, pause, debug overlay. Every visible button maps to a
 * real action; menus can be navigated by keyboard and closed with Esc.
 */
import type { Settings } from '../app/settings';

type PanelId = 'title' | 'new-journey' | 'settings' | 'credits' | 'loading' | 'intro' | 'pause';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`UI element ${sel} missing`);
  return el;
};

export class UI {
  private readonly panels: Record<PanelId, HTMLElement>;
  private readonly hud = $<HTMLDivElement>('#hud');
  private readonly capture = $<HTMLDivElement>('#capture');
  private readonly debugEl = $<HTMLPreElement>('#debug');
  private readonly promptEl = $<HTMLDivElement>('#hud .prompt');
  private readonly hintEl = $<HTMLDivElement>('#hud .hint-line');
  private readonly bannerEl = $<HTMLDivElement>('#hud .banner');
  private readonly messageEl = $<HTMLDivElement>('#hud .message');
  private messageTimer = 0;
  private bannerTimer = 0;
  private readonly stack: PanelId[] = [];
  onAction: (action: string) => void = () => undefined;
  onSettings: (s: Settings) => void = () => undefined;

  constructor() {
    this.panels = {
      title: $('#title'),
      'new-journey': $('#new-journey'),
      settings: $('#settings'),
      credits: $('#credits'),
      loading: $('#loading'),
      intro: $('#intro'),
      pause: $('#pause'),
    };
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onAction(b.dataset.action!);
      }),
    );
  }

  /** Show exactly one full-screen panel (or none). */
  show(id: PanelId | null): void {
    for (const [k, el] of Object.entries(this.panels)) el.hidden = k !== id;
    this.stack.length = 0;
    if (id) {
      this.stack.push(id);
      this.focusFirst(id);
    }
  }

  /** Open a sub-panel over the current one (settings/credits/new journey). */
  push(id: PanelId): void {
    const top = this.stack[this.stack.length - 1];
    if (top && top !== 'title') this.panels[top].hidden = true;
    this.panels[id].hidden = false;
    this.stack.push(id);
    this.focusFirst(id);
  }

  /** Close the top sub-panel; returns false if nothing to close. */
  pop(): boolean {
    if (this.stack.length <= 1) return false;
    const top = this.stack.pop()!;
    this.panels[top].hidden = true;
    const under = this.stack[this.stack.length - 1]!;
    this.panels[under].hidden = false;
    this.focusFirst(under);
    return true;
  }

  get top(): PanelId | undefined {
    return this.stack[this.stack.length - 1];
  }

  private focusFirst(id: PanelId): void {
    const el = this.panels[id].querySelector<HTMLElement>('input, select, button.primary, button');
    el?.focus({ preventScroll: true });
  }

  setTitleStatus(text: string, ready: boolean): void {
    $('#title-status').textContent = text;
    $<HTMLButtonElement>('[data-action="new-journey"]').disabled = false;
    void ready;
  }

  setHud(visible: boolean): void {
    this.hud.hidden = !visible;
  }

  setCapture(visible: boolean): void {
    this.capture.hidden = !visible;
    if (visible) this.capture.querySelector('button')?.focus({ preventScroll: true });
  }

  setProgress(fraction: number, stage: string): void {
    const fill = this.panels.loading.querySelector<HTMLDivElement>('.fill')!;
    fill.style.width = `${Math.round(fraction * 100)}%`;
    this.panels.loading.querySelector('.bar')!.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    this.panels.loading.querySelector('.stage')!.textContent = stage;
  }

  showIntro(on: boolean): void {
    this.panels.intro.hidden = false;
    this.panels.intro.classList.toggle('show', on);
  }

  hideIntro(): void {
    this.panels.intro.hidden = true;
    this.panels.intro.classList.remove('show');
  }

  get seedInput(): HTMLInputElement {
    return $<HTMLInputElement>('#seed-input');
  }

  prompt(text: string | null): void {
    if (!text) {
      this.promptEl.hidden = true;
      return;
    }
    this.promptEl.hidden = false;
    this.promptEl.innerHTML = `<b>E</b> — ${escapeHtml(text)}`;
  }

  hint(html: string | null): void {
    if (html) this.hintEl.innerHTML = html;
    this.hintEl.classList.toggle('show', !!html);
  }

  banner(kicker: string, title: string, seconds = 5): void {
    this.bannerEl.querySelector('.banner-kicker')!.textContent = kicker;
    this.bannerEl.querySelector('.banner-title')!.textContent = title;
    this.bannerEl.classList.add('show');
    this.bannerTimer = seconds;
  }

  message(text: string, seconds = 7): void {
    this.messageEl.textContent = text;
    this.messageEl.hidden = false;
    this.messageTimer = seconds;
  }

  clearMessage(): void {
    this.messageEl.hidden = true;
    this.messageTimer = 0;
  }

  update(dt: number): void {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.messageEl.hidden = true;
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    }
  }

  debug(text: string | null): void {
    this.debugEl.hidden = text === null;
    if (text !== null) this.debugEl.textContent = text;
  }

  error(text: string): void {
    const el = $<HTMLDivElement>('#error');
    el.hidden = false;
    el.textContent = text;
  }

  toggleControls(): void {
    const el = this.panels.pause.querySelector<HTMLElement>('.controls-list')!;
    el.hidden = !el.hidden;
  }

  bindSettings(s: Settings): void {
    const res = $<HTMLSelectElement>('#set-res');
    const tod = $<HTMLSelectElement>('#set-tod');
    const fov = $<HTMLInputElement>('#set-fov');
    const sens = $<HTMLInputElement>('#set-sens');
    const vol = $<HTMLInputElement>('#set-vol');
    const inv = $<HTMLInputElement>('#set-invert');
    const bob = $<HTMLInputElement>('#set-bob');
    const sh = $<HTMLInputElement>('#set-shadows');
    const ol = $<HTMLInputElement>('#set-outlines');
    const outs = (): void => {
      $('#set-fov-out').textContent = `${fov.value}°`;
      $('#set-sens-out').textContent = `${Number(sens.value).toFixed(2)}×`;
      $('#set-vol-out').textContent = `${Math.round(Number(vol.value) * 100)}%`;
    };
    res.value = String(s.internalHeight);
    tod.value = s.timeOfDay;
    fov.value = String(s.fov);
    sens.value = String(s.mouseSensitivity);
    vol.value = String(s.volume);
    inv.checked = s.invertY;
    bob.checked = s.headBob;
    sh.checked = s.shadows;
    ol.checked = s.outlines;
    outs();
    const emit = (): void => {
      outs();
      this.onSettings({
        internalHeight: Number(res.value) as Settings['internalHeight'],
        timeOfDay: tod.value as Settings['timeOfDay'],
        fov: Number(fov.value),
        mouseSensitivity: Number(sens.value),
        volume: Number(vol.value),
        invertY: inv.checked,
        headBob: bob.checked,
        shadows: sh.checked,
        outlines: ol.checked,
      });
    };
    for (const el of [res, tod, fov, sens, vol, inv, bob, sh, ol]) el.addEventListener('input', emit);
  }

  settingsStatus(text: string): void {
    $('#settings-status').textContent = text;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
