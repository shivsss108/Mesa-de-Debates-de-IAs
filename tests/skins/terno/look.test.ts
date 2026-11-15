import { describe, expect, it } from 'vitest';
import { lookOf, looksFor } from '@/skins/terno/look';
import { resolveTemperamento } from '@/presets/temperamentos';
import type { Seat } from '@/types';

const mk = (id: string, temperamento: Seat['temperamento'] = { presetId: 'cetico' }): Seat =>
  ({ id, nome: id, provider: 'groq', model: 'x', temperamento, expertise: { custom: '' } });

describe('lookOf', () => {
  it('é determinístico e independe dos outros assentos', () => {
    expect(lookOf(mk('m3'))).toEqual(lookOf(mk('m3')));
  });
  it('moderador', () => {
    const l = lookOf('moderador');
    expect(l.hair).not.toBe('careca_barba');
    expect(l.hairColor).toBe('#b8b8b8');
    expect(l.glasses).toBe(true);
    expect(l.suit).toBe('#1c2a4a');
    expect(l.tie).toBe('#ffb23e');
  });
  it('gravata vem do temperamento', () => {
    const s = mk('a', { presetId: 'explosivo' });
    expect(lookOf(s).tie).toBe(resolveTemperamento(s.temperamento).corGravata);
    expect(lookOf(mk('b', { custom: 'x' })).tie).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('looksFor', () => {
  const seats = Array.from({ length: 8 }, (_, i) => mk(`m${i + 1}`));
  it('8 combinações distintas e estáveis', () => {
    const r = looksFor(seats);
    const keys = seats.map((s) => `${r[s.id].skin}|${r[s.id].hair}|${r[s.id].suit}`);
    expect(new Set(keys).size).toBe(8);
    expect(r.moderador).toEqual(lookOf('moderador'));
    expect(looksFor(seats)).toEqual(r);
  });
});
