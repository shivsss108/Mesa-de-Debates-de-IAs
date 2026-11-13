'use client';
import { useEffect, useRef, useState } from 'react';
import type { SceneState } from '@/scene/sceneReducer';
import { memberName } from '@/scene/names';

export function Transcript({ scene }: { scene: SceneState }) {
  const [open, setOpen] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [scene.transcript.length, scene.bubble, open]);
  return (
    <aside style={{ position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', pointerEvents: 'none' }}>
      <button
        type="button"
        aria-label={open ? 'Recolher transcrição' : 'Abrir transcrição'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ pointerEvents: 'auto', alignSelf: 'center', ...btn }}
      >
        {open ? '›' : '‹'}
      </button>
      {open && (
        <div style={{ pointerEvents: 'auto', width: 320, overflowY: 'auto', padding: 12, background: 'rgba(5,20,22,.85)', color: '#e8f1f1', fontSize: 13 }}>
          <h2 style={{ fontSize: 14, margin: '0 0 8px' }}>Transcrição</h2>
          {scene.summary && <p style={{ opacity: 0.7, fontStyle: 'italic' }}>Resumo: {scene.summary}</p>}
          {scene.transcript.map((t, i) => (
            <p key={i} style={{ margin: '0 0 8px' }}>
              <strong>{memberName(scene.config, t.speaker)}:</strong> {t.text}
            </p>
          ))}
          {scene.bubble && scene.speaker && (
            <p style={{ opacity: 0.7 }}>
              <strong>{memberName(scene.config, scene.speaker)}:</strong> {scene.bubble}
            </p>
          )}
          {scene.ended && (
            <section style={{ borderTop: '1px solid #fff4', paddingTop: 8 }}>
              <h3 style={{ fontSize: 13 }}>Veredito</h3>
              <p>{scene.ended.verdict}</p>
            </section>
          )}
          {scene.error && <p role="alert" style={{ color: '#ff8a80' }}>{scene.error}</p>}
          <div ref={end} />
        </div>
      )}
    </aside>
  );
}

const btn: React.CSSProperties = {
  background: 'rgba(5,20,22,.85)', color: '#e8f1f1', border: '1px solid #fff4', borderRadius: 6, padding: '8px 6px', cursor: 'pointer',
};
