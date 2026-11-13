import type { Gesture } from '@/types';
import type { MemberView } from '@/scene/sceneReducer';

export type Joint = 'cabeca' | 'tronco' | 'ombroE' | 'cotoveloE' | 'ombroD' | 'cotoveloD';
/** Rotações Euler (rad). Avatar olha para +Z; E = esquerda do avatar (+X), D = direita (−X).
 *  Ombro/cotovelo: x negativo leva o braço para frente; z positivo abre o braço E (negativo abre o D).
 *  Tronco: x positivo inclina para frente. */
export type Pose = Partial<Record<Joint, [number, number, number]>>;

export const POSES: Record<Gesture | 'idle' | 'falando', Pose> = {
  idle: { ombroE: [0, 0, 0.08], ombroD: [0, 0, -0.08], cotoveloE: [-0.15, 0, 0], cotoveloD: [-0.15, 0, 0] },
  falando: { ombroE: [-0.2, 0, 0.12], cotoveloE: [-0.5, 0, 0], ombroD: [-0.45, 0, -0.12], cotoveloD: [-0.9, 0, 0] },
  // mão alcança o tampo (y≈0.79) a 0.55 à frente; o Avatar sobe/desce o braço em ciclo
  bater_na_mesa: { tronco: [0.35, 0, 0], cabeca: [0.1, 0, 0], ombroD: [-1.2, 0, 0], cotoveloD: [-0.1, 0, 0], ombroE: [-0.3, 0, 0.1], cotoveloE: [-0.3, 0, 0] },
  apontar: { tronco: [0.08, 0, 0], ombroD: [-1.5, 0.15, 0], cotoveloD: [0, 0, 0], ombroE: [0, 0, 0.08], cotoveloE: [-0.15, 0, 0] },
  // cotovelo [-π/2, 0, φ] deixa o antebraço na horizontal, apontando para (sin φ, 0, cos φ)
  bracos_cruzados: { ombroE: [-0.25, 0, 0.05], cotoveloE: [-1.57, 0, -1.2], ombroD: [-0.35, 0, -0.05], cotoveloD: [-1.57, 0, 1.2] },
  mao_levantada: { ombroD: [0, 0, -2.8], cotoveloD: [-0.3, 0, 0], ombroE: [0, 0, 0.08], cotoveloE: [-0.15, 0, 0] },
  maos_no_bolso: { ombroE: [0.25, 0, 0.18], cotoveloE: [-0.6, 0, 0], ombroD: [0.25, 0, -0.18], cotoveloD: [-0.6, 0, 0] },
  balancar_cabeca: { cabeca: [0.1, 0, 0], ombroE: [0, 0, 0.08], ombroD: [0, 0, -0.08], cotoveloE: [-0.15, 0, 0], cotoveloD: [-0.15, 0, 0] },
  dar_de_ombros: { cabeca: [0, 0, 0.2], ombroE: [0.1, 0, 0.3], cotoveloE: [-1.3, 0, 0.4], ombroD: [0.1, 0, -0.3], cotoveloD: [-1.3, 0, -0.4] },
  inclinar_para_frente: { tronco: [0.3, 0, 0], cabeca: [-0.15, 0, 0], ombroE: [-0.3, 0, 0.05], cotoveloE: [-0.4, 0, 0], ombroD: [-0.3, 0, -0.05], cotoveloD: [-0.4, 0, 0] },
};

export const GESTURE_DURATION_MS: Record<Gesture, number> = {
  bater_na_mesa: 1500,
  apontar: 2500,
  bracos_cruzados: Infinity,
  mao_levantada: Infinity,
  maos_no_bolso: 4000,
  balancar_cabeca: 2000,
  dar_de_ombros: 1500,
  inclinar_para_frente: 3000,
};

/** Gesto ativo se `nowT - at` < duração (mão levantada só enquanto `handUp` ou falando); senão fala/reação.
 *  `nowT` na mesma base de `gesture.at` (tempo do debate). Devolve sempre um objeto de `POSES` (sem alocar). */
export function poseAt(view: MemberView, nowT: number, isSpeaker: boolean, reaction: Gesture | 'idle' = view.handUp ? 'mao_levantada' : 'idle'): Pose {
  const g = view.gesture;
  if (g && nowT - g.at < GESTURE_DURATION_MS[g.name] && (g.name !== 'mao_levantada' || view.handUp || isSpeaker)) return POSES[g.name];
  return isSpeaker ? POSES.falando : POSES[reaction];
}
