'use client';
import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveDebate, useReplay } from '@/client/useLiveDebate';
import { parseReplay, type Replay } from '@/client/replay';
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
  const name = useSearchParams().get('replay');
  return name ? <ReplayLoader name={name} /> : <Live />;
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
  return (
    <Stage scene={r.scene} defaultCamera="diretor"
      controls={{ ...r, onStop: () => router.push('/'), onVoice: v.toggle, voiceOn: v.on, voiceAvailable: v.available }} />
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

function Live() {
  const router = useRouter();
  const v = useVoice();
  const d = useLiveDebate(v.waitFor);
  v.config.current = d.scene.config;
  const { start, stop } = d;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const config = readSession<DebateConfig>('mesa:config');
    if (!config?.seats?.length) return router.replace('/config');
    start(config, readSession<Partial<Record<ProviderId, string>>>('mesa:keys') ?? {});
    setReady(true);
  }, [router, start]);
  if (!ready) return null;
  return (
    <Stage
      scene={d.scene}
      defaultCamera="orbita"
      controls={{ pause: d.pause, speed: d.speed, setSpeed: d.setSpeed, onStop: () => { stop(); router.push('/config'); },
        onVoice: v.toggle, voiceOn: v.on, voiceAvailable: v.available }}
    />
  );
}
