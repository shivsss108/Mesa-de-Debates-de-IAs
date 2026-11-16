import { describe, expect, it } from 'vitest';
import { assignVoices, generoDoMembro, generoDoNome, voicesAvailable } from '@/voice/voice';

const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa'];
const members = nomes.map((nome, i) => ({ id: 'abcde'[i], nome }));

describe('assignVoices', () => {
  it('2 vozes pt-BR e 5 membros: todos pt-BR, pares (voz, pitch) distintos', () => {
    const out = assignVoices(members, [v('x', 'pt-BR'), v('en', 'en-US'), v('y', 'pt-BR')], 'pt-BR');
    expect(Object.keys(out)).toHaveLength(5);
    for (const p of Object.values(out)) expect(p.voice?.lang).toBe('pt-BR');
    const pairs = new Set(Object.values(out).map((p) => `${p.voice?.name}|${p.pitch}`));
    expect(pairs.size).toBe(5);
    for (const p of Object.values(out)) expect(p.pitch).toBeGreaterThanOrEqual(0.8), expect(p.pitch).toBeLessThanOrEqual(1.3);
  });
  it('havendo vozes neurais do idioma, usa só elas, a 1ª rodada sem mexer no pitch', () => {
    const voices = [v('Microsoft Maria', 'pt-BR'), v('Microsoft Francisca Online (Natural)', 'pt-BR'), v('Microsoft Antonio Online (Natural)', 'pt-BR')];
    const out = assignVoices(members, voices, 'pt-BR');
    for (const p of Object.values(out)) expect(p.voice?.name).toMatch(/Natural/);
    expect([out.a.pitch, out.b.pitch]).toEqual([1, 1]);
  });
  it('voz feminina só para mulheres, masculina só para homens (moderador incluso)', () => {
    const voices = [v('Microsoft Francisca Online (Natural)', 'pt-BR'), v('Microsoft Antonio Online (Natural)', 'pt-BR'), v('Microsoft Thalita Online (Natural)', 'pt-BR')];
    const out = assignVoices([...members, { id: 'moderador', nome: 'Moderador' }], voices, 'pt-BR');
    for (const id of ['a', 'c', 'e']) expect(out[id].voice?.name).toMatch(/Francisca|Thalita/);
    for (const id of ['b', 'd', 'moderador']) expect(out[id].voice?.name).toMatch(/Antonio/);
    // homens repetem a única voz masculina com pitch diferente, em vez de pegar uma feminina
    expect(new Set(['b', 'd', 'moderador'].map((id) => out[id].pitch)).size).toBe(3);
  });
  it('gênero vence a qualidade: homem fica com a voz masculina comum, não com a neural feminina', () => {
    const out = assignVoices(members, [v('Microsoft Francisca Online (Natural)', 'pt-BR'), v('Microsoft Daniel', 'pt-BR')], 'pt-BR');
    expect(out.b.voice?.name).toBe('Microsoft Daniel');
    expect(out.a.voice?.name).toMatch(/Francisca/);
  });
  it('sem vozes do idioma usa as disponíveis', () => {
    const out = assignVoices(members, [v('en', 'en-US')], 'pt-BR');
    expect(Object.values(out).every((p) => p.voice?.name === 'en')).toBe(true);
    expect(new Set(Object.values(out).map((p) => p.pitch)).size).toBe(5);
  });
});

describe('gênero pelo nome', () => {
  it('membros: lista conhecida, senão terminação em "a"', () => {
    expect(['Ana', 'Gabi', 'Inês', 'Paula Souza', 'Lia'].map(generoDoMembro)).toEqual(['f', 'f', 'f', 'f', 'f']);
    expect(['Bruno', 'Rafa', 'João', 'Otto', 'Moderador'].map(generoDoMembro)).toEqual(['m', 'm', 'm', 'm', 'm']);
  });
  it('vozes: "female" não casa com "male"; desconhecida fica indefinida', () => {
    expect(generoDoNome('Google UK English Female')).toBe('f');
    expect(generoDoNome('Google UK English Male')).toBe('m');
    expect(generoDoNome('Google português do Brasil')).toBeUndefined();
  });
});

describe('voicesAvailable', () => {
  it('false sem speechSynthesis', () => {
    expect(voicesAvailable()).toBe(false);
  });
});
