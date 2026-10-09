/**
 * Pool of generation workers with a priority queue. Falls back to running
 * jobs inline on the main thread (time-sliced) when workers are unavailable.
 * Stale requests can be dropped before they are dispatched.
 */
import type { GenCore, GenJob, GenResult } from './genCore';

interface Pending {
  id: number;
  job: GenJob;
  priority: number;
  resolve: (r: GenResult) => void;
  reject: (e: Error) => void;
  cancelled: boolean;
}

export class GenPool {
  private readonly workers: Worker[] = [];
  private readonly busy = new Map<Worker, Pending>();
  private queue: Pending[] = [];
  private nextId = 1;
  private readyCount = 0;
  private inline: boolean;
  stats = { jobs: 0, workers: 0, inflight: 0, queued: 0 };

  constructor(
    seed: string,
    private readonly core: GenCore,
    count = Math.max(1, Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2) - 1)),
  ) {
    let ok = typeof Worker !== 'undefined';
    if (ok) {
      try {
        for (let i = 0; i < count; i++) {
          const w = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
          w.onmessage = (e) => this.onMessage(w, e.data);
          w.onerror = (e) => {
            // A worker that cannot start (blocked script, no module workers) must not stall loading.
            if (this.readyCount < this.workers.length) this.fallBackInline(e.message || 'worker failed to start');
            else console.error('[gen worker]', e.message);
          };
          w.postMessage({ type: 'init', seed });
          this.workers.push(w);
        }
      } catch (e) {
        console.warn('[gen pool] workers unavailable, generating on the main thread', e);
        this.workers.forEach((w) => w.terminate());
        this.workers.length = 0;
        ok = false;
      }
    }
    this.inline = !ok;
    this.stats.workers = this.workers.length;
    if (ok) {
      setTimeout(() => {
        if (!this.inline && this.readyCount < this.workers.length) this.fallBackInline('workers did not start within 15 s');
      }, 15_000);
    }
  }

  /** Switch to main-thread generation; jobs already handed to a worker go back in the queue. */
  private fallBackInline(reason: string): void {
    if (this.inline) return;
    console.warn('[gen pool] generating on the main thread:', reason);
    this.workers.forEach((w) => w.terminate());
    this.workers.length = 0;
    for (const p of this.busy.values()) this.queue.push(p);
    this.busy.clear();
    this.queue.sort((a, b) => a.priority - b.priority);
    this.inline = true;
    this.stats.workers = 0;
  }

  get usingWorkers(): boolean {
    return !this.inline;
  }

  request<T extends GenResult>(job: GenJob, priority: number): { promise: Promise<T>; cancel: () => void } {
    let p!: Pending;
    const promise = new Promise<T>((resolve, reject) => {
      p = { id: this.nextId++, job, priority, resolve: resolve as (r: GenResult) => void, reject, cancelled: false };
    });
    this.queue.push(p);
    this.queue.sort((a, b) => a.priority - b.priority);
    this.pump();
    return {
      promise,
      cancel: () => {
        p.cancelled = true;
      },
    };
  }

  /** Re-prioritise (number), drop (null) or keep (undefined) queued jobs. */
  reprioritise(fn: (job: GenJob) => number | null | undefined): void {
    for (const p of this.queue) {
      const pr = fn(p.job);
      if (pr === null) p.cancelled = true;
      else if (pr !== undefined) p.priority = pr;
    }
    this.queue = this.queue.filter((p) => !p.cancelled);
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  private pump(): void {
    if (this.inline) return; // inline jobs are run from tickInline()
    for (const w of this.workers) {
      if (this.busy.has(w) || this.readyCount < this.workers.length) continue;
      let p = this.queue.shift();
      while (p && p.cancelled) p = this.queue.shift();
      if (!p) break;
      this.busy.set(w, p);
      w.postMessage({ type: 'job', id: p.id, job: p.job });
    }
    this.stats.inflight = this.busy.size;
    this.stats.queued = this.queue.length;
  }

  /** Main-thread fallback: run queued jobs within a time budget. */
  tickInline(budgetMs: number): void {
    if (!this.inline) return;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const p = this.queue.shift()!;
      if (p.cancelled) continue;
      try {
        p.resolve(this.core.run(p.job));
        this.stats.jobs++;
      } catch (e) {
        p.reject(e as Error);
      }
    }
    this.stats.queued = this.queue.length;
  }

  private onMessage(w: Worker, msg: { type: string; id?: number; result?: GenResult; message?: string }): void {
    if (msg.type === 'ready') {
      this.readyCount++;
      this.pump();
      return;
    }
    const p = this.busy.get(w);
    this.busy.delete(w);
    if (p) {
      if (msg.type === 'done') {
        this.stats.jobs++;
        if (!p.cancelled) p.resolve(msg.result!);
      } else p.reject(new Error(msg.message));
    }
    this.pump();
  }

  /**
   * Wait until every live job has finished (loading). Inline mode runs them here, yielding to
   * the browser; worker mode only waits, and also covers a switch to inline mid-load.
   */
  async drain(): Promise<void> {
    while (this.busy.size > 0 || this.queue.some((p) => !p.cancelled)) {
      if (this.inline) this.tickInline(30);
      await new Promise((r) => setTimeout(r, this.inline ? 0 : 20));
    }
  }

  get idle(): boolean {
    return this.queue.length === 0 && this.busy.size === 0;
  }

  dispose(): void {
    this.workers.forEach((w) => w.terminate());
    this.queue = [];
  }
}
