'use client';
import { useEffect, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReplay } from '@/client/useLiveDebate';
import { useVoice } from '@/voice/useVoice';
import { parseReplay, type Replay } from '@/client/replay';
import { Logo } from './Logo';
import styles from './page.module.css';

const Stage = dynamic(() => import('@/scene/Stage').then((m) => m.Stage), { ssr: false });
const noop = () => {};

function DemoLoop({ replay }: { replay: Replay }) {
  const r = useReplay(replay, useVoice().waitFor); // fala simulada: a boca mexe no fundo da tela inicial
  const { restart } = r;
  const ended = !!r.scene.ended;
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(restart, 6000);
    return () => clearTimeout(t);
  }, [ended, restart]);
  return <Stage bare scene={r.scene} defaultCamera="diretor" controls={{ pause: noop, speed: 1, setSpeed: noop, onStop: noop }} />;
}

export default function Home() {
  const router = useRouter();
  const [replay, setReplay] = useState<Replay>();
  const [quick, setQuick] = useState(false); // o servidor tem chave para o debate rápido
  const [tema, setTema] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  useEffect(() => {
    import('@/replays/demo-1.json').then((m) => setReplay(parseReplay(m.default))).catch(() => {});
    fetch('/api/quick').then((r) => r.json()).then((j: { enabled?: boolean }) => setQuick(!!j.enabled)).catch(() => {});
  }, []);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(undefined);
    try {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const res = await fetch('/api/quick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tema, seed }) });
      const j = (await res.json()) as { config?: unknown; error?: string };
      if (!res.ok || !j.config) throw new Error(j.error ?? 'Não foi possível começar o debate.');
      sessionStorage.setItem('mesa:quick', JSON.stringify(j.config));
      router.push(`/mesa?quick=${seed}`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Não foi possível começar o debate.');
      setBusy(false);
    }
  };
  return (
    <main className={styles.root}>
      {replay && <DemoLoop replay={replay} />}
      <div className={styles.veil} />
      <div className={styles.content}>
        <h1 style={{ margin: 0 }}><Logo size="lg" badge="AO VIVO · DEMO" /></h1>
        <p className={styles.sub}>
          Modelos de linguagem debatem ao redor de uma mesa redonda. Cada um com seu temperamento, sua expertise e a mão
          levantada para quando quiser interromper.
        </p>
        {quick && (
          <form className={styles.quick} onSubmit={go}>
            <input className={styles.tema} aria-label="Tema do debate rápido" placeholder="Sobre o que a mesa vai debater?"
              maxLength={300} required value={tema} onChange={(e) => setTema(e.target.value)} />
            <button type="submit" className={styles.primary} disabled={busy || !tema.trim()}>{busy ? 'Preparando…' : 'Debate rápido'}</button>
            <p className={styles.hint}>4 debatedores, 2 turnos. Sem cadastro e sem chave de API.</p>
            {err && <p role="alert" className={styles.err}>{err}</p>}
          </form>
        )}
        <div className={styles.actions}>
          <Link href="/mesa?replay=demo-1" className={quick ? styles.ghost : styles.primary}>Assistir demo</Link>
          <Link href="/config" className={styles.ghost}>Montar minha mesa</Link>
        </div>
      </div>
      <p className={styles.foot}>Next.js · React Three Fiber · Groq, NVIDIA, OpenRouter, Google, Mistral, Cerebras</p>
    </main>
  );
}
