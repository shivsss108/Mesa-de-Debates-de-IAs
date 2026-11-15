import { describe, expect, it } from 'vitest';
import { validateDossie } from '@/engine/validate';
import { runResearch, parseResearchBody, type Progress, type ResearchInput } from '@/research/pipeline';
import type { NewsItem } from '@/research/search';
import type { LlmTarget } from '@/research/llm';
import { fakeChat } from './helpers';

const NOW = Date.UTC(2026, 10, 14, 15);
const base: ResearchInput = {
  tema: 'tema', idioma: 'pt-BR', moderador: { provider: 'groq', model: 'm' }, busca: false, links: [], textos: [], modo: 'todos',
};
const mk = (chat: LlmTarget['chat']): LlmTarget => ({ chat, provider: 'groq', model: 'm', apiKey: 'k', sleep: async () => {} });
const synth = (fontes: string[]) =>
  JSON.stringify({ premissa: { status: 'confirmada', nota: 'ok' }, fatos: [{ texto: 'f', fontes }], disputas: [] });
const news = (n: number): NewsItem[] =>
  Array.from({ length: n }, (_, i) => ({ titulo: `N${i + 1}`, resumo: `resumo ${i + 1}`, veiculo: `V${i + 1}`, url: `https://s${i + 1}.com/a`, data: '2026-11-01' }));
const run = (input: ResearchInput, chat: LlmTarget['chat'], deps: Record<string, unknown> = {}) => {
  const progress: Progress[] = [];
  const p = runResearch(input, { t: mk(chat), now: () => NOW, ...deps }, (x) => progress.push(x));
  return { p, progress };
};

describe('runResearch', () => {
  it('sem busca, 1 texto → fonte texto, geradoEm da now()', async () => {
    const { chat } = fakeChat([synth(['S1'])]);
    const { p } = run({ ...base, textos: [{ nome: 'nota', conteudo: 'abc' }] }, chat);
    const d = await p;
    expect(d.fontes).toEqual([{ id: 'S1', titulo: 'nota', origem: 'texto' }]);
    expect(d.geradoEm).toBe('2026-11-14');
    expect(d.modo).toBe('todos');
    expect(d).not.toHaveProperty('recortes');
    expect(validateDossie(d)).toBeNull();
  });
  it('arquivo quando o nome tem extensão', async () => {
    const d = await run({ ...base, textos: [{ nome: 'a.pdf', conteudo: 'x' }] }, fakeChat([synth(['S1'])]).chat).p;
    expect(d.fontes[0].origem).toBe('arquivo');
  });
  it('6 resultados, 2 leituras falham → resumo do RSS e progresso 4/6', async () => {
    const { chat } = fakeChat(['["q1","q2"]', synth(['S1'])]);
    const read = async (u: string) => (u.includes('s2.') || u.includes('s5.') ? undefined : 'texto ' + u);
    const { p, progress } = run({ ...base, busca: true }, chat, { search: async () => news(6), read });
    const d = await p;
    expect(progress).toContainEqual({ etapa: 'lendo', detalhe: 'V6', lidas: 4, total: 6 });
    expect(progress).toContainEqual({ etapa: 'lendo', detalhe: 'V1', lidas: 1, total: 6 });
    expect(progress.at(-1)?.etapa).toBe('sintetizando');
    expect(d.fontes).toHaveLength(6);
    expect(d.fontes[1]).toEqual({ id: 'S2', titulo: 'N2', veiculo: 'V2', url: 'https://s2.com/a', data: '2026-11-01', origem: 'web' });
    expect(validateDossie(d)).toBeNull();
  });
  it('leitura curta (paywall) não vence o resumo do RSS; leitura longa vence', async () => {
    const f = fakeChat(['["q1","q2"]', synth(['S1'])]);
    const read = async (u: string) => (u.includes('s1.') ? 'Assine' : 'longo '.repeat(100));
    await run({ ...base, busca: true }, f.chat, { search: async () => news(2), read }).p;
    const prompt = f.calls[1].messages[1].content;
    expect(prompt).toContain('resumo 1');
    expect(prompt).not.toContain('Assine');
    expect(prompt).toContain('longo longo');
  });
  it('estouro do orçamento na síntese → fallback, sem lançar; abort do chamador ainda lança', async () => {
    const hang: LlmTarget['chat'] = async function* (req) {
      await new Promise((_, rej) => {
        if (req.signal?.aborted) rej(new Error('abortado'));
        req.signal?.addEventListener('abort', () => rej(new Error('abortado')));
      });
      yield '';
    };
    const d = await run({ ...base, textos: [{ nome: 'nota', conteudo: 'abc' }] }, hang, { budgetMs: 20 }).p;
    expect(d.premissa.status).toBe('nao_encontrada');
    expect(d.fatos).toEqual([{ id: 'F1', texto: 'abc', fontes: ['S1'] }]);
    const ac = new AbortController();
    const p = runResearch({ ...base, textos: [{ nome: 'nota', conteudo: 'abc' }] }, { t: { ...mk(hang), signal: ac.signal }, now: () => NOW }, () => {});
    ac.abort();
    await expect(p).rejects.toThrow();
  });
  it('geradoEm usa a data de São Paulo', async () => {
    const d = await run({ ...base, textos: [{ nome: 'nota', conteudo: 'abc' }] }, fakeChat([synth(['S1'])]).chat, { now: () => Date.UTC(2026, 10, 15, 1, 30) }).p;
    expect(d.geradoEm).toBe('2026-11-14');
  });
  it('sem resultados e sem material → dossiê vazio sem sintetizar', async () => {
    const f = fakeChat(['["q1","q2"]']);
    const d = await run({ ...base, busca: true }, f.chat, { search: async () => [] }).p;
    expect(d.fontes).toEqual([]);
    expect(d.fatos).toEqual([]);
    expect(d.premissa).toEqual({ status: 'nao_encontrada', nota: 'Nenhuma fonte encontrada sobre o tema.' });
    expect(f.calls).toHaveLength(1);
    expect(validateDossie(d)).toBeNull();
  });
  it('as duas buscas rejeitam → zero resultados, sem lançar', async () => {
    const d = await run({ ...base, busca: true }, fakeChat(['["q1","q2"]']).chat, { search: async () => { throw new Error('dns'); } }).p;
    expect(d.fontes).toEqual([]);
  });
  it('leitura lenta além do deadline → usa o resumo e sintetiza', async () => {
    const read = (u: string) => (u.includes('s1.') ? Promise.resolve('lido') : new Promise<string | undefined>(() => {}));
    const { p } = run({ ...base, busca: true }, fakeChat(['["q"]', synth(['S1'])]).chat, { search: async () => news(3), read, deadlineMs: 30 });
    const d = await p;
    expect(d.fontes.map((f) => f.id)).toEqual(['S1', 'S2', 'S3']);
  });
  it('links lidos com origem link (falha é descartada); ordem links, textos, web; textos truncados', async () => {
    const f = fakeChat(['["q"]', synth(['S1'])]);
    const read = async (u: string) => (u.includes('ruim') ? undefined : 'corpo');
    const d = await run(
      { ...base, busca: true, links: ['https://ruim.com/x', 'https://bom.com/x'], textos: [{ nome: 'a', conteudo: 'a'.repeat(7000) }, { nome: 'b', conteudo: 'b'.repeat(7000) }, { nome: 'c', conteudo: 'c'.repeat(7000) }, { nome: 'd', conteudo: 'd'.repeat(7000) }] },
      f.chat, { search: async () => news(1), read },
    ).p;
    expect(d.fontes.map((x) => [x.id, x.titulo, x.origem])).toEqual([
      ['S1', 'bom.com', 'link'], ['S2', 'a', 'texto'], ['S3', 'b', 'texto'], ['S4', 'c', 'texto'], ['S5', 'd', 'texto'], ['S6', 'N1', 'web'],
    ]);
    const prompt = f.calls[1].messages[1].content;
    expect(prompt).not.toContain('a'.repeat(6001));
    expect(prompt).toContain('d'.repeat(2000));
    expect(prompt).not.toContain('d'.repeat(2001));
  });
  it('no máximo 12 fontes', async () => {
    const d = await run({ ...base, textos: Array.from({ length: 15 }, (_, i) => ({ nome: 'n' + i, conteudo: 'x' })) }, fakeChat([synth(['S1'])]).chat).p;
    expect(d.fontes).toHaveLength(12);
  });
  it('erro de chave sobe', async () => {
    const { chat } = fakeChat([new Error('Chave inválida para Groq.')]);
    await expect(run({ ...base, busca: true }, chat, { search: async () => [] }).p).rejects.toThrow('Chave inválida para Groq.');
  });
});

describe('tamanho do dossiê', () => {
  it('12 fontes longas + 12 fatos cabem em 8 KB (descarta fontes e fatos órfãos)', async () => {
    const items: NewsItem[] = Array.from({ length: 12 }, (_, i) => ({
      titulo: 'T'.repeat(300), resumo: 'r' + i, veiculo: 'V' + i, url: `https://s${i}.com/${'p'.repeat(340)}`, data: '2026-11-01',
    }));
    const out = JSON.stringify({
      premissa: { status: 'confirmada', nota: 'n'.repeat(300) },
      fatos: Array.from({ length: 12 }, (_, i) => ({ texto: 'f'.repeat(300), fontes: [`S${i + 1}`] })),
      disputas: Array.from({ length: 5 }, () => 'd'.repeat(200)),
    });
    const d = await run({ ...base, busca: true }, fakeChat(['["q"]', out]).chat, { search: async () => items, read: async () => undefined, now: () => NOW }).p;
    expect(validateDossie(d)).toBeNull();
    expect(d.fontes.length).toBeGreaterThan(0);
    expect(d.fontes.every((f) => f.titulo.length <= 120)).toBe(true);
    const ids = new Set(d.fontes.map((f) => f.id));
    expect(d.fatos.every((f) => f.fontes.length && f.fontes.every((x) => ids.has(x)))).toBe(true);
  });
});

describe('parseResearchBody', () => {
  const ok = { ...base, keys: {} };
  it('aceita corpo válido', () => expect(parseResearchBody(ok)).toMatchObject({ ok: true }));
  it.each([
    ['tema vazio', { ...ok, tema: ' ' }],
    ['tema longo', { ...ok, tema: 'x'.repeat(301) }],
    ['6 links', { ...ok, links: Array(6).fill('https://a.com') }],
    ['link não string', { ...ok, links: [1] }],
    ['texto inválido', { ...ok, textos: [{ nome: 'a' }] }],
    ['busca não booleana', { ...ok, busca: 'sim' }],
    ['11 textos', { ...ok, textos: Array(11).fill({ nome: 'a', conteudo: 'x' }) }],
    ['nome longo', { ...ok, textos: [{ nome: 'n'.repeat(201), conteudo: 'x' }] }],
    ['texto total enorme', { ...ok, textos: Array(5).fill({ nome: 'a', conteudo: 'x'.repeat(40_001) }) }],
    ['modo ruim', { ...ok, modo: 'x' }],
    ['provedor desconhecido', { ...ok, moderador: { provider: 'zzz', model: 'm' } }],
    ['modelo vazio', { ...ok, moderador: { provider: 'groq', model: '' } }],
  ])('rejeita %s', (_n, b) => expect(parseResearchBody(b)).toMatchObject({ ok: false }));
});
