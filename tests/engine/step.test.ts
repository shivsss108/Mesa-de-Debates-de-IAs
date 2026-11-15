import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runStep, BACKOFF_MS, SUMMARY_EVERY, type StepDeps } from '@/engine/step';
import { createInitialState } from '@/engine/initialState';
import { ProviderError, type ChatFn, type ChatMessage } from '@/providers/client';
import type { DebateConfig, DebateEvent, DebateState, Seat } from '@/types';

const KEYS = { groq: 'gsk-SECRET-123', mistral: 'mi-SECRET-456' };

const seat = (id: string, model: string, temperamento: string): Seat => ({
  id, nome: id.toUpperCase(), provider: 'groq', model, temperamento: { presetId: temperamento }, expertise: { custom: '' },
});
const cfg: DebateConfig = {
  tema: 'IA no trabalho', idioma: 'pt-BR', maxTurns: 20,
  moderador: { provider: 'mistral', model: 'mod', provocacao: 'media' },
  seats: [seat('m1', 'g1', 'cetico'), seat('m2', 'g2', 'explosivo')],
};

type Item = string | string[] | Error;
/** Fila roteirizada por "provider:model"; registra as mensagens de cada chamada. */
function fakeChat(script: Record<string, Item[]>) {
  const calls: { route: string; messages: ChatMessage[]; apiKey: string; maxTokens?: number }[] = [];
  const chat: ChatFn = async function* (req) {
    const route = `${req.provider}:${req.model}`;
    calls.push({ route, messages: req.messages, apiKey: req.apiKey, maxTokens: req.maxTokens });
    const item = script[route]?.shift();
    if (item === undefined) throw new Error(`sem roteiro para ${route}`);
    if (item instanceof Error) throw item;
    for (const c of Array.isArray(item) ? item : [item]) yield c;
  };
  return { chat, calls };
}

function makeDeps(chat: ChatFn, over: Partial<StepDeps> = {}) {
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const deps: StepDeps = {
    chat,
    keys: KEYS,
    // avança 10s a cada leitura: o rate gate nunca espera (salvo nos testes que trocam `now`)
    now: () => (clock += 10_000),
    sleep: async (ms) => void sleeps.push(ms),
    ...over,
  };
  return { deps, sleeps };
}

async function run(config: DebateConfig, state: DebateState, deps: StepDeps, seqStart = 0) {
  const events: DebateEvent[] = [];
  const gen = runStep(config, state, deps, seqStart);
  for (;;) {
    const r = await gen.next();
    if (r.done) return { events, state: r.value };
    events.push(r.value);
  }
}

const decision = (o: object) => JSON.stringify(o);
const types = (evs: DebateEvent[]) => evs.map((e) => e.type);
const fresh = () => createInitialState(cfg, 1_000_000);
const withTurns = (n: number, over: Partial<DebateState> = {}): DebateState => ({
  ...fresh(),
  memberTurns: n,
  history: [{ speaker: 'm2', text: 'algo' }],
  ...over,
});

beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('MISTRAL_API_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('runStep', () => {
  it('passo feliz: ordem dos eventos, seq, t e estado', async () => {
    const { chat } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: 'M1, comece.' })],
      'groq:g1': [['[duvida|apontar|alvo:M2|posição:-0,5] ', 'Não ', 'concordo.']],
    });
    const { deps } = makeDeps(chat);
    const { events, state } = await run(cfg, fresh(), deps);
    expect(types(events)).toEqual([
      'debate_start', 'turn_start', 'token', 'turn_end',
      'status', 'turn_start', 'token', 'token', 'emotion', 'gesture', 'stance', 'turn_end', 'status', 'hands',
    ]);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i));
    expect(events.every((e) => e.t > 0)).toBe(true);
    expect(events[1]).toMatchObject({ type: 'turn_start', speaker: 'moderador', addressedTo: 'm1' });
    expect(events[2]).toMatchObject({ type: 'token', speaker: 'moderador', text: 'M1, comece.' });
    expect(events[4]).toMatchObject({ type: 'status', member: 'm1', state: 'pensando' });
    expect(events[5]).toMatchObject({ type: 'turn_start', speaker: 'm1', addressedTo: 'moderador' });
    const tokens = events.filter((e) => e.type === 'token' && e.speaker === 'm1').map((e) => (e as { text: string }).text);
    expect(tokens.join('')).toBe('Não concordo.');
    expect(events[8]).toMatchObject({ emotion: 'duvida' });
    expect(events[9]).toMatchObject({ gesture: 'apontar' });
    expect(events[10]).toMatchObject({ member: 'm1', value: -0.5 });
    expect(events[11]).toMatchObject({ type: 'turn_end', speaker: 'm1', fullText: 'Não concordo.' });
    expect(events[12]).toMatchObject({ state: 'ok' });
    expect(events[13]).toMatchObject({ type: 'hands', queue: [{ member: 'm2' }] });
    expect(state.memberTurns).toBe(1);
    expect(state.history).toEqual([
      { speaker: 'moderador', text: 'M1, comece.' },
      { speaker: 'm1', text: 'Não concordo.' },
    ]);
    expect(state.stances.m1).toBe(-0.5);
    expect(state.lastSpokeTurn.m1).toBe(1);
    expect(state.failures.m1).toBe(0);
    expect(state.hands).toEqual((events[13] as { queue: unknown }).queue);
    expect(state.done).toBe(false);
  });

  it('seqStart > 0 → sem debate_start; seq continua de seqStart', async () => {
    const { chat } = fakeChat({ 'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })], 'groq:g1': ['Oi.'] });
    const { events } = await run(cfg, fresh(), makeDeps(chat).deps, 10);
    expect(types(events)).not.toContain('debate_start');
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => 10 + i));
  });

  it('maxTokens: folga para modelos de raciocínio (1500)', async () => {
    const { chat, calls } = fakeChat({ 'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })], 'groq:g1': ['Oi.'] });
    await run(cfg, fresh(), makeDeps(chat).deps);
    expect(calls.map((c) => [c.route, c.maxTokens])).toEqual([['mistral:mod', 1500], ['groq:g1', 1500]]);
  });

  it('<think> do membro não vai para o balão nem para o texto final', async () => {
    const { chat } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })],
      'groq:g1': [['<think>vou ', 'discordar</think>', '[raiva] ', 'Não!']],
    });
    const { events } = await run(cfg, fresh(), makeDeps(chat).deps);
    const tokens = events.filter((e) => e.type === 'token' && e.speaker === 'm1').map((e) => (e as { text: string }).text);
    expect(tokens.join('')).toBe('Não!');
    expect(events.find((e) => e.type === 'emotion')).toMatchObject({ emotion: 'raiva' });
  });

  it('erro 400 (modelo que não conversa) → sem retry; sem_sinal traz o motivo', async () => {
    const { chat, calls } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })],
      'groq:g1': [new ProviderError('HTTP 400: model does not support chat', 400), 'nunca'],
    });
    const { deps, sleeps } = makeDeps(chat);
    const { events } = await run(cfg, fresh(), deps);
    expect(calls.filter((c) => c.route === 'groq:g1')).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(events.find((e) => e.type === 'status' && e.state === 'sem_sinal')).toMatchObject({ reason: 'HTTP 400: model does not support chat' });
  });

  it('resposta vazia 3× → sem_sinal com motivo "resposta vazia do modelo"', async () => {
    const { chat } = fakeChat({ 'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })], 'groq:g1': ['', '', ''] });
    const { events } = await run(cfg, fresh(), makeDeps(chat).deps);
    expect(events.find((e) => e.type === 'status' && e.state === 'sem_sinal')).toMatchObject({ reason: 'resposta vazia do modelo' });
  });

  it('401 num membro → error com o nome do provedor e done, sem retry nem backoff', async () => {
    const { chat, calls } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })],
      'groq:g1': [new ProviderError('HTTP 401: bad key', 401), 'nunca'],
    });
    const { deps, sleeps } = makeDeps(chat);
    const { events, state } = await run(cfg, fresh(), deps);
    expect(calls.filter((c) => c.route === 'groq:g1')).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'Chave inválida para Groq.' });
    expect(state.done).toBe(true);
  });

  it('403 no moderador → error com o nome do provedor e done', async () => {
    const { chat, calls } = fakeChat({ 'mistral:mod': [new ProviderError('HTTP 403', 403)] });
    const { deps, sleeps } = makeDeps(chat);
    const { events, state } = await run(cfg, fresh(), deps);
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'Chave inválida para Mistral.' });
    expect(state.done).toBe(true);
  });

  it('todos os membros falham → error e done em até seats.length passos', async () => {
    const pass = () => decision({ acao: 'passar_palavra', fala: '' });
    const err = () => new Error('HTTP 500');
    const { chat } = fakeChat({
      'mistral:mod': Array.from({ length: 10 }, pass),
      'groq:g1': Array.from({ length: 10 }, err),
      'groq:g2': Array.from({ length: 10 }, err),
    });
    const { deps } = makeDeps(chat);
    let state = fresh();
    let all: DebateEvent[] = [];
    let steps = 0;
    while (!state.done && steps < 10) {
      const r = await run(cfg, state, deps, all.length);
      all = all.concat(r.events);
      state = r.state;
      steps++;
    }
    expect(steps).toBeLessThanOrEqual(cfg.seats.length);
    expect(state.done).toBe(true);
    expect(all.at(-1)).toMatchObject({ type: 'error', message: 'Nenhum membro conseguiu falar. Verifique as chaves e os modelos.' });
    expect(types(all).filter((t) => t === 'debate_start')).toHaveLength(1);
  });

  it('turno com sucesso zera stalledSteps; estado sem o campo conta como 0', async () => {
    const { chat } = fakeChat({ 'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })], 'groq:g1': ['Oi.'] });
    const { state } = await run(cfg, { ...fresh(), stalledSteps: 1 }, makeDeps(chat).deps);
    expect(state.stalledSteps).toBe(0);
    const legacy = fresh() as Partial<DebateState>;
    delete legacy.stalledSteps;
    const f = fakeChat({ 'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })], 'groq:g1': [new Error('x'), new Error('x'), new Error('x')] });
    const r = await run(cfg, legacy as DebateState, makeDeps(f.chat).deps);
    expect(r.state.stalledSteps).toBe(1);
    expect(r.state.done).toBe(false);
  });

  it('não muta o estado de entrada', async () => {
    const { chat } = fakeChat({ 'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })], 'groq:g1': ['oi'] });
    const s0 = fresh();
    const copy = structuredClone(s0);
    await run(cfg, s0, makeDeps(chat).deps);
    expect(s0).toEqual(copy);
  });

  it('sem tag → emoção padrão do temperamento, sem gesture/stance; sem fala do moderador', async () => {
    const { chat } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })],
      'groq:g1': ['  Só texto.'],
    });
    const { events } = await run(cfg, fresh(), makeDeps(chat).deps);
    expect(types(events)).toEqual(['debate_start', 'status', 'turn_start', 'token', 'emotion', 'turn_end', 'status', 'hands']);
    expect(events[2]).not.toHaveProperty('addressedTo');
    expect(events[3]).toMatchObject({ text: 'Só texto.' });
    expect(events[4]).toMatchObject({ emotion: 'duvida' });
  });

  it('resposta só com a tag conta como falha e é refeita', async () => {
    const { chat } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })],
      'groq:g1': ['[feliz]', '[feliz] Agora sim.'],
    });
    const { deps, sleeps } = makeDeps(chat);
    const { events, state } = await run(cfg, fresh(), deps);
    expect(sleeps).toEqual([BACKOFF_MS[0]]);
    expect(events.filter((e) => e.type === 'turn_start')).toHaveLength(1);
    expect(events.find((e) => e.type === 'turn_end')).toMatchObject({ fullText: 'Agora sim.' });
    expect(state.memberTurns).toBe(1);
  });

  it('3 falhas → sem_sinal, offline, backoff 1s/2s/4s, sem turn_start', async () => {
    const { chat } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })],
      'groq:g1': [new Error('HTTP 429'), '[feliz]', '   '],
    });
    const { deps, sleeps } = makeDeps(chat);
    const { events, state } = await run(cfg, withTurns(4), deps);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(events.some((e) => e.type === 'turn_start')).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'status', member: 'm1', state: 'sem_sinal' });
    expect(state.offline).toEqual({ m1: 4 });
    expect(state.failures.m1).toBe(1);
    expect(state.memberTurns).toBe(4);
  });

  it('moderador devolve lixo duas vezes → fallback de rodízio, ainda há turno de membro', async () => {
    const { chat, calls } = fakeChat({ 'mistral:mod': ['lixo', 'mais lixo {'], 'groq:g1': ['[feliz] Oi.'] });
    const { events, state } = await run(cfg, fresh(), makeDeps(chat).deps);
    expect(state.moderatorFailures).toBe(1);
    expect(calls[1].messages.at(-1)).toEqual({ role: 'user', content: 'Responda somente o JSON.' });
    expect(events.some((e) => e.type === 'turn_start' && e.speaker === 'moderador')).toBe(false);
    expect(events.find((e) => e.type === 'turn_end')).toMatchObject({ speaker: 'm1', fullText: 'Oi.' });
  });

  it('moderador com erro 3× → fallback com backoff', async () => {
    const err = () => new Error('HTTP 500');
    const { chat } = fakeChat({ 'mistral:mod': [err(), err(), err()], 'groq:g1': ['Oi.'] });
    const { deps, sleeps } = makeDeps(chat);
    const { state } = await run(cfg, fresh(), deps);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(state.moderatorFailures).toBe(1);
    expect(state.memberTurns).toBe(1);
  });

  it("acao 'encerrar' → debate_end e done", async () => {
    const { chat } = fakeChat({
      'mistral:mod': [
        decision({ acao: 'encerrar', fala: '' }),
        decision({ summary: 'S', consensus: ['a'], openPoints: ['b'], verdict: 'V' }),
      ],
    });
    const { events, state } = await run(cfg, withTurns(3), makeDeps(chat).deps, 40);
    expect(types(events)).toEqual(['debate_end']);
    expect(events[0]).toMatchObject({ summary: 'S', consensus: ['a'], openPoints: ['b'], verdict: 'V' });
    expect(state.done).toBe(true);
  });

  it('memberTurns === maxTurns → só fechamento (fallback após lixo 2×)', async () => {
    const { chat, calls } = fakeChat({ 'mistral:mod': ['lixo', 'lixo'] });
    const { events, state } = await run(cfg, withTurns(20, { summary: 'resumo atual' }), makeDeps(chat).deps, 200);
    expect(calls).toHaveLength(2);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'debate_end', summary: 'resumo atual', consensus: [], openPoints: [], verdict: '' });
    expect(state.done).toBe(true);
  });

  it(`turno ${SUMMARY_EVERY} → summary_update; 'provocar' age como passar_palavra`, async () => {
    const { chat } = fakeChat({
      'mistral:mod': [decision({ acao: 'provocar', para: 'm2', fala: 'M2, cadê você?' }), 'Novo resumo.'],
      'groq:g2': ['[raiva] Aqui!'],
    });
    const { events, state } = await run(cfg, withTurns(SUMMARY_EVERY - 1), makeDeps(chat).deps);
    expect(events.find((e) => e.type === 'turn_end' && e.speaker === 'm2')).toMatchObject({ fullText: 'Aqui!' });
    expect(events.at(-1)).toEqual(expect.objectContaining({ type: 'summary_update', text: 'Novo resumo.' }));
    expect(state.summary).toBe('Novo resumo.');
  });

  it('rate gate por provedor, compartilhado entre assentos', async () => {
    let clock = 5_000;
    const { chat } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' }), decision({ acao: 'passar_palavra', para: 'm2', fala: '' })],
      'groq:g1': ['Um.'],
      'groq:g2': ['Dois.'],
    });
    const { deps, sleeps } = makeDeps(chat, { now: () => clock });
    const r1 = await run(cfg, createInitialState(cfg, 0), deps);
    expect(sleeps).toEqual([]);
    clock += 500;
    await run(cfg, r1.state, deps);
    // mistral: 1000 - 500; groq (m1 → m2): 2000 - 500
    expect(sleeps).toEqual([500, 1500]);
  });

  it('sem chave → error com o nome do provedor e done', async () => {
    const { chat } = fakeChat({ 'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })] });
    const { events, state } = await run(cfg, fresh(), makeDeps(chat, { keys: { mistral: KEYS.mistral } }).deps);
    const err = events.find((e) => e.type === 'error');
    expect(err && 'message' in err && err.message).toContain('Groq');
    expect(events.at(-1)).toBe(err);
    expect(state.done).toBe(true);
  });

  it('eventos nunca contêm a chave', async () => {
    const { chat, calls } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: 'Fale.' })],
      'groq:g1': [new Error('HTTP 401'), '[feliz] Ok.'],
    });
    const a = await run(cfg, fresh(), makeDeps(chat).deps);
    const b = await run(cfg, fresh(), makeDeps(fakeChat({}).chat, { keys: { groq: KEYS.groq } }).deps);
    expect(calls.map((c) => c.apiKey)).toEqual([KEYS.mistral, KEYS.groq, KEYS.groq]);
    const all = JSON.stringify([...a.events, ...b.events]);
    expect(all).not.toContain(KEYS.groq);
    expect(all).not.toContain(KEYS.mistral);
  });

  it('stream termina com [ sem fechar → texto sai como token final', async () => {
    const { chat } = fakeChat({
      'mistral:mod': [decision({ acao: 'passar_palavra', para: 'm1', fala: '' })],
      'groq:g1': [['[sem ', 'fechar']],
    });
    const { events } = await run(cfg, fresh(), makeDeps(chat).deps);
    const tokens = events.filter((e) => e.type === 'token').map((e) => (e as { text: string }).text);
    expect(tokens).toEqual(['[sem fechar']);
    expect(events.find((e) => e.type === 'turn_end')).toMatchObject({ fullText: '[sem fechar' });
  });

  it('abort no meio do passo: para sem emitir mais nada e não conta como falha', async () => {
    const ac = new AbortController();
    const chat: ChatFn = async function* (req) {
      if (req.provider === 'mistral') {
        yield decision({ acao: 'passar_palavra', para: 'm1', fala: 'Vai.' });
        return;
      }
      yield '[feliz] Come';
      ac.abort();
      throw new DOMException('aborted', 'AbortError');
    };
    const { deps, sleeps } = makeDeps(chat, { signal: ac.signal });
    const { events, state } = await run(cfg, fresh(), deps);
    expect(types(events)).toEqual(['debate_start', 'turn_start', 'token', 'turn_end', 'status', 'turn_start', 'token']);
    expect(sleeps).toEqual([]);
    expect(state.failures.m1 ?? 0).toBe(0);
    expect(state.offline).toEqual({});
    expect(state.memberTurns).toBe(0);
  });
});

describe('createInitialState', () => {
  it('estado zerado', () => {
    expect(createInitialState(cfg, 42)).toMatchObject({
      startedAt: 42, memberTurns: 0, summary: '', history: [], offline: {}, hands: [], lastCallAt: {}, done: false,
      moderatorFailures: 0, stalledSteps: 0,
    });
  });
});

describe('membros pesquisam', () => {
  const RULE = 'Se precisar de um fato que não está no repertório, responda APENAS [busca: <consulta curta>], sem a tag de emoção e sem mais nada.';
  const pesq: DebateConfig = {
    ...cfg,
    membrosPesquisam: true,
    dossie: {
      geradoEm: '2026-11-14', premissa: { status: 'confirmada', nota: 'ok' }, fatos: [], disputas: [], modo: 'todos',
      fontes: [{ id: 'S1', titulo: 'a', origem: 'web' }, { id: 'S3', titulo: 'b', origem: 'web' }],
    },
  };
  const mod = () => decision({ acao: 'passar_palavra', para: 'm1', fala: '' });
  const item = (titulo: string) => ({ titulo, resumo: 'r'.repeat(400), veiculo: 'V', url: 'https://x.test/' + titulo });
  const sys = (c: { messages: ChatMessage[] }) => c.messages.map((x) => x.content).join('\n');

  it('[busca: q] → research, busca, 2ª chamada sem a regra e com o repertório', async () => {
    const { chat, calls } = fakeChat({ 'mistral:mod': [mod()], 'groq:g1': [['[bus', 'ca: q] e mais'], '[feliz] Achei.'] });
    const search = vi.fn(async () => [item('T1'), item('T2')]);
    const { events, state } = await run(pesq, fresh(), makeDeps(chat, { search }).deps);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('q', 'pt-BR');
    const r = events.findIndex((e) => e.type === 'research');
    const ts = events.findIndex((e) => e.type === 'turn_start' && e.speaker === 'm1');
    expect(events[r]).toEqual(expect.objectContaining({ type: 'research', member: 'm1', query: 'q' }));
    expect(events[r]).not.toHaveProperty('fontes');
    expect(events[r + 1]).toMatchObject({ type: 'research', member: 'm1', query: 'q', fontes: [{ id: 'S4' }, { id: 'S5' }] });
    expect(r + 1).toBeLessThan(ts);
    expect(events.some((e) => e.type === 'token' && e.text.includes('[busca'))).toBe(false);
    expect(events.find((e) => e.type === 'turn_end' && e.speaker === 'm1')).toMatchObject({ fullText: 'Achei.' });
    const member = calls.filter((c) => c.route === 'groq:g1');
    expect(member).toHaveLength(2);
    expect(sys(member[0])).toContain(RULE);
    expect(sys(member[1])).not.toContain(RULE);
    expect(sys(member[1])).toContain('Pesquisado durante o debate:');
    expect(sys(member[1])).toContain('T1 — ' + 'r'.repeat(300));
    expect(state.buscasFeitas).toBe(1);
    expect(state.repertorioExtra.fontes).toHaveLength(2);
    expect(state.repertorioExtra.fontes[0]).toEqual({
      id: 'S4', titulo: 'T1', resumo: 'r'.repeat(300), veiculo: 'V', url: 'https://x.test/T1', origem: 'membro', porMembro: 'm1',
    });
  });

  it('ids seguem o repertório extra já existente', async () => {
    const { chat } = fakeChat({ 'mistral:mod': [mod()], 'groq:g1': ['[busca: q]', 'Ok.'] });
    const st0 = { ...fresh(), buscasFeitas: 2, repertorioExtra: { fontes: [{ id: 'S9', titulo: 'x', origem: 'membro' as const, porMembro: 'm2' }] } };
    const { state } = await run(pesq, st0, makeDeps(chat, { search: async () => [item('T')] }).deps);
    expect(state.repertorioExtra.fontes.map((f) => f.id)).toEqual(['S9', 'S10']);
    expect(state.buscasFeitas).toBe(3);
  });

  it('2ª resposta com [busca: …] vira texto normal, sem 2ª busca', async () => {
    const { chat } = fakeChat({ 'mistral:mod': [mod()], 'groq:g1': ['[busca: q]', '[busca: outra] Mesmo assim.'] });
    const search = vi.fn(async () => [item('T')]);
    const { events, state } = await run(pesq, fresh(), makeDeps(chat, { search }).deps);
    expect(search).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === 'research')).toHaveLength(2);
    expect(events.find((e) => e.type === 'turn_end' && e.speaker === 'm1')).toMatchObject({ fullText: 'Mesmo assim.' });
    expect(events.some((e) => e.type === 'token' && e.text.includes('[busca'))).toBe(false);
    expect(state.buscasFeitas).toBe(1);
  });

  it('sem regra com buscasFeitas = 6 ou membrosPesquisam falso; [busca] não dispara busca', async () => {
    for (const [c, st0] of [[pesq, { ...fresh(), buscasFeitas: 6 }], [{ ...pesq, membrosPesquisam: false }, fresh()]] as const) {
      const { chat, calls } = fakeChat({ 'mistral:mod': [mod()], 'groq:g1': ['[busca: q] Texto.'] });
      const search = vi.fn(async () => [item('T')]);
      const { events } = await run(c, st0, makeDeps(chat, { search }).deps);
      expect(sys(calls.find((x) => x.route === 'groq:g1')!)).not.toContain(RULE);
      expect(search).not.toHaveBeenCalled();
      expect(events.some((e) => e.type === 'research')).toBe(false);
      expect(events.find((e) => e.type === 'turn_end' && e.speaker === 'm1')).toMatchObject({ fullText: 'Texto.' });
    }
  });

  const m1Tokens = (evs: DebateEvent[]) => evs.filter((e) => e.type === 'token' && e.speaker === 'm1').map((e) => (e as { text: string }).text);

  it('tag de emoção seguida de [busca: q] também busca, sem vazar token', async () => {
    const { chat } = fakeChat({ 'mistral:mod': [mod()], 'groq:g1': [['[pensativo|apontar|alvo:ninguem|posição:0] [bu', 'sca: juros hoje] x'], 'Ok.'] });
    const search = vi.fn(async () => [item('T')]);
    const { events, state } = await run(pesq, fresh(), makeDeps(chat, { search }).deps);
    expect(search).toHaveBeenCalledWith('juros hoje', 'pt-BR');
    expect(m1Tokens(events).join('')).toBe('Ok.');
    expect(state.buscasFeitas).toBe(1);
  });

  it('prosa + [busca: x] ou [busca sem fechar: nunca vai para token nem fullText', async () => {
    for (const [reply, full] of [
      [['Preciso checar. [bu', 'sca: x] Depois.'], 'Preciso checar. Depois.'],
      [['Texto [busca: q'], 'Texto'],
      [['Fim [bu'], 'Fim [bu'], // "[bu" que termina o stream não é busca: volta ao texto
    ] as const) {
      const { chat } = fakeChat({ 'mistral:mod': [mod()], 'groq:g1': [[...reply]] });
      const search = vi.fn(async () => [item('T')]);
      const { events } = await run(pesq, fresh(), makeDeps(chat, { search }).deps);
      expect(search).not.toHaveBeenCalled();
      expect(m1Tokens(events).some((t) => /\[busca/i.test(t))).toBe(false);
      expect(events.find((e) => e.type === 'turn_end' && e.speaker === 'm1')).toMatchObject({ fullText: full });
    }
  });

  it('busca vazia ou que lança → aviso na 2ª chamada e conta a busca', async () => {
    for (const search of [async () => [], async () => { throw new Error('x'); }]) {
      const { chat, calls } = fakeChat({ 'mistral:mod': [mod()], 'groq:g1': ['[busca: q]', 'Ok.'] });
      const { events, state } = await run(pesq, fresh(), makeDeps(chat, { search }).deps);
      expect(sys(calls.filter((x) => x.route === 'groq:g1')[1])).toContain("A busca não encontrou nada sobre 'q'.");
      expect(events.filter((e) => e.type === 'research')[1]).toMatchObject({ fontes: [] });
      expect(state.buscasFeitas).toBe(1);
      expect(state.repertorioExtra.fontes).toEqual([]);
    }
  });
});
