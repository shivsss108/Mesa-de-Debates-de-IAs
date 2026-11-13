import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseReplay, playReplay } from '@/client/replay';
import type { DebateEvent } from '@/types';

const ev = (seq: number, t: number): DebateEvent => ({ seq, t, type: 'token', speaker: 'm1', text: 'x' });

afterEach(() => vi.useRealTimers());

describe('replay', () => {
  it('rejeita versão inválida', () => {
    expect(() => parseReplay({ version: 2 })).toThrow('Replay inválido');
    expect(() => parseReplay({ version: 1, events: 'x' })).toThrow('Replay inválido');
    expect(parseReplay({ version: 1, events: [] }).events).toEqual([]);
  });

  it('speed 2 usa metade dos deltas e limita pausas longas', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const got: number[] = [];
    const p = playReplay(
      { version: 1, events: [ev(0, 0), ev(1, 1000), ev(2, 100000)] },
      (e) => got.push(e.seq),
      { speed: () => 2, paused: () => false, signal: new AbortController().signal },
    );
    await vi.runAllTimersAsync();
    await p;
    expect(got).toEqual([0, 1, 2]);
    expect(spy.mock.calls.map((c) => c[1])).toEqual([500, 4000]);
  });
});
