'use client';
import { useEffect, useState } from 'react';
import { MODERATOR_ID, type DebateConfig } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import { memberName } from '@/scene/names';
import { resolveTemperamento } from '@/presets/temperamentos';
import { resolveExpertise } from '@/presets/expertises';
import { PROVIDERS } from '@/providers/table';
import { speechProgress } from '@/voice/speech';
import s from '@/scene/overlays.module.css';

export function lowerThirdInfo(config: DebateConfig, id: string): { nome: string; linha: string; modelo: string; cor: string } {
  if (id === MODERATOR_ID) {
    const { provider, model } = config.moderador;
    return { nome: 'Moderador', linha: 'Mediação', modelo: [model, `(${PROVIDERS[provider].nome})`].filter(Boolean).join(' '), cor: '#ffb23e' };
  }
  const seat = config.seats.find((x) => x.id === id);
  if (!seat) return { nome: memberName(config, id), linha: '', modelo: '', cor: '#ffb23e' };
  const t = resolveTemperamento(seat.temperamento);
  return {
    nome: seat.nome,
    linha: `${t.nome} · ${resolveExpertise(seat.expertise).nome}`,
    modelo: [seat.model, `(${PROVIDERS[seat.provider].nome})`].filter(Boolean).join(' '),
    cor: t.corGravata,
  };
}

/** Folga entre o fim da fala e o GC sumir. */
export const GC_LINGER_MS = 1500;

/** GC de TV: desliza a cada novo turno (key = turnSeq), some {GC_LINGER_MS} após o fim da fala. Sem aria-live: a legenda já anuncia a fala. */
export function LowerThird({ scene }: { scene: SceneState }) {
  const { speaker, turnSeq } = scene;
  const [goneSeq, setGoneSeq] = useState(-2); // turno cujo GC já saiu
  useEffect(() => {
    if (!speaker) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poller = setInterval(() => { // setInterval, não rAF: precisão de 250 ms basta e roda também com a aba em segundo plano
      if (speechProgress(speaker, turnSeq).progress < 1) return;
      clearInterval(poller);
      timer = setTimeout(() => setGoneSeq(turnSeq), GC_LINGER_MS);
    }, 250);
    return () => { clearInterval(poller); clearTimeout(timer); };
  }, [speaker, turnSeq]);
  if (!scene.speaker || !scene.config || goneSeq === turnSeq) return null;
  const info = lowerThirdInfo(scene.config, scene.speaker);
  return (
    <div key={scene.turnSeq} className={s.gc} aria-hidden="true" style={{ borderLeftColor: info.cor }}>
      <div className={s.gcNome}>{info.nome}</div>
      <div className={s.gcLinha}>{info.linha}</div>
      <div className={s.gcModelo}>{info.modelo}</div>
    </div>
  );
}
