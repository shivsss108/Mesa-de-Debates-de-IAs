import type { DebateEvent } from '@/types';

export interface Replay { version: 1; events: DebateEvent[] }

const MAX_GAP_MS = 4000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function parseReplay(json: unknown): Replay {
  const r = json as Partial<Replay> | null;
  if (!r || r.version !== 1 || !Array.isArray(r.events)) throw new Error('Replay inválido');
  return r as Replay;
}

export async function playReplay(
  replay: Replay,
  onEvent: (e: DebateEvent) => void,
  opts: { speed: () => number; paused: () => boolean; signal: AbortSignal; waitFor?: () => Promise<void> },
): Promise<void> {
  let prev: DebateEvent | undefined;
  for (const e of replay.events) {
    if (prev) await sleep(Math.min(MAX_GAP_MS, Math.max(0, e.t - prev.t) / opts.speed()));
    while (opts.paused() && !opts.signal.aborted) await sleep(200);
    if (opts.signal.aborted) return;
    onEvent(e);
    if (e.type === 'turn_end') await opts.waitFor?.();
    prev = e;
  }
}
