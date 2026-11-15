'use client';
import { useEffect, useRef, useState } from 'react';
import type { SceneState } from '@/scene/sceneReducer';
import { memberName } from '@/scene/names';
import { corStyle } from '@/scene/Hud';
import h from './Hud.module.css';
import s from './Transcript.module.css';
import o from './overlays.module.css';

export function Transcript({ scene }: { scene: SceneState }) {
  const [wantOpen, setOpen] = useState(false);
  const [errSeen, setErrSeen] = useState<string>();
  // o alerta de erro mora na gaveta: um erro novo a abre até o usuário fechar
  const open = wantOpen || (!!scene.error && scene.error !== errSeen);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [scene.transcript.length, scene.bubble, open]);
  const who = (id: string) => <strong className={h.name} style={corStyle(scene, id)}>{memberName(scene.config, id)}:</strong>;
  return (
    <>
      <button type="button" className={s.toggle} aria-expanded={open} aria-controls="transcricao" onClick={() => { setOpen(!open); setErrSeen(scene.error); }}>
        Transcrição
      </button>
      {/* alerta sempre montado: o anúncio não depende da gaveta estar aberta */}
      <p role="alert" className={o.sr}>{scene.error}</p>
      {open && (
        <aside id="transcricao" aria-label="Transcrição" className={s.drawer}>
          <h2>Transcrição</h2>
          {scene.summary && <p className={s.summary}>Resumo: {scene.summary}</p>}
          {scene.transcript.map((t, i) => (
            <p key={i}>{who(t.speaker)} {t.text}</p>
          ))}
          {scene.bubble && scene.speaker && <p className={s.muted}>{who(scene.speaker)} {scene.bubble}</p>}
          {scene.ended && (
            <section className={s.verdict}>
              <h3>Veredito</h3>
              <p>{scene.ended.verdict}</p>
            </section>
          )}
          {scene.error && <p className={s.error}>{scene.error}</p>}
          <div ref={end} />
        </aside>
      )}
    </>
  );
}
