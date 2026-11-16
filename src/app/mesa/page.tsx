'use client';
import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveDebate, useReplay } from '@/client/useLiveDebate';
import { parseReplay, type Replay } from '@/client/replay';
import { EndPanel } from '@/scene/EndPanel';
import { useVoice } from '@/voice/useVoice';
import type { DebateConfig, ProviderId } from '@/types';

const Stage = dynamic(() => import('@/scene/Stage').then((m) => m.Stage), { ssr: false });

const REPLAYS: Record<string, () => Promise<unknown>> = {
  'demo-1': () => import('@/replays/demo-1.json').then((m) => m.default),
};

export default function MesaPage() {
  return (
    <Suspense fallback={null}>
      <Mesa />
    </Suspense>
  );
}

function Mesa() {
  const q = useSearchParams();
  const name = q.get('replay');
  const quick = q.get('quick'); // semente do debate rápido
  return name ? <ReplayLoader name={name} /> : <Live quick={quick === null ? undefined : Number(quick)} />;
}

function ReplayLoader({ name }: { name: string }) {
  const [replay, setReplay] = useState<Replay>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    const load = REPLAYS[name];
    if (!load) return setErr(`Replay "${name}" não encontrado.`);
    load()
      .then((j) => setReplay(parseReplay(j)))
      .catch((e: Error) => setErr(e.message));
  }, [name]);
  if (err) return <p role="alert" style={{ color: '#fff', padding: 24 }}>{err}</p>;
  return replay ? <ReplayRun replay={replay} /> : null;
}

function ReplayRun({ replay }: { replay: Replay }) {
  const router = useRouter();
  const v = useVoice();
  const r = useReplay(replay, v.waitFor);
  v.config.current = r.scene.config;
  v.speed.current = r.speed;
  return (
    <>
      <Stage scene={r.scene} defaultCamera="diretor"
        controls={{ ...r, badge: 'REPRISE', onStop: () => router.push('/'), onVoice: v.toggle, voiceOn: v.on, voiceAvailable: v.available }} />
      <EndPanel scene={r.scene} events={replay.events} onNew={() => router.push('/config')} />
    </>
  );
}

function readSession<T>(key: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function Live({ quick }: { quick?: number }) {
  const router = useRouter();
  const isQuick = quick !== undefined;
  const back = isQuick ? '/' : '/config';
  const v = useVoice();
  const d = useLiveDebate(v.waitFor);
  v.config.current = d.scene.config;
  v.speed.current = d.speed;
  const { start, stop } = d;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const config = readSession<DebateConfig>(isQuick ? 'mesa:quick' : 'mesa:config');
    if (!config?.seats?.length) return router.replace(back);
    // debate rápido: a chave é a do servidor, as do visitante nem saem do navegador
    start(config, isQuick ? {} : (readSession<Partial<Record<ProviderId, string>>>('mesa:keys') ?? {}), quick);
    setReady(true);
  }, [router, start, quick, isQuick, back]);
  if (!ready) return null;
  return (
    <>
      <Stage
        scene={d.scene}
        defaultCamera="diretor"
        controls={{ pause: d.pause, speed: d.speed, setSpeed: d.setSpeed, onStop: () => { stop(); router.push(back); },
          onVoice: v.toggle, voiceOn: v.on, voiceAvailable: v.available, badge: 'AO VIVO' }}
      />
      <EndPanel scene={d.scene} events={d.events} onNew={() => router.push(back)} />
    </>
  );
}
