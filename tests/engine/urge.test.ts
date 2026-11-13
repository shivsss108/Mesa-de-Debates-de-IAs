import { describe, it, expect } from 'vitest';
import { computeHands, URGE } from '@/engine/urge';
import type { Seat } from '@/types';

const seat = (id: string, presetId = 'neutro'): Seat => ({
  id,
  nome: id,
  provider: 'groq',
  model: 'm',
  temperamento: { presetId },
  expertise: { custom: '' },
});

const base = { speaker: 'sp', seats: [] as Seat[], stances: {}, lastSpokeTurn: {}, memberTurns: 5, offline: [] as string[] };
const run = (o: Partial<Parameters<typeof computeHands>[0]>) => computeHands({ ...base, ...o });

describe('computeHands', () => {
  it('citado passa na frente de discordante extremo não citado', () => {
    const hands = run({
      target: 'cit',
      seats: [seat('sp'), seat('cit'), seat('dis', 'explosivo')],
      stances: { sp: -1, cit: -1, dis: 1 },
    });
    expect(hands.map((h) => h.member)).toEqual(['cit', 'dis']);
    expect(hands[0].reason).toBe('foi citado');
    expect(hands[1].reason).toBe('discorda');
    expect(hands[0].urge).toBeGreaterThan(hands[1].urge);
  });

  it('concordante (diferença 0.1) não aparece', () => {
    expect(run({ seats: [seat('sp'), seat('a')], stances: { sp: 0, a: 0.1 } })).toEqual([]);
  });

  it('explosivo discordante aparece e conservador com mesma diferença não', () => {
    const hands = run({
      seats: [seat('sp'), seat('exp', 'explosivo'), seat('con', 'conservador')],
      stances: { sp: -0.7, exp: 0.7, con: 0.7 },
    });
    expect(hands.map((h) => h.member)).toEqual(['exp']);
  });

  it('impulsivo é a razão quando domina', () => {
    const hands = run({
      seats: [seat('sp'), seat('exp', 'explosivo')],
      stances: { sp: 0, exp: 0 },
      target: 'exp',
    });
    expect(hands[0].reason).toBe('foi citado');
    const [h] = run({ seats: [seat('sp'), seat('exp', 'explosivo')], stances: { sp: -1, exp: 1 } });
    expect(h.reason).toBe('discorda');
    expect(URGE.threshold).toBe(0.6);
  });

  it('quem falou no turno anterior perde para igual que não falou', () => {
    const hands = run({
      target: undefined,
      seats: [seat('sp'), seat('rec', 'explosivo'), seat('fresh', 'explosivo')],
      stances: { sp: -1, rec: 1, fresh: 1 },
      lastSpokeTurn: { rec: 4 },
    });
    expect(hands.map((h) => h.member)).toEqual(['fresh']);
  });

  it('offline, speaker e moderador nunca aparecem', () => {
    const hands = run({
      target: 'off',
      seats: [seat('sp'), seat('off'), seat('moderador'), seat('ok', 'explosivo')],
      stances: { sp: -1, off: 1, ok: 1 },
      offline: ['off'],
    });
    expect(hands.map((h) => h.member)).toEqual(['ok']);
  });

  it('ordena por urge decrescente e limita a max', () => {
    const hands = run({
      target: 'a',
      seats: [seat('sp'), seat('b', 'explosivo'), seat('a', 'explosivo')],
      stances: { sp: -1, a: 1, b: 1 },
    });
    expect(hands.map((h) => h.member)).toEqual(['a', 'b']);
    expect(hands[0].urge).toBeLessThanOrEqual(URGE.max);
  });
});
