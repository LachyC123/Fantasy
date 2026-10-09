/// <reference lib="webworker" />
/**
 * Generation worker: rebuilds the deterministic world logic for a seed and
 * answers terrain/vegetation jobs with transferable typed arrays.
 */
import { GenCore, type GenJob } from './genCore';
import { transferables } from './vegPack';

let core: GenCore | null = null;

self.onmessage = (e: MessageEvent<{ type: 'init'; seed: string } | { type: 'job'; id: number; job: GenJob }>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    core = new GenCore(msg.seed);
    (self as unknown as Worker).postMessage({ type: 'ready' });
    return;
  }
  if (!core) return;
  try {
    const result = core.run(msg.job);
    (self as unknown as Worker).postMessage({ type: 'done', id: msg.id, result }, transferables(result));
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', id: msg.id, message: String(err) });
  }
};
