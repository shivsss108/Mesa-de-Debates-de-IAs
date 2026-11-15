import { describe, expect, it } from 'vitest';
import { initialScene, sceneReducer } from '@/scene/sceneReducer';
import type { DebateConfig, DebateEvent } from '@/types';

const seat = (id: string) => ({
  id, nome: id, provider: 'groq' as const, model: 'm',
  temperamento: { presetId: 'x' }, expertise: { presetId: 'y' },
});
const config: DebateConfig = {
  tema: 't', idioma: 'pt', maxTurns: 6,
  moderador: { provider: 'groq', model: 'm', provocacao: 'media' },
  seats: [seat('m1'), seat('m2')],
};

type Body = DebateEvent extends infer E ? (E extends unknown ? Omit<E, 'seq' | 't'> : never) : never;
const seqd = (bodies: Body[]) => bodies.map((b, i) => ({ seq: i, t: i * 10, ...b }) as DebateEvent);

describe('sceneReducer', () => {
  it('dobra o passo feliz em cena', () => {
    const events = seqd([
      { type: 'debate_start', config },
      { type: 'turn_start', speaker: 'moderador', addressedTo: 'm1' },
      { type: 'token', speaker: 'moderador', text: 'Olá ' },
      { type: 'token', speaker: 'moderador', text: 'm1' },
      { type: 'turn_end', speaker: 'moderador', fullText: 'Olá m1' },
      { type: 'turn_start', speaker: 'm1' },
      { type: 'token', speaker: 'm1', text: 'Oi' },
    ]);
    let s = events.reduce(sceneReducer, initialScene);
    expect(s.speaker).toBe('m1');
    expect(s.turnSeq).toBe(5); // seq do turn_start de m1: o balão só mostra falas posteriores
    expect(s.bubble).toBe('Oi');
    expect(Object.keys(s.members).sort()).toEqual(['m1', 'm2', 'moderador']);

    const more = seqd([
      { type: 'turn_end', speaker: 'm1', fullText: 'Oi' },
      { type: 'emotion', member: 'm1', emotion: 'feliz' },
      { type: 'gesture', member: 'm1', gesture: 'apontar' },
      { type: 'hands', queue: [{ member: 'm2', urge: 0.9, reason: 'r' }] },
      { type: 'debate_end', summary: 's', consensus: [], openPoints: [], verdict: 'v' },
    ]);
    s = more.reduce(sceneReducer, s);
    expect(s.bubble).toBe('');
    expect(s.transcript).toEqual([
      { speaker: 'moderador', text: 'Olá m1' },
      { speaker: 'm1', text: 'Oi' },
    ]);
    expect(s.memberTurns).toBe(1);
    expect(s.members.m1.emotion).toBe('feliz');
    expect(s.members.m1.gesture).toEqual({ name: 'apontar', at: 20 });
    expect(s.members.m2.handUp).toBe(true);
    expect(s.members.m1.handUp).toBe(false);
    expect(s.ended?.verdict).toBe('v');
  });

  it('hands novas baixam mãos que saíram da fila', () => {
    let s = seqd([{ type: 'debate_start', config }, { type: 'hands', queue: [{ member: 'm1', urge: 1, reason: '' }] }]).reduce(sceneReducer, initialScene);
    expect(s.members.m1.handUp).toBe(true);
    s = sceneReducer(s, { seq: 9, t: 9, type: 'hands', queue: [] });
    expect(s.members.m1.handUp).toBe(false);
  });
});

describe('status com motivo', () => {
  it('sem_sinal com reason aparece na transcrição', () => {
    const s = sceneReducer(initialScene, { seq: 0, t: 1, type: 'status', member: 'm1', state: 'sem_sinal', reason: 'resposta vazia do modelo' });
    expect(s.transcript.at(-1)).toEqual({ speaker: 'm1', text: '(não respondeu: resposta vazia do modelo)' });
  });
  it('research: busca em cena, acumula extras e limpa no turn_start', () => {
    const fonte = { id: 'S7', titulo: 'x', origem: 'membro' as const, porMembro: 'm1' };
    const evs = seqd([
      { type: 'debate_start', config },
      { type: 'research', member: 'm1', query: 'q' },
    ]);
    let s = evs.reduce(sceneReducer, initialScene);
    expect(s.speaker).toBe('m1');
    expect(s.turnSeq).toBe(1);
    expect(s.searching).toBe('q');
    expect(s.members.m1.emotion).toBe('pensativo');
    s = sceneReducer(s, { seq: 2, t: 20, type: 'research', member: 'm1', query: 'q', fontes: [fonte] });
    expect(s.extraSources).toEqual([fonte]);
    expect(s.searching).toBe('q');
    s = sceneReducer(s, { seq: 3, t: 30, type: 'turn_start', speaker: 'm1' });
    expect(s.searching).toBeUndefined();
    expect(s.extraSources).toHaveLength(1);
    s = sceneReducer(s, { seq: 4, t: 40, type: 'debate_start', config });
    expect(s.extraSources).toEqual([]);
  });
});
