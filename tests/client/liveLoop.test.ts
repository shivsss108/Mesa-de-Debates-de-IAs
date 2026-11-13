import { describe, expect, it, vi } from 'vitest';
import { runLiveLoop } from '@/client/useLiveDebate';
import { createInitialState } from '@/engine/initialState';
import type { DebateConfig, DebateEvent } from '@/types';

const seat = (id: string) => ({
  id, nome: id, provider: 'groq' as const, model: 'm',
  temperamento: { presetId: 'x' }, expertise: { presetId: 'y' },
});
const config: DebateConfig = {
  tema: 't', idioma: 'pt', maxTurns: 6,
  moderador: { provider: 'groq', model: 'm', provocacao: 'media' },
  seats: [seat('m1'), seat('m2')],
};

const sse = (events: DebateEvent[], done: boolean) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      c.enqueue(enc.encode(`event: state\ndata: ${JSON.stringify({ ...createInitialState(config, 0), done })}\n\n`));
      c.close();
    },
  });
const ev = (seq: number): DebateEvent => ({ seq, t: seq, type: 'token', speaker: 'm1', text: 'x' });

describe('runLiveLoop', () => {
  it('encadeia passos, passa seqStart e para em done', async () => {
    const bodies: any[] = [];
    const steps = [sse([ev(0), ev(1)], false), sse([ev(2)], true)];
    const got: DebateEvent[] = [];
    const out = await runLiveLoop(config, {}, (e) => got.push(e), {
      fetchStep: async (b) => (bodies.push(b), steps.shift()!),
      signal: new AbortController().signal,
      paused: () => false,
    });
    expect(bodies.map((b) => b.seqStart)).toEqual([0, 2]);
    expect(out).toHaveLength(3);
    expect(got).toEqual(out);
  });

  it('aborta durante o 1º passo: 1 fetch, sem lançar, sem eventos após o abort', async () => {
    const ctl = new AbortController();
    const fetchStep = vi.fn(async () => sse([ev(0), ev(1)], false));
    const got: DebateEvent[] = [];
    const out = await runLiveLoop(config, {}, (e) => (got.push(e), ctl.abort()), { fetchStep, signal: ctl.signal, paused: () => false });
    expect(fetchStep).toHaveBeenCalledTimes(1);
    expect(got.map((e) => e.seq)).toEqual([0]);
    expect(out).toHaveLength(1);
  });

  it('falha não-abort vira evento error gravado e emitido', async () => {
    const got: DebateEvent[] = [];
    const out = await runLiveLoop(config, {}, (e) => got.push(e), {
      fetchStep: async () => { throw new Error('boom'); },
      signal: new AbortController().signal,
      paused: () => false,
    });
    expect(out.at(-1)).toMatchObject({ type: 'error', message: 'boom', seq: 0 });
    expect(got).toEqual(out);
  });

  it('AbortError após abort() resolve sem evento error', async () => {
    const ctl = new AbortController();
    const got: DebateEvent[] = [];
    const out = await runLiveLoop(config, {}, (e) => got.push(e), {
      fetchStep: async () => { ctl.abort(); throw new DOMException('aborted', 'AbortError'); },
      signal: ctl.signal,
      paused: () => false,
    });
    expect(out).toEqual([]);
    expect(got).toEqual([]);
  });

  it('passo sem evento state encerra o loop', async () => {
    const fetchStep = vi.fn(async () => sse([], false).pipeThrough(new TransformStream({ transform() {} })));
    await runLiveLoop(config, {}, () => {}, { fetchStep, signal: new AbortController().signal, paused: () => false });
    expect(fetchStep).toHaveBeenCalledTimes(1);
  });
});
