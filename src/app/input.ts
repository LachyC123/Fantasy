/**
 * Keyboard / mouse input with deliberate pointer lock. Gameplay input is
 * only read while `enabled` (never under a modal menu).
 */
export class Input {
  private readonly keys = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private clicks = 0;
  enabled = false;
  /** Test hook: allow look/move without pointer lock (automated browser tests). */
  allowUnlocked = false;
  onPointerLockChange: ((locked: boolean) => void) | null = null;
  onKey: ((code: string) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.onKey?.(e.code);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || (!this.locked && !this.allowUnlocked)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.allowUnlocked) return;
      if (e.button === 0) this.clicks++;
    });
    document.addEventListener('pointerlockchange', () => this.onPointerLockChange?.(this.locked));
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    if (this.locked) return;
    const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  /** True once per key press (consumed). */
  consume(code: string): boolean {
    if (!this.enabled) return false;
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  takeMouse(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = this.mouseDY = 0;
    return r;
  }

  takeClicks(): number {
    const c = this.clicks;
    this.clicks = 0;
    return c;
  }

  /** Inject synthetic look input (used by automated tests). */
  injectLook(dx: number, dy: number): void {
    this.mouseDX += dx;
    this.mouseDY += dy;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  clear(): void {
    this.keys.clear();
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.clicks = 0;
  }
}
