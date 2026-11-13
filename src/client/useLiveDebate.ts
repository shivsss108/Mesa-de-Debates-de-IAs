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
  const events: DebateEvent[] = [];
  let state: DebateState = createInitialState(config, Date.now());
  try {
    while (!signal.aborted && !state.done) {
      while (opts.paused() && !signal.aborted) await sleep(200);
      if (signal.aborted) break;
      const stream = await opts.fetchStep({ config, state, keys, seqStart: events.length }, signal);
      let next: DebateState | undefined;
      for await (const m of readSSE(stream)) {
        if (signal.aborted) break;
        if (m.event === 'state') next = JSON.parse(m.data) as DebateState;
        else {
          const e = JSON.parse(m.data) as DebateEvent;
          events.push(e);
          onEvent(e);
          if (e.type === 'turn_end') await opts.waitFor?.(e);
        }
      }
      // step sem `state` (ou abortado) conta como erro: não dispara novo passo
      if (!next) break;
      state = next;
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

  const start = useCallback((config: DebateConfig, keys: Partial<Record<ProviderId, string>>) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setEvents([]);
    const fetchStep = async (body: object, signal: AbortSignal) => {
      const res = await fetch('/api/debate/step', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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
