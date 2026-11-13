import type { Gesture } from '@/types';
import type { MemberView } from '@/scene/sceneReducer';

/** Reação de quem escuta. `addressed` (citado) só vira a cabeça para o orador — feito no Avatar, não na pose. */
export function listenerReaction(view: MemberView, speakerStance: number, addressed: boolean): Gesture | 'idle' {
  void addressed;
  if (view.handUp) return 'mao_levantada';
  const d = Math.abs(view.stance - speakerStance);
  if (d > 1) return 'bracos_cruzados';
  if (d < 0.3) return 'balancar_cabeca';
  return 'idle';
}
