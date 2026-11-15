import { describe, expect, it } from 'vitest';
import { telaoLines } from '@/scene/telao';

const base = { tema: 'IA vai substituir programadores?', turno: 3, maxTurns: 20, elapsedMs: 0 };

describe('telaoLines', () => {
  it('tema longo: 2 linhas, cada ≤ 38, a última termina em "…"', () => {
    const tema = Array.from({ length: 60 }, (_, i) => `pal${i}`).join(' ').slice(0, 300);
    expect(tema).toHaveLength(300);
    const r = telaoLines({ ...base, tema });
    expect(r.tema).toHaveLength(2);
    for (const l of r.tema) expect(l.length).toBeLessThanOrEqual(38);
    expect(r.tema[1].endsWith('…')).toBe(true);
  });

  it('palavra única gigante também é cortada', () => {
    const r = telaoLines({ ...base, tema: 'x'.repeat(300) });
    expect(r.tema).toHaveLength(2);
    for (const l of r.tema) expect(l.length).toBeLessThanOrEqual(38);
    expect(r.tema[1].endsWith('…')).toBe(true);
  });

  it('tema curto: 1 linha', () => {
    expect(telaoLines(base).tema).toEqual(['IA vai substituir programadores?']);
  });

  it('relógio mm:ss', () => {
    expect(telaoLines({ ...base, elapsedMs: 65_000 }).relogio).toBe('01:05');
    expect(telaoLines(base).relogio).toBe('00:00');
  });

  it('status com e sem orador', () => {
    expect(telaoLines(base).status).toBe('Turno 3/20');
    expect(telaoLines({ ...base, turno: 7, orador: 'Ana' }).status).toBe('Turno 7/20 · fala: Ana');
  });
});
