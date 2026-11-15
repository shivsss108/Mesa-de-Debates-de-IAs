import { describe, it, expect } from 'vitest';
import { parseModeratorDecision, resolveTarget, parseClosing } from '@/engine/moderator';
import type { DebateConfig, DebateState, Seat } from '@/types';

const seat = (id: string): Seat => ({
  id, nome: id, provider: 'groq', model: 'm', temperamento: { presetId: 'neutro' }, expertise: { custom: '' },
});
const cfg: DebateConfig = {
  tema: 't', idioma: 'pt-BR', maxTurns: 20,
  moderador: { provider: 'groq', model: 'm', provocacao: 'media' },
  seats: [seat('m1'), seat('m2'), seat('m3')],
};
const st = (over: Partial<DebateState> = {}): DebateState => ({
  startedAt: 0, memberTurns: 5, summary: '', history: [], stances: {}, lastSpokeTurn: {}, stalledSteps: 0,
  failures: {}, moderatorFailures: 0, offline: {}, hands: [], lastCallAt: {}, repertorioExtra: { fontes: [] }, buscasFeitas: 0, done: false, ...over,
});
const d = (para?: string) => ({ acao: 'passar_palavra' as const, para, fala: 'x' });

describe('parseModeratorDecision', () => {
  const json = '{"acao":"provocar","para":"m1","fala":"E aí?"}';
  it('JSON puro', () => expect(parseModeratorDecision(json)).toEqual({ acao: 'provocar', para: 'm1', fala: 'E aí?' }));
  it('dentro de ```json```', () => expect(parseModeratorDecision('```json\n' + json + '\n```')?.acao).toBe('provocar'));
  it('texto antes', () => expect(parseModeratorDecision('Claro! ' + json + ' fim')?.para).toBe('m1'));
  it('acao inválida', () => expect(parseModeratorDecision('{"acao":"dançar","fala":"x"}')).toBeNull());
  it('lixo', () => expect(parseModeratorDecision('nada aqui {')).toBeNull());
});

describe('resolveTarget', () => {
  const hands = [{ member: 'm3', urge: 0.9, reason: 'r' }, { member: 'm2', urge: 0.7, reason: 'r' }];
  it('para válido', () => expect(resolveTarget(d('m2'), cfg, st({ hands }))).toBe('m2'));
  it('inexistente → topo da fila', () => expect(resolveTarget(d('m9'), cfg, st({ hands }))).toBe('m3'));
  it('moderador → topo da fila', () => expect(resolveTarget(d('moderador'), cfg, st({ hands }))).toBe('m3'));
  it('offline → topo da fila', () => expect(resolveTarget(d('m1'), cfg, st({ hands, offline: { m1: 4 } }))).toBe('m3'));
  it('topo da fila offline é pulado', () => {
    expect(resolveTarget(d('m9'), cfg, st({ hands, offline: { m3: 4 } }))).toBe('m2');
  });
  it('fila vazia → quem falou há mais tempo', () => {
    expect(resolveTarget(d(), cfg, st({ lastSpokeTurn: { m1: 4, m2: 1, m3: 3 } }))).toBe('m2');
  });
  it('empate → ordem dos assentos; offline excluído', () => {
    expect(resolveTarget(d(), cfg, st())).toBe('m1');
    expect(resolveTarget(d(), cfg, st({ offline: { m1: 4 } }))).toBe('m2');
  });
});

describe('parseClosing', () => {
  it('válido', () => {
    const r = parseClosing('{"summary":"s","consensus":["a"],"openPoints":["b"],"verdict":"v"}');
    expect(r).toEqual({ summary: 's', consensus: ['a'], openPoints: ['b'], verdict: 'v' });
  });
  it('arrays ausentes → []', () => {
    expect(parseClosing('{"summary":"s","verdict":"v"}')).toEqual({ summary: 's', consensus: [], openPoints: [], verdict: 'v' });
  });
  it('lixo → null', () => expect(parseClosing('sem json')).toBeNull());
});
