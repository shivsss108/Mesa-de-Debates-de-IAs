'use client';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { MODERATOR_ID } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import { Sources } from '@/scene/Sources';
import { memberName } from '@/scene/names';
import { lowerThirdInfo } from '@/scene/LowerThird';
import { CAMERA_LABEL, type CameraMode } from '@/scene/Cameras';
import { useIdle } from '@/scene/useIdle';
import { Logo } from '@/app/Logo';
import { AvatarThumb } from '@/skins/terno/AvatarThumb';
import { looksFor } from '@/skins/terno/look';
import { PROVIDERS } from '@/providers/table';
import { resolveTemperamento } from '@/presets/temperamentos';
import { resolveExpertise } from '@/presets/expertises';
import s from './Hud.module.css';

export interface StageControls {
  pause: (p: boolean) => void;
  speed: number;
  setSpeed: (n: 1 | 1.5 | 2) => void;
  onStop: () => void;
  /** botão de voz; desabilitado sem handler ou sem vozes no navegador */
  onVoice?: () => void;
  voiceOn?: boolean;
  voiceAvailable?: boolean;
  /** selo do programa: ao vivo ou replay */
  badge?: 'AO VIVO' | 'REPRISE';
}

const SPEEDS = [1, 1.5, 2] as const;
/** cor do membro em `--cor` (o CSS clareia para contraste) */
export const corStyle = (scene: SceneState, id: string) =>
  (scene.config ? { '--cor': lowerThirdInfo(scene.config, id).cor } : {}) as CSSProperties;

export function Hud({ scene, controls, camera, onCamera, hovered }: {
  scene: SceneState; controls: StageControls; camera: CameraMode; onCamera: () => void; hovered?: string;
}) {
  const [paused, setPaused] = useState(false);
  const [srcOpen, setSrcOpen] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const idle = useIdle(bar);
  const c = scene.config;
  const hasSources = !!c?.dossie?.fontes.length || scene.extraSources.length > 0;
  return (
    <div className={s.root}>
      <div className={`${s.panel} ${s.bug}`}>
        <Logo badge={controls.badge} />
        <span className={s.turn}>Turno {scene.turno}/{c?.maxTurns ?? '–'}</span>
      </div>

      {scene.hands.length > 0 && !scene.ended && (
        <section className={`${s.panel} ${s.hands}`} aria-label="Pedindo a palavra">
          <h2>Pedindo a palavra</h2>
          <ul>
            {scene.hands.map((h) => (
              <li key={h.member} title={h.reason}>
                <span className={s.name} style={corStyle(scene, h.member)}>{memberName(c, h.member)}</span>
                <span className={s.reason}> — {h.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hovered && <HoverCard scene={scene} id={hovered} />}

      <div ref={bar} role="toolbar" aria-label="Controles do programa" className={`${s.panel} ${s.bar} ${idle ? s.hidden : ''}`}>
        <button type="button" className={s.btn} aria-label={paused ? 'Retomar debate' : 'Pausar debate'}
          onClick={() => { controls.pause(!paused); setPaused(!paused); }}>
          {paused ? '▶ Retomar' : '⏸ Pausar'}
        </button>
        {SPEEDS.map((v) => (
          <button key={v} type="button" className={s.btn} aria-label={`Velocidade ${v}x`} aria-pressed={controls.speed === v}
            onClick={() => controls.setSpeed(v)}>
            {v}×
          </button>
        ))}
        <span className={s.sep} aria-hidden="true" />
        <button type="button" className={s.btn} aria-label={`Alternar câmera (tecla C), atual: ${CAMERA_LABEL[camera]}`} onClick={onCamera}>
          <span className={s.wide}>Câmera: </span>{CAMERA_LABEL[camera]}
        </button>
        <button type="button" className={s.btn} aria-label="Voz" aria-pressed={!!controls.voiceOn}
          disabled={!controls.onVoice || !controls.voiceAvailable}
          title={controls.voiceAvailable ? undefined : 'Seu navegador não tem voz disponível'} onClick={controls.onVoice}>
          {controls.voiceOn ? '🔊 Voz' : '🔇 Voz'}
        </button>
        {hasSources && (
          <button type="button" className={s.btn} aria-expanded={srcOpen} aria-controls="painel-fontes" onClick={() => setSrcOpen(!srcOpen)}>
            Fontes
          </button>
        )}
        <button type="button" className={`${s.btn} ${s.stop}`} aria-label="Encerrar debate" onClick={controls.onStop}>
          Encerrar
        </button>
      </div>

      {/* depois da barra no DOM: ao abrir "Fontes", o Tab seguinte cai nos links; posição visual vem do CSS */}
      {hasSources && srcOpen && (
        <div id="painel-fontes" className={`${s.panel} ${s.sources}`}>
          <Sources dossie={c?.dossie} extra={scene.extraSources} config={c} />
        </div>
      )}
    </div>
  );
}

function HoverCard({ scene, id }: { scene: SceneState; id: string }) {
  const c = scene.config;
  const looks = useMemo(() => looksFor(c?.seats ?? []), [c?.seats]);
  if (!c) return null;
  const seat = c.seats.find((x) => x.id === id);
  const stance = scene.members[id]?.stance ?? 0;
  const who = seat ?? c.moderador;
  const look = looks[id === MODERATOR_ID ? 'moderador' : id];
  return (
    <section className={`${s.panel} ${s.card}`} style={corStyle(scene, id)} aria-label={`Cartão de ${memberName(c, id)}`}>
      {look && <AvatarThumb look={look} size={56} />}
      <h2 className={s.name}>{memberName(c, id)}</h2>
      <div className={s.meta}>
        <div><b>{who.model}</b> · {PROVIDERS[who.provider].nome}</div>
        {seat ? (
          <div>{resolveTemperamento(seat.temperamento).nome} · {resolveExpertise(seat.expertise).nome}</div>
        ) : (
          id === MODERATOR_ID && <div>Provocação: {c.moderador.provocacao}</div>
        )}
        {seat && <div>Posição: {stance.toFixed(2)}</div>}
      </div>
      {seat && (
        <div className={s.meter} role="meter" aria-label="Posição" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={stance}>
          <div className={s.fill} style={{ background: stance >= 0 ? '#66bb6a' : '#ef5350', left: `${50 + Math.min(0, stance) * 50}%`, width: `${Math.abs(stance) * 50}%` }} />
        </div>
      )}
    </section>
  );
}
