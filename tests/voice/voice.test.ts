import { describe, expect, it } from 'vitest';
import { assignVoices, voicesAvailable } from '@/voice/voice';

const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
const ids = ['a', 'b', 'c', 'd', 'e'];

describe('assignVoices', () => {
  it('2 vozes pt-BR e 5 membros: todos pt-BR, pares (voz, pitch) distintos', () => {
    const out = assignVoices(ids, [v('x', 'pt-BR'), v('en', 'en-US'), v('y', 'pt-BR')], 'pt-BR');
    expect(Object.keys(out)).toHaveLength(5);
    for (const p of Object.values(out)) expect(p.voice?.lang).toBe('pt-BR');
    const pairs = new Set(Object.values(out).map((p) => `${p.voice?.name}|${p.pitch}`));
    expect(pairs.size).toBe(5);
    for (const p of Object.values(out)) expect(p.pitch).toBeGreaterThanOrEqual(0.8), expect(p.pitch).toBeLessThanOrEqual(1.3);
  });
  it('havendo vozes neurais do idioma, usa só elas, a 1ª rodada sem mexer no pitch', () => {
    const voices = [v('Microsoft Maria', 'pt-BR'), v('Microsoft Francisca Online (Natural)', 'pt-BR'), v('Microsoft Antonio Online (Natural)', 'pt-BR')];
    const out = assignVoices(ids, voices, 'pt-BR');
    for (const p of Object.values(out)) expect(p.voice?.name).toMatch(/Natural/);
    expect([out.a.pitch, out.b.pitch]).toEqual([1, 1]);
  });
  it('sem vozes do idioma usa as disponíveis', () => {
    const out = assignVoices(ids, [v('en', 'en-US')], 'pt-BR');
    expect(Object.values(out).every((p) => p.voice?.name === 'en')).toBe(true);
    expect(new Set(Object.values(out).map((p) => p.pitch)).size).toBe(5);
  });
});

describe('voicesAvailable', () => {
  it('false sem speechSynthesis', () => {
    expect(voicesAvailable()).toBe(false);
  });
});
