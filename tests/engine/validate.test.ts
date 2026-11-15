import { describe, it, expect } from 'vitest';
import { validateStepBody } from '@/engine/validate';
import { createInitialState } from '@/engine/initialState';
import type { DebateConfig, Dossie, Seat } from '@/types';

const seat = (id: string): Seat => ({
  id, nome: id, provider: 'groq', model: 'g', temperamento: { presetId: 'cetico' }, expertise: { custom: '' },
});
const cfg: DebateConfig = {
  tema: 'IA no trabalho', idioma: 'pt-BR', maxTurns: 20,
  moderador: { provider: 'mistral', model: 'mod', provocacao: 'media' },
  seats: [seat('m1'), seat('m2')],
};
const dossie = (over: Partial<Dossie> = {}): Dossie => ({
  geradoEm: '2026-11-14',
  premissa: { status: 'confirmada', nota: 'ok' },
  fatos: [{ id: 'F1', texto: 'a', fontes: ['S1'] }, { id: 'F2', texto: 'b', fontes: ['S2'] }],
  disputas: ['x'],
  fontes: [{ id: 'S1', titulo: 't1', origem: 'web' }, { id: 'S2', titulo: 't2', origem: 'link' }],
  modo: 'todos',
  ...over,
});
const body = (config: unknown) => ({ config, state: createInitialState(cfg, 0), keys: {}, seqStart: 0 });
const ok = (config: unknown) => validateStepBody(body(config)).ok;

describe('validateStepBody + dossiê', () => {
  it('aceita config sem dossiê', () => expect(ok(cfg)).toBe(true));
  it('aceita dossiê válido', () => expect(ok({ ...cfg, dossie: dossie(), membrosPesquisam: true })).toBe(true));
  it('aceita dossiê vazio', () => expect(ok({ ...cfg, dossie: dossie({ fatos: [], disputas: [], fontes: [] }) })).toBe(true));
  it('rejeita 13 fatos', () => {
    const fatos = Array.from({ length: 13 }, (_, i) => ({ id: `F${i}`, texto: 'a', fontes: [] }));
    expect(ok({ ...cfg, dossie: dossie({ fatos }) })).toBe(false);
  });
  it('rejeita fato com 301 chars', () =>
    expect(ok({ ...cfg, dossie: dossie({ fatos: [{ id: 'F1', texto: 'a'.repeat(301), fontes: [] }] }) })).toBe(false));
  it('rejeita modo inválido', () => expect(ok({ ...cfg, dossie: { ...dossie(), modo: 'x' } })).toBe(false));
  it('rejeita status de premissa inválido', () =>
    expect(ok({ ...cfg, dossie: { ...dossie(), premissa: { status: 'talvez', nota: '' } } })).toBe(false));
  it('rejeita dossiê > 8 KB', () => {
    const recortes = { m1: 'a'.repeat(400), m2: 'a'.repeat(400) };
    const fontes = Array.from({ length: 12 }, (_, i) => ({ id: `S${i}`, titulo: 't'.repeat(900), origem: 'web' as const }));
    expect(ok({ ...cfg, dossie: dossie({ fontes, recortes, modo: 'recorte' }) })).toBe(false);
  });
  it('rejeita membrosPesquisam não booleano', () => expect(ok({ ...cfg, membrosPesquisam: 'sim' })).toBe(false));
});

describe('createInitialState', () => {
  it('inicia repertório e buscas', () => {
    const s = createInitialState(cfg, 0);
    expect(s.repertorioExtra).toEqual({ fontes: [] });
    expect(s.buscasFeitas).toBe(0);
  });
});

describe('validateStepBody + repertório extra (vem do cliente)', () => {
  const fonte = (over: object = {}) => ({ id: 'S1', titulo: 't', origem: 'membro', porMembro: 'm1', ...over });
  const withState = (over: object) => validateStepBody({ ...body(cfg), state: { ...createInitialState(cfg, 0), ...over } });
  it('aceita fontes válidas e buscas no limite', () =>
    expect(withState({ repertorioExtra: { fontes: [fonte({ resumo: 'r'.repeat(300), veiculo: 'v'.repeat(80), url: 'u'.repeat(500), data: 'd'.repeat(40), porMembro: 'p'.repeat(40) })] }, buscasFeitas: 6 }).ok).toBe(true));
  it('campos ausentes (cliente antigo) viram vazio/0', () => {
    const st = createInitialState(cfg, 0) as Partial<ReturnType<typeof createInitialState>>;
    delete st.repertorioExtra;
    delete st.buscasFeitas;
    const v = validateStepBody({ ...body(cfg), state: st });
    expect(v.ok && v.value.state.repertorioExtra).toEqual({ fontes: [] });
    expect(v.ok && v.value.state.buscasFeitas).toBe(0);
  });
  it('rejeita repertório malformado', () => {
    for (const repertorioExtra of [
      null, { fontes: 'x' }, { fontes: Array.from({ length: 25 }, (_, i) => fonte({ id: `S${i}` })) },
      { fontes: [fonte({ titulo: 't'.repeat(121) })] }, { fontes: [fonte({ resumo: 'r'.repeat(301) })] },
      { fontes: [fonte({ origem: 'x' })] }, { fontes: [fonte({ id: 5 })] }, { fontes: [fonte({ url: 5 })] },
      { fontes: [fonte({ veiculo: 'v'.repeat(81) })] }, { fontes: [fonte({ url: 'u'.repeat(501) })] },
      { fontes: [fonte({ data: 'd'.repeat(41) })] }, { fontes: [fonte({ porMembro: 'p'.repeat(41) })] },
    ])
      expect(withState({ repertorioExtra }).ok).toBe(false);
  });
  it('rejeita buscasFeitas fora de 0..6', () => {
    for (const buscasFeitas of [-1, 7, 1.5, '1']) expect(withState({ buscasFeitas }).ok).toBe(false);
  });
  it('dossiê: resumo de fonte ≤ 300', () =>
    expect(ok({ ...cfg, dossie: dossie({ fontes: [{ id: 'S1', titulo: 't', origem: 'web', resumo: 'r'.repeat(301) }] }) })).toBe(false));
});
