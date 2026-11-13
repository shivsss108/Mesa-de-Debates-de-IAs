import { describe, it, expect } from 'vitest';
import { buildMemberMessages, buildModeratorMessages } from '@/engine/prompts';
import { resolveTemperamento } from '@/presets/temperamentos';
import { resolveExpertise } from '@/presets/expertises';
import type { DebateConfig, DebateState, Seat } from '@/types';

const seat = (id: string, over: Partial<Seat> = {}): Seat => ({
  id,
  nome: `Nome${id}`,
  provider: 'groq',
  model: 'm',
  temperamento: { presetId: 'explosivo' },
  expertise: { presetId: 'cientista' },
  ...over,
});
const mk = (tema = 'Tema X'): DebateConfig => ({
  tema,
  idioma: 'pt-BR',
  maxTurns: 20,
  moderador: { provider: 'groq', model: 'm', provocacao: 'alta' },
  seats: [seat('m1'), seat('m2')],
});
const st = (over: Partial<DebateState> = {}): DebateState => ({
  startedAt: 0, memberTurns: 0, summary: '', history: [], stances: {}, lastSpokeTurn: {}, stalledSteps: 0,
  failures: {}, moderatorFailures: 0, offline: {}, hands: [], lastCallAt: {}, done: false, ...over,
});
const text = (m: { content: string }[]) => m.map((x) => x.content).join('\n');

describe('buildMemberMessages', () => {
  it('inclui temperamento e expertise', () => {
    const c = mk();
    const t = text(buildMemberMessages(c, st(), c.seats[0], 'Fale.'));
    expect(t).toContain(resolveTemperamento({ presetId: 'explosivo' }).promptSnippet);
    expect(t).toContain(resolveExpertise({ presetId: 'cientista' }).promptSnippet);
  });
  it('alvo lista Nome (id) dos outros e não oferece o próprio id', () => {
    const c = mk();
    const sys = buildMemberMessages(c, st(), c.seats[0], 'a')[0].content;
    expect(sys).toContain('Nomem2 (m2)');
    expect(sys.match(/Nomem1 \(m1\)/g)).toHaveLength(1); // só na linha "Você é"
    expect(sys).not.toContain('alvo:m1');
    expect(sys).toContain('Você é Nomem1 (m1)');
  });
  it('envia só as 6 últimas falas', () => {
    const c = mk();
    const history = Array.from({ length: 10 }, (_, i) => ({ speaker: 'm1', text: `fala-${i}-x` }));
    const t = text(buildMemberMessages(c, st({ history }), c.seats[0], 'a'));
    expect(t).not.toContain('fala-3-x');
    for (const i of [4, 5, 6, 7, 8, 9]) expect(t).toContain(`Nomem1: fala-${i}-x`);
  });
  it('trunca tema em 300 e custom em 1000', () => {
    const c = mk('t'.repeat(1000));
    c.seats[0].temperamento = { custom: 'k'.repeat(5000) };
    const t = text(buildMemberMessages(c, st(), c.seats[0], 'a'));
    expect(t).toContain('t'.repeat(300));
    expect(t).not.toContain('t'.repeat(301));
    expect(t).toContain('k'.repeat(1000));
    expect(t).not.toContain('k'.repeat(1001));
  });
});

describe('buildModeratorMessages', () => {
  it('inclui offline e fila de mãos', () => {
    const c = mk();
    const s = st({ memberTurns: 1, offline: { m2: 0 }, hands: [{ member: 'm1', urge: 0.9, reason: 'discordo' }] });
    const t = text(buildModeratorMessages(c, s));
    expect(t).toContain('Nomem2');
    expect(t).toContain('Nomem1');
    expect(t).toContain('discordo');
  });
});
