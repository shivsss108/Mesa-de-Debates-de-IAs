'use client';
import { useEffect, useRef } from 'react';
import { bubbleText } from '@/voice/speech';
import s from '@/scene/overlays.module.css';

/** Legenda de TV (closed caption): 2 linhas, texto revelado no ritmo do relógio de fala; `override` (ex.: busca) tem prioridade. */
export function Caption({ speaker, turnSeq, override }: { speaker?: string; turnSeq: number; override?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!speaker) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      const text = override ?? bubbleText(speaker, turnSeq);
      if (el && el.textContent !== text) {
        el.textContent = text;
        el.scrollTo({ top: el.scrollHeight });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [speaker, turnSeq, override]);
  return <div ref={ref} aria-live="polite" className={s.caption} style={{ display: speaker ? 'block' : 'none' }} />;
}
