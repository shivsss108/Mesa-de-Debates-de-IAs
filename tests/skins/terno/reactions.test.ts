import { describe, expect, it } from 'vitest';
import type { MemberView } from '@/scene/sceneReducer';
import { listenerReaction } from '@/skins/terno/reactions';

const view = (p: Partial<MemberView> = {}): MemberView => ({ id: 'a', emotion: 'neutro', stance: 0, status: 'ok', handUp: false, ...p });

describe('listenerReaction', () => {
  it('mão levantada tem prioridade', () => {
    expect(listenerReaction(view({ handUp: true, stance: 1 }), -1, false)).toBe('mao_levantada');
  });
  it('discordância forte → braços cruzados', () => {
    expect(listenerReaction(view({ stance: 0.8 }), -0.5, false)).toBe('bracos_cruzados');
  });
  it('concordância → balança a cabeça', () => {
    expect(listenerReaction(view({ stance: 0.5 }), 0.4, true)).toBe('balancar_cabeca');
  });
  it('meio-termo → idle', () => {
    expect(listenerReaction(view({ stance: 0 }), 0.6, false)).toBe('idle');
  });
});
