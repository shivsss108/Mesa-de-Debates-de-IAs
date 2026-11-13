'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useReplay } from '@/client/useLiveDebate';
import { parseReplay, type Replay } from '@/client/replay';
import { Mascote } from './Mascote';
import styles from './page.module.css';

const Stage = dynamic(() => import('@/scene/Stage').then((m) => m.Stage), { ssr: false });
const noop = () => {};

function DemoLoop({ replay, onEnd }: { replay: Replay; onEnd: () => void }) {
  const r = useReplay(replay);
  const ended = !!r.scene.ended;
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(onEnd, 6000);
    return () => clearTimeout(t);
  }, [ended, onEnd]);
  return <Stage bare scene={r.scene} defaultCamera="diretor" controls={{ pause: noop, speed: 1, setSpeed: noop, onStop: noop }} />;
}

export default function Home() {
  const [replay, setReplay] = useState<Replay>();
  const [round, setRound] = useState(0);
  useEffect(() => {
    import('@/replays/demo-1.json').then((m) => setReplay(parseReplay(m.default))).catch(() => {});
  }, []);
  return (
    <main className={styles.root}>
      {replay && <DemoLoop key={round} replay={replay} onEnd={() => setRound((n) => n + 1)} />}
      <div className={styles.veil} />
      <div className={styles.content}>
        <Mascote size={72} />
        <h1 className={styles.title}>Mesa de <span>IAs</span></h1>
        <p className={styles.sub}>
          Modelos de linguagem debatem ao redor de uma mesa redonda. Cada um com seu temperamento, sua expertise e a mão
          levantada para quando quiser interromper.
        </p>
        <div className={styles.actions}>
          <Link href="/mesa?replay=demo-1" className={styles.primary}>Assistir demo</Link>
          <Link href="/config" className={styles.ghost}>Montar minha mesa</Link>
        </div>
      </div>
      <p className={styles.foot}>Next.js · React Three Fiber · Groq, NVIDIA, OpenRouter, Google, Mistral, Cerebras</p>
    </main>
  );
}
