'use client';
import type { DebateEvent } from '@/types';
import type { SceneState } from '@/scene/sceneReducer';

const list: React.CSSProperties = { margin: '4px 0 12px', paddingLeft: 20 };
const btn: React.CSSProperties = { font: 'inherit', fontWeight: 600, padding: '10px 18px', borderRadius: 999, cursor: 'pointer', border: '1px solid #f0b45e' };

export function EndPanel({ scene, events, onNew }: { scene: SceneState; events: DebateEvent[]; onNew: () => void }) {
  const end = scene.ended;
  if (!end) return null;

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
    <div role="dialog" aria-label="Fim do debate" style={{ position: 'fixed', inset: 0, zIndex: 10, display: 'grid', placeItems: 'center', background: 'rgba(5,20,22,.6)', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', background: '#0b1f22', color: '#e8f1f1', border: '1px solid #fff3', borderRadius: 16, padding: 24, fontSize: 14, lineHeight: 1.5 }}>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>Fim do debate</h2>
        <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f0b45e' }}>Resumo</h3>
        <p style={{ marginBottom: 12 }}>{end.summary}</p>
        <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f0b45e' }}>Consensos</h3>
        <ul style={list}>{end.consensus.length ? end.consensus.map((c, i) => <li key={i}>{c}</li>) : <li>Nenhum consenso claro.</li>}</ul>
        <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f0b45e' }}>Pontos em aberto</h3>
        <ul style={list}>{end.openPoints.length ? end.openPoints.map((c, i) => <li key={i}>{c}</li>) : <li>Nenhum.</li>}</ul>
        <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.1em', color: '#f0b45e' }}>Veredito</h3>
        <p style={{ marginBottom: 18 }}>{end.verdict}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={download} style={{ ...btn, background: '#d9953f', color: '#1c1306' }}>Baixar debate</button>
          <button type="button" onClick={onNew} style={{ ...btn, background: 'transparent', color: '#e8f1f1', borderColor: '#fff4' }}>Nova mesa</button>
        </div>
      </div>
    </div>
  );
}
