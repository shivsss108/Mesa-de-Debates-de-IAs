'use client';
import { MODERATOR_ID, type DebateConfig } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import { memberName } from '@/scene/names';
import { resolveTemperamento } from '@/presets/temperamentos';
import { resolveExpertise } from '@/presets/expertises';
import { PROVIDERS } from '@/providers/table';
import s from '@/scene/overlays.module.css';

export function lowerThirdInfo(config: DebateConfig, id: string): { nome: string; linha: string; modelo: string; cor: string } {
  if (id === MODERATOR_ID) {
    const { provider, model } = config.moderador;
    return { nome: 'Moderador', linha: 'Mediação', modelo: `${model} (${PROVIDERS[provider].nome})`, cor: '#ffb23e' };
  }
  const seat = config.seats.find((x) => x.id === id);
  if (!seat) return { nome: memberName(config, id), linha: '', modelo: '', cor: '#ffb23e' };
  const t = resolveTemperamento(seat.temperamento);
  return {
    nome: seat.nome,
    linha: `${t.nome} · ${resolveExpertise(seat.expertise).nome}`,
    modelo: `${seat.model} (${PROVIDERS[seat.provider].nome})`,
    cor: t.corGravata,
  };
}

/** GC de TV: desliza a cada novo turno (key = turnSeq), some quando ninguém fala. Sem aria-live: a legenda já anuncia a fala. */
export function LowerThird({ scene }: { scene: SceneState }) {
  if (!scene.speaker || !scene.config) return null;
  const info = lowerThirdInfo(scene.config, scene.speaker);
  return (
    <div key={scene.turnSeq} className={s.gc} aria-hidden="true" style={{ borderLeftColor: info.cor }}>
      <div className={s.gcNome}>{info.nome}</div>
      <div className={s.gcLinha}>{info.linha}</div>
      <div className={s.gcModelo}>{info.modelo}</div>
    </div>
  );
}
