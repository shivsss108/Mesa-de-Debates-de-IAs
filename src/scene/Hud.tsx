'use client';
import { useState } from 'react';
import { MODERATOR_ID } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';
import { memberName } from '@/scene/names';
import { CAMERA_LABEL, type CameraMode } from '@/scene/Cameras';
import { PROVIDERS } from '@/providers/table';
import { resolveTemperamento } from '@/presets/temperamentos';
import { resolveExpertise } from '@/presets/expertises';

export interface StageControls {
  pause: (p: boolean) => void;
  speed: number;
  setSpeed: (n: 1 | 1.5 | 2) => void;
  onStop: () => void;
  /** botão de voz; desabilitado sem handler ou sem vozes no navegador */
  onVoice?: () => void;
  voiceOn?: boolean;
  voiceAvailable?: boolean;
}

const panel: React.CSSProperties = { background: 'rgba(5,20,22,.85)', color: '#e8f1f1', borderRadius: 8, padding: '8px 12px', fontSize: 13 };
const btn: React.CSSProperties = { background: '#16393d', color: '#e8f1f1', border: '1px solid #fff4', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' };
const SPEEDS = [1, 1.5, 2] as const;

export function Hud({ scene, controls, camera, onCamera, hovered }: {
  scene: SceneState; controls: StageControls; camera: CameraMode; onCamera: () => void; hovered?: string;
}) {
  const [paused, setPaused] = useState(false);
  const c = scene.config;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ ...panel, position: 'absolute', top: 12, left: 12, maxWidth: 360 }}>
        <strong>{c?.tema ?? 'Carregando…'}</strong>
        <div>Turno {scene.memberTurns}/{c?.maxTurns ?? '–'}</div>
        {scene.hands.length > 0 && (
          <ul aria-label="Fila de mãos levantadas" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {scene.hands.map((h) => (
              <li key={h.member}>✋ {memberName(c, h.member)} — {h.reason}</li>
            ))}
          </ul>
        )}
      </div>

      {hovered && <HoverCard scene={scene} id={hovered} />}

      <div style={{ ...panel, position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'auto' }}>
        <button type="button" style={btn} aria-label={paused ? 'Retomar debate' : 'Pausar debate'}
          onClick={() => { controls.pause(!paused); setPaused(!paused); }}>
          {paused ? '▶ Retomar' : '⏸ Pausar'}
        </button>
        {SPEEDS.map((s) => (
          <button key={s} type="button" aria-label={`Velocidade ${s}x`} aria-pressed={controls.speed === s}
            style={{ ...btn, ...(controls.speed === s ? { background: '#b5762f' } : {}) }} onClick={() => controls.setSpeed(s)}>
            {s}×
          </button>
        ))}
        <button type="button" style={btn} aria-label="Alternar câmera (tecla C)" onClick={onCamera}>
          Câmera: {CAMERA_LABEL[camera]}
        </button>
        <button type="button" aria-label="Voz" aria-pressed={!!controls.voiceOn}
          style={{ ...btn, ...(controls.voiceOn ? { background: '#b5762f' } : {}), opacity: controls.voiceAvailable ? 1 : 0.5 }}
          disabled={!controls.onVoice || !controls.voiceAvailable}
          title={controls.voiceAvailable ? undefined : 'Seu navegador não tem voz disponível'} onClick={controls.onVoice}>
          {controls.voiceOn ? '🔊 Voz: ligada' : '🔇 Voz'}
        </button>
        <button type="button" style={{ ...btn, background: '#7a2323' }} aria-label="Encerrar debate" onClick={controls.onStop}>
          Encerrar
        </button>
      </div>
    </div>
  );
}

function HoverCard({ scene, id }: { scene: SceneState; id: string }) {
  const c = scene.config;
  if (!c) return null;
  const seat = c.seats.find((s) => s.id === id);
  const stance = scene.members[id]?.stance ?? 0;
  const who = seat ?? c.moderador;
  return (
    <div style={{ ...panel, position: 'absolute', bottom: 80, left: 12, width: 260 }}>
      <strong>{memberName(c, id)}</strong>
      <div>Modelo: {who.model}</div>
      <div>Provedor: {PROVIDERS[who.provider].nome}</div>
      {seat ? (
        <>
          <div>Temperamento: {resolveTemperamento(seat.temperamento).nome}</div>
          <div>Expertise: {resolveExpertise(seat.expertise).nome}</div>
          <div style={{ marginTop: 6 }}>Posição: {stance.toFixed(2)}</div>
          <div role="meter" aria-label="Posição" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={stance}
            style={{ position: 'relative', height: 8, background: '#fff3', borderRadius: 4 }}>
            <div style={{ position: 'absolute', left: '50%', width: 1, top: 0, bottom: 0, background: '#fff' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 4, background: stance >= 0 ? '#66bb6a' : '#ef5350',
              left: `${50 + Math.min(0, stance) * 50}%`, width: `${Math.abs(stance) * 50}%` }} />
          </div>
        </>
      ) : (
        id === MODERATOR_ID && <div>Provocação: {c.moderador.provocacao}</div>
      )}
    </div>
  );
}
