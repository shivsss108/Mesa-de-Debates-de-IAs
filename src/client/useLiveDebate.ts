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
    waitFor?: () => Promise<void>;
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
          if (e.type === 'turn_end') await opts.waitFor?.();
        }
      }
      // step sem `state` (ou abortado) conta como erro: não dispara novo passo
      if (!next) break;
      state = next;
    }
  } catch {
    // abort ou falha de rede: devolve o que foi gravado
  }
  return events;
}

export function useLiveDebate() {
  const [scene, dispatch] = useReducer(sceneReducer, initialScene);
  const [events, setEvents] = useState<DebateEvent[]>([]);
  const [speed, setSpeedState] = useState<number>(1);
  const ctl = useRef<AbortController | null>(null);
  const paused = useRef(false);

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
      if (!res.ok || !res.body) throw new Error(`Falha no passo (${res.status})`);
      return res.body;
    };
    void runLiveLoop(
      config,
      keys,
      (e) => {
        dispatch(e);
        setEvents((p) => [...p, e]);
      },
      { fetchStep, signal: c.signal, paused: () => paused.current },
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

export function useReplay(replay: Replay) {
  const [scene, dispatch] = useReducer(sceneReducer, initialScene);
  const [speed, setSpeedState] = useState<number>(1);
  const speedRef = useRef(1);
  const paused = useRef(false);
  speedRef.current = speed;

  useEffect(() => {
    const c = new AbortController();
    void playReplay(replay, dispatch, { speed: () => speedRef.current, paused: () => paused.current, signal: c.signal });
    return () => c.abort();
  }, [replay]);

  return { scene, pause: (p: boolean) => (paused.current = p), speed, setSpeed: (n: 1 | 1.5 | 2) => setSpeedState(n) };
}
