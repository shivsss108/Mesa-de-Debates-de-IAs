'use client';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { readSSE } from '@/client/sse';
import { playReplay, type Replay } from '@/client/replay';
import { initialScene, sceneReducer } from '@/scene/sceneReducer';
import { createInitialState } from '@/engine/initialState';
import type { DebateConfig, DebateEvent, DebateState, ProviderId } from '@/types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runLiveLoop(
  config: DebateConfig,
  keys: Partial<Record<ProviderId, string>>,
  onEvent: (e: DebateEvent) => void,
  opts: {
    fetchStep: (body: object, signal: AbortSignal) => Promise<ReadableStream<Uint8Array>>;
    signal: AbortSignal;
    paused: () => boolean;
    waitFor?: (e: DebateEvent) => Promise<void>;
  },
): Promise<DebateEvent[]> {
  const { signal } = opts;
  const events: DebateEvent[] = []; // já exibidos, na ordem
  // Fila entre a rede e a tela: o passo seguinte é gerado enquanto a fala do atual ainda toca (waitFor).
  type Item = { e: DebateEvent } | { end: true; err?: unknown; last: boolean };
  const queue: Item[] = [];
  const waiters: (() => void)[] = [];
  const notify = () => waiters.splice(0).forEach((f) => f());
  const changed = () => new Promise<void>((r) => waiters.push(r));
  signal.addEventListener('abort', notify, { once: true });
  let shown = 0; // passos exibidos por inteiro

  const produce = async () => {
    let state: DebateState = createInitialState(config, Date.now());
    let seq = 0;
    for (let k = 0; !signal.aborted && !state.done; k++) {
      // ponytail: no máximo 1 passo à frente da tela; parar o debate desperdiça até 1 passo de cota
      while (k > shown + 1 && !signal.aborted) await changed();
      while (opts.paused() && !signal.aborted) await sleep(200);
      if (signal.aborted) return;
      let next: DebateState | undefined;
      let lastWasError = false;
      try {
        const stream = await opts.fetchStep({ config, state, keys, seqStart: seq }, signal);
        for await (const m of readSSE(stream)) {
          if (signal.aborted) return;
          if (m.event === 'state') next = JSON.parse(m.data) as DebateState;
          else {
            const e = JSON.parse(m.data) as DebateEvent;
            seq++;
            lastWasError = e.type === 'error';
            queue.push({ e });
            notify();
          }
        }
        // step sem `state` conta como erro e não dispara novo passo (o servidor pode já ter mandado o seu `error`)
        if (!next && !lastWasError && !signal.aborted) throw new Error('O passo não terminou. Tente novamente.');
      } catch (err) {
        queue.push({ end: true, err, last: true });
        notify();
        return;
      }
      queue.push({ end: true, last: !next || next.done });
      notify();
      if (!next) return;
      state = next;
    }
  };

  void produce();
  try {
    for (;;) {
      while (!queue.length && !signal.aborted) await changed();
      if (signal.aborted) break;
      const it = queue.shift()!;
      if ('end' in it) {
        if ('err' in it) throw it.err;
        shown++;
        notify();
        if (it.last) break;
        while (opts.paused() && !signal.aborted) await sleep(200); // o passo adiantado não fura a pausa
        continue;
      }
      events.push(it.e);
      onEvent(it.e);
      if (it.e.type === 'turn_end') await opts.waitFor?.(it.e);
    }
  } catch (err) {
    // abort fica em silêncio; qualquer outra falha vira evento `error` para a cena mostrar
    if (!signal.aborted) {
      const message = err instanceof Error && err.message ? err.message : 'Falha ao executar o passo do debate.';
      const e: DebateEvent = { type: 'error', message, seq: events.length, t: events.at(-1)?.t ?? 0 };
      events.push(e);
      try {
        onEvent(e);
      } catch {
        // onEvent quebrado não pode derrubar o retorno dos eventos gravados
      }
    }
  }
  return events;
}

export function useLiveDebate(waitFor?: (e: DebateEvent) => Promise<void>) {
  const [scene, dispatch] = useReducer(sceneReducer, initialScene);
  const [events, setEvents] = useState<DebateEvent[]>([]);
  const [speed, setSpeedState] = useState<number>(1);
  const ctl = useRef<AbortController | null>(null);
  const paused = useRef(false);
  const waitRef = useRef(waitFor);
  waitRef.current = waitFor;

  const stop = useCallback(() => ctl.current?.abort(), []);
  useEffect(() => stop, [stop]); // sair da página aborta o passo em andamento

  /** `quick`: semente do debate rápido (o servidor monta a config e usa a própria chave). */
  const start = useCallback((config: DebateConfig, keys: Partial<Record<ProviderId, string>>, quick?: number) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setEvents([]);
    const fetchStep = async (body: object, signal: AbortSignal) => {
      const res = await fetch('/api/debate/step', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, quick }),
        signal,
      });
      if (!res.ok || !res.body) {
        const detail = await res.json().then((j: { error?: unknown }) => j?.error, () => undefined);
        throw new Error(typeof detail === 'string' && detail ? detail : `Falha no passo (${res.status}).`);
      }
      return res.body;
    };
    void runLiveLoop(
      config,
      keys,
      (e) => {
        dispatch(e);
        setEvents((p) => [...p, e]);
      },
      { fetchStep, signal: c.signal, paused: () => paused.current, waitFor: (e) => waitRef.current?.(e) ?? Promise.resolve() },
    );
  }, []);

  return {
    scene,
    start,
    stop,
    pause: (p: boolean) => (paused.current = p),
    speed,
    setSpeed: (n: 1 | 1.5 | 2) => setSpeedState(n),
    events,
  };
}

export function useReplay(replay: Replay, waitFor?: (e: DebateEvent) => Promise<void>) {
  const [scene, dispatch] = useReducer(sceneReducer, initialScene);
  const [speed, setSpeedState] = useState<number>(1);
  const speedRef = useRef(1);
  const [run, setRun] = useState(0);
  const restart = useCallback(() => setRun((n) => n + 1), []);
  const paused = useRef(false);
  const waitRef = useRef(waitFor);
  waitRef.current = waitFor;
  speedRef.current = speed;

  useEffect(() => {
    const c = new AbortController();
    void playReplay(replay, dispatch, { speed: () => speedRef.current, paused: () => paused.current, signal: c.signal, waitFor: (e) => waitRef.current?.(e) ?? Promise.resolve() });
    return () => c.abort();
  }, [replay, run]);

  return { scene, restart, pause: (p: boolean) => (paused.current = p), speed, setSpeed: (n: 1 | 1.5 | 2) => setSpeedState(n) };
}
