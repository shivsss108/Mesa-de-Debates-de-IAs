import { describe, it, expect } from 'vitest';
import { validateConfig } from '@/app/config/validateConfig';
import type { DebateConfig, Seat } from '@/types';

const seat = (i: number, over: Partial<Seat> = {}): Seat => ({
  id: `m${i}`, nome: `Ana${i}`, provider: 'groq', model: 'llama',
  temperamento: { presetId: 'explosivo' }, expertise: { presetId: 'cientista' }, ...over,
});
const cfg = (over: Partial<DebateConfig> = {}): DebateConfig => ({
  tema: 'IA vai substituir programadores?', idioma: 'pt-BR', maxTurns: 20,
  moderador: { provider: 'groq', model: 'llama', provocacao: 'media' },
  seats: [seat(1), seat(2)], ...over,
});

describe('validateConfig', () => {
  it('config válida → []', () => expect(validateConfig(cfg(), { groq: 'k' }, [])).toEqual([]));
  it('tema vazio', () => expect(validateConfig(cfg({ tema: '  ' }), { groq: 'k' }, []).join()).toMatch(/tema/i));
  it('assento sem modelo cita o nome', () => {
    const c = cfg({ seats: [seat(1), seat(2, { model: '', nome: 'Zeca' })] });
    expect(validateConfig(c, { groq: 'k' }, []).join()).toMatch(/Zeca/);
  });
  it('provedor sem chave cita o provedor', () => {
    expect(validateConfig(cfg(), {}, []).join()).toMatch(/Groq/);
  });
  it('chave no env basta', () => expect(validateConfig(cfg(), {}, ['groq'])).toEqual([]));
  it('limites de assentos e turnos', () => {
    expect(validateConfig(cfg({ seats: [seat(1)] }), { groq: 'k' }, []).join()).toMatch(/2 a 8/);
    expect(validateConfig(cfg({ maxTurns: 5 }), { groq: 'k' }, []).join()).toMatch(/6 e 60/);
  });
});
