import { describe, it, expect } from 'vitest';
import { randomizePersonalities, defaultNames } from '@/presets/randomize';
import { TEMPERAMENTOS, resolveTemperamento } from '@/presets/temperamentos';
import { EXPERTISES } from '@/presets/expertises';
import type { Seat } from '@/types';

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mkSeats = (n: number): Seat[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    nome: `N${i}`,
    provider: 'groq' as const,
    model: `m${i}`,
    temperamento: { custom: 'x' },
    expertise: { custom: 'y' },
  }));

const tIds = new Set(TEMPERAMENTOS.map((t) => t.id));
const eIds = new Set(EXPERTISES.map((e) => e.id));
const valid = (s: Seat) =>
  'presetId' in s.temperamento &&
  tIds.has(s.temperamento.presetId) &&
  'presetId' in s.expertise &&
  eIds.has(s.expertise.presetId);

describe('randomizePersonalities', () => {
  it('atribui combinações válidas e distintas preservando o resto', () => {
    const seats = mkSeats(4);
    const out = randomizePersonalities(seats, mulberry32(42));
    expect(out).toHaveLength(4);
    out.forEach((s, i) => {
      expect(valid(s)).toBe(true);
      expect(s.id).toBe(seats[i].id);
      expect(s.nome).toBe(seats[i].nome);
      expect(s.provider).toBe(seats[i].provider);
      expect(s.model).toBe(seats[i].model);
    });
    const combos = new Set(out.map((s) => JSON.stringify([s.temperamento, s.expertise])));
    expect(combos.size).toBe(4);
  });

  it('não lança com mais assentos que combinações (101 > 10x10)', () => {
    const out = randomizePersonalities(mkSeats(101), mulberry32(1));
    expect(out).toHaveLength(101);
    expect(out.every(valid)).toBe(true);
  });
});

describe('defaultNames', () => {
  it('devolve nomes únicos', () => {
    const names = defaultNames(8);
    expect(names).toHaveLength(8);
    expect(new Set(names).size).toBe(8);
  });
});

describe('resolveTemperamento', () => {
  it('trunca texto personalizado em 1000 e usa impulsividade neutra', () => {
    const t = resolveTemperamento({ custom: 'x'.repeat(5000) });
    expect(t.promptSnippet.length).toBe(1000);
    expect(t.impulsividade).toBe(0);
  });
});
