'use client';
import { useEffect, useRef, useState } from 'react';
import type { DebateEvent } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import { Sources } from '@/scene/Sources';
import { Logo } from '@/app/Logo';
import s from './EndPanel.module.css';

export function EndPanel({ scene, events, onNew }: { scene: SceneState; events: DebateEvent[]; onNew: () => void }) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const end = scene.ended;

  useEffect(() => {
    if (end) setOpen(true); // novo debate_end reabre
  }, [end]);
  useEffect(() => {
    if (end && open) ref.current?.focus();
  }, [end, open]);

  if (!end) return null;
  if (!open)
    return <button type="button" className={`${s.btn} ${s.primary} ${s.reopen}`} onClick={() => setOpen(true)}>Ver resultado</button>;

  const download = () => {
    const blob = new Blob([JSON.stringify({ version: 1, events })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mesa-de-ias-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={s.overlay} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="encerramento-titulo" className={s.dialog}>
        <header className={s.head}>
          <Logo size="sm" />
          <h2 id="encerramento-titulo">Encerramento</h2>
        </header>
        <h3>Resumo</h3>
        <p>{end.summary}</p>
        <h3>Consensos</h3>
        <ul>{end.consensus.length ? end.consensus.map((c, i) => <li key={i}>{c}</li>) : <li>Nenhum consenso claro.</li>}</ul>
        <h3>Pontos em aberto</h3>
        <ul>{end.openPoints.length ? end.openPoints.map((c, i) => <li key={i}>{c}</li>) : <li>Nenhum.</li>}</ul>
        <h3>Veredito</h3>
        <p>{end.verdict}</p>
        {(scene.config?.dossie?.fontes.length || scene.extraSources.length) ? (
          <>
            <h3>Fontes</h3>
            <Sources dossie={scene.config?.dossie} extra={scene.extraSources} config={scene.config} />
          </>
        ) : null}
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.primary}`} onClick={download}>Baixar debate</button>
          <button type="button" className={s.btn} onClick={() => setOpen(false)}>Ver mesa</button>
          <button type="button" className={s.btn} onClick={onNew}>Nova mesa</button>
        </div>
      </div>
    </div>
  );
}
