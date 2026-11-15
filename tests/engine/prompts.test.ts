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
  failures: {}, moderatorFailures: 0, offline: {}, hands: [], lastCallAt: {}, repertorioExtra: { fontes: [] }, buscasFeitas: 0, done: false, ...over,
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

describe('data e dossiê nos prompts', () => {
  const NOW = new Date(2026, 0, 2, 12);
  const dossie = (over: Partial<NonNullable<DebateConfig['dossie']>> = {}): NonNullable<DebateConfig['dossie']> => ({
    geradoEm: '2026-11-14',
    premissa: { status: 'confirmada', nota: 'nota-p' },
    fatos: [
      { id: 'F1', texto: 'fato-um', fontes: ['S1', 'S3'] },
      { id: 'F2', texto: 'fato-dois', fontes: ['S2'] },
      { id: 'F3', texto: 'fato-tres', fontes: ['S1'] },
    ],
    disputas: ['disputa-a'],
    fontes: [],
    modo: 'todos',
    ...over,
  });
  const withD = (d = dossie()) => ({ ...mk(), dossie: d });

  it('os 4 builders abrem com a data do dossiê', async () => {
    const { buildSummaryMessages, buildClosingMessages } = await import('@/engine/prompts');
    const c = withD();
    for (const m of [
      buildMemberMessages(c, st(), c.seats[0], 'a'),
      buildModeratorMessages(c, st()),
      buildSummaryMessages(c, st()),
      buildClosingMessages(c, st()),
    ])
      expect(text(m)).toContain('Hoje é 14/11/2026.');
  });
  it('sem dossiê usa a data injetada', async () => {
    const { buildSummaryMessages, hojeDe } = await import('@/engine/prompts');
    const c = mk();
    expect(hojeDe(c, NOW)).toBe('02/01/2026');
    expect(text(buildSummaryMessages(c, st(), NOW))).toContain('Hoje é 02/01/2026.');
    expect(text(buildMemberMessages(c, st(), c.seats[0], 'a', NOW))).toContain('Hoje é 02/01/2026.');
  });
  it('todos: membro vê todos os fatos e a regra de desatualização', () => {
    const c = withD();
    const t = text(buildMemberMessages(c, st(), c.seats[0], 'a'));
    for (const f of ['fato-um', 'fato-dois', 'fato-tres', 'nota-p', 'disputa-a', '[S1,S3]']) expect(t).toContain(f);
    expect(t).toContain('Seu conhecimento pode estar desatualizado.');
    expect(t).toContain('Nunca invente datas, números ou declarações.');
    expect(t).not.toContain('só parte das informações');
  });
  it('dividido: rodízio por assento; moderador vê tudo', () => {
    const c = withD(dossie({ modo: 'dividido' }));
    const m1 = text(buildMemberMessages(c, st(), c.seats[0], 'a'));
    const m2 = text(buildMemberMessages(c, st(), c.seats[1], 'a'));
    expect(m1).toContain('fato-um');
    expect(m1).toContain('fato-tres');
    expect(m1).not.toContain('fato-dois');
    expect(m2).toContain('fato-dois');
    expect(m2).not.toContain('fato-um');
    for (const t of [m1, m2]) {
      expect(t).toContain('nota-p');
      expect(t).toContain('disputa-a');
      expect(t).toContain('Você tem só parte das informações; outros podem saber fatos que você não sabe.');
    }
    const mod = text(buildModeratorMessages(c, st()));
    for (const f of ['fato-um', 'fato-dois', 'fato-tres']) expect(mod).toContain(f);
  });
  it('recorte: só o destaque do próprio membro', () => {
    const c = withD(dossie({ modo: 'recorte', recortes: { m1: 'foco-um', m2: 'foco-dois' } }));
    const t = text(buildMemberMessages(c, st(), c.seats[0], 'a'));
    expect(t).toContain('Destaque para a sua área: foco-um');
    expect(t).not.toContain('foco-dois');
  });
  it('repertorioExtra aparece com o nome de quem pesquisou', () => {
    const c = withD();
    const s = st({ repertorioExtra: { fontes: [{ id: 'S7', titulo: 'Achado', origem: 'membro', porMembro: 'm2' }] } });
    const t = text(buildMemberMessages(c, s, c.seats[0], 'a'));
    expect(t).toContain('Pesquisado durante o debate:');
    expect(t).toContain('- [S7] (por Nomem2) Achado');
    expect(text(buildModeratorMessages(c, s))).toContain('(por Nomem2) Achado');
  });
  it('fatos vazios não lançam e omitem a seção', () => {
    const c = withD(dossie({ fatos: [] }));
    const t = text(buildMemberMessages(c, st(), c.seats[0], 'a'));
    expect(t).toContain('Repertório (pesquisado em 14/11/2026):');
    expect(t).not.toContain('Fatos:');
  });
  it('moderador avisa sobre premissa só na abertura', () => {
    const c = withD(dossie({ premissa: { status: 'nao_encontrada', nota: 'x' } }));
    const abre = text(buildModeratorMessages(c, st()));
    expect(abre).toContain('avise os participantes');
    const depois = text(buildModeratorMessages(c, st({ history: [{ speaker: 'm1', text: 'oi' }] })));
    expect(depois).not.toContain('avise os participantes');
  });
  it('bloco cortado em 4000 chars', async () => {
    const { dossieBlock } = await import('@/engine/prompts');
    const fatos = Array.from({ length: 12 }, (_, i) => ({ id: `F${i}`, texto: 'a'.repeat(300), fontes: ['S1'] }));
    const b = dossieBlock(withD(dossie({ fatos, disputas: ['d'.repeat(200), 'e'.repeat(200)] })), st(), 'm1');
    expect(b.length).toBeLessThanOrEqual(4000);
    expect(b).toContain('Repertório');
    expect(dossieBlock(mk(), st(), 'm1')).toBe('');
  });
});
