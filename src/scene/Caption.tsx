'use client';
import { useEffect, useRef } from 'react';
import { bubbleText, speechProgress, speech } from '@/voice/speech';
import s from '@/scene/overlays.module.css';

/**
 * Legenda de TV (closed caption): 2 linhas, texto revelado no ritmo do relógio de fala; `override` (ex.: busca) tem prioridade.
 * A legenda visual é aria-hidden (muda a cada palavra); a região live escondida anuncia a fala inteira uma vez, no fim do turno.
 */
export function Caption({ speaker, name, turnSeq, override }: { speaker?: string; name?: string; turnSeq: number; override?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const lv = live.current;
    if (!speaker || !el || !lv) return;
    let raf = 0;
    let announced = false;
    if (override) lv.textContent = override.replace('🔎 ', '');
    const tick = () => {
      const text = override ?? bubbleText(speaker, turnSeq);
      if (el.textContent !== text) {
        el.textContent = text;
        el.scrollTo({ top: el.scrollHeight });
      }
      if (!override && !announced && speechProgress(speaker, turnSeq).progress >= 1) {
        announced = true;
        lv.textContent = `${name ?? speaker}: ${speech.text}`;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = ''; // a fala anterior nunca pisca por um frame
      lv.textContent = '';
    };
  }, [speaker, name, turnSeq, override]);
  return (
    <>
      <div className={s.caption} aria-hidden="true" style={{ display: speaker ? 'block' : 'none' }}>
        <div ref={ref} className={s.captionText} />
      </div>
      <div ref={live} aria-live="polite" className={s.sr} />
    </>
  );
}
