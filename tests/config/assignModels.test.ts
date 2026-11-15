import { describe, expect, it } from 'vitest';
import { bestOf, randomModels, rankVaried, variedBest } from '@/app/config/assignModels';
import type { CatalogModel } from '@/providers/catalog';
import type { DebateConfig, Seat } from '@/types';

const m = (provider: 'groq' | 'nvidia', id: string): CatalogModel => ({ provider, id, free: true });
const MODELS = [
  m('groq', 'llama-3.1-8b-instant'), m('groq', 'llama-3.3-70b-versatile'), m('groq', 'openai/gpt-oss-120b'),
  m('nvidia', 'meta/llama-3.1-405b-instruct'), m('nvidia', 'mistralai/mistral-7b-instruct'),
];
const seat = (i: number): Seat => ({ id: `m${i}`, nome: `S${i}`, provider: 'groq', model: '', temperamento: { presetId: '' }, expertise: { presetId: '' } });
const cfg: DebateConfig = { tema: 't', idioma: 'pt-BR', maxTurns: 20, moderador: { provider: 'groq', model: '', provocacao: 'media' }, seats: [1, 2, 3, 4].map(seat) };

describe('rankVaried', () => {
  it('alterna provedores, do melhor para o pior', () => {
    const r = rankVaried(MODELS).map((x) => x.provider);
    expect(r.slice(0, 4)).toEqual(['nvidia', 'groq', 'nvidia', 'groq']);
  });
});

describe('variedBest', () => {
  it('assentos com modelos fortes e distintos; moderador com o melhor', () => {
    const c = variedBest(cfg, MODELS);
    const ids = c.seats.map((s) => s.model);
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain('llama-3.1-8b-instant');
    expect(c.moderador).toMatchObject({ provider: 'nvidia', model: 'meta/llama-3.1-405b-instruct' });
  });
  it('sem modelos não muda nada', () => expect(variedBest(cfg, [])).toBe(cfg));
});

describe('randomModels', () => {
  it('sorteia do catálogo e mantém provedor coerente com o modelo', () => {
    let i = 0;
    const c = randomModels(cfg, MODELS, () => [0, 0.99, 0.5, 0.7][i++]);
    expect(c.seats.map((s) => `${s.provider}:${s.model}`)).toEqual([
      'groq:llama-3.1-8b-instant', 'nvidia:mistralai/mistral-7b-instruct', 'groq:openai/gpt-oss-120b', 'nvidia:meta/llama-3.1-405b-instruct',
    ]);
  });
});

describe('bestOf', () => {
  it('melhor do provedor', () => expect(bestOf(MODELS, 'groq')).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b' }));
});
