import { describe, expect, it } from 'vitest';
import { ProviderError, type ChatFn } from '@/providers/client';
import { ask, type LlmTarget } from '@/research/llm';
import { buildQueries } from '@/research/queries';
import { buildRecortes } from '@/research/recortes';
import type { Dossie, Seat } from '@/types';
import { fakeChat } from './helpers';

const target = (chat: ChatFn): LlmTarget => ({ chat, provider: 'groq', model: 'm', apiKey: 'k', sleep: async () => {} });

describe('ask', () => {
  it('concatena o stream e remove <think>', async () => {
    const { chat } = fakeChat([['<think>hm</think>', 'ola', ' mundo']]);
    expect(await ask(target(chat), [])).toBe('ola mundo');
  });
  it('401 vira Chave inválida', async () => {
    const { chat } = fakeChat([new ProviderError('x', 401)]);
    await expect(ask(target(chat), [])).rejects.toThrow('Chave inválida para Groq.');
  });
});

describe('buildQueries', () => {
  it('JSON com texto em volta', async () => {
    const { chat } = fakeChat(['claro: ```json\n["a","b"]\n```']);
    expect(await buildQueries('tema', 'pt-BR', target(chat))).toEqual(['a', 'b']);
  });
  it('lixo ou erro → [tema]', async () => {
    expect(await buildQueries('tema', 'pt-BR', target(fakeChat(['blá']).chat))).toEqual(['tema']);
    expect(await buildQueries('tema', 'pt-BR', target(fakeChat([new ProviderError('x', 500)]).chat))).toEqual(['tema']);
  });
  it('401 propaga', async () => {
    const { chat } = fakeChat([new ProviderError('x', 401)]);
    await expect(buildQueries('tema', 'pt-BR', target(chat))).rejects.toThrow('Chave inválida');
  });
});

const dossie = {
  geradoEm: '2026-11-14', premissa: { status: 'confirmada', nota: 'ok' },
  fatos: [{ id: 'F1', texto: 'fato um', fontes: ['S1'] }], disputas: [], fontes: [], modo: 'recorte',
} as Dossie;
const seats = [
  { id: 'm1', nome: 'Ana', expertise: { presetId: 'cientista' } },
  { id: 'm2', nome: 'Bia', expertise: { custom: 'Jurista' } },
] as Seat[];

describe('buildRecortes', () => {
  it('mapeia só seatIds conhecidos, corta em 400', async () => {
    const { chat } = fakeChat([JSON.stringify({ m1: 'x'.repeat(500), m2: ' ', zz: 'y' })]);
    const r = await buildRecortes(dossie, seats, target(chat));
    expect(Object.keys(r)).toEqual(['m1']);
    expect(r.m1).toHaveLength(400);
  });
  it('falha → {}; 401 propaga', async () => {
    expect(await buildRecortes(dossie, seats, target(fakeChat(['lixo']).chat))).toEqual({});
    await expect(buildRecortes(dossie, seats, target(fakeChat([new ProviderError('x', 403)]).chat))).rejects.toThrow('Chave inválida');
  });
});
