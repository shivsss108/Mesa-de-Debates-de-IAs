import { describe, expect, it } from 'vitest';
import { lowerThirdInfo } from '@/scene/LowerThird';
import { MODERATOR_ID, type DebateConfig } from '@/types';
import { resolveTemperamento } from '@/presets/temperamentos';
import { resolveExpertise } from '@/presets/expertises';
import { PROVIDERS } from '@/providers/table';

const seat = { id: 's1', nome: 'Ana', provider: 'groq' as const, model: 'llama-x', temperamento: { custom: 'calma' }, expertise: { custom: 'direito' } };
const config: DebateConfig = { tema: 't', idioma: 'pt', maxTurns: 5, moderador: { provider: 'groq', model: 'mod-m', provocacao: 'media' }, seats: [seat] };

describe('lowerThirdInfo', () => {
  it('membro', () => {
    const r = lowerThirdInfo(config, 's1');
    expect(r.nome).toBe('Ana');
    expect(r.linha).toBe(`${resolveTemperamento(seat.temperamento).nome} · ${resolveExpertise(seat.expertise).nome}`);
    expect(r.modelo).toBe(`llama-x (${PROVIDERS.groq.nome})`);
    expect(r.cor).toBe(resolveTemperamento(seat.temperamento).corGravata);
  });
  it('moderador', () => {
    expect(lowerThirdInfo(config, MODERATOR_ID)).toEqual({ nome: 'Moderador', linha: 'Mediação', modelo: `mod-m (${PROVIDERS.groq.nome})`, cor: '#ffb23e' });
  });
});
