import { describe, expect, it } from 'vitest';
import { GESTURES } from '@/types';
import type { MemberView } from '@/scene/sceneReducer';
import { GESTURE_DURATION_MS, POSES, poseAt } from '@/skins/terno/poses';

const view = (p: Partial<MemberView> = {}): MemberView => ({ id: 'a', emotion: 'neutro', stance: 0, status: 'ok', handUp: false, ...p });

describe('POSES / GESTURE_DURATION_MS', () => {
  it('todo gesto tem pose e duração', () => {
    for (const g of GESTURES) {
      expect(POSES[g]).toBeDefined();
      expect(GESTURE_DURATION_MS[g]).toBeGreaterThan(0);
    }
    expect(POSES.idle).toBeDefined();
    expect(POSES.falando).toBeDefined();
  });

  it('mao_levantada e bracos_cruzados são sustentadas', () => {
    expect(GESTURE_DURATION_MS.mao_levantada).toBe(Infinity);
    expect(GESTURE_DURATION_MS.bracos_cruzados).toBe(Infinity);
  });
});

describe('poseAt', () => {
  const bater = view({ gesture: { name: 'bater_na_mesa', at: 1000 } });

  it('gesto ativo dentro da duração', () => {
    expect(poseAt(bater, 1200, false)).toBe(POSES.bater_na_mesa);
    expect(poseAt(bater, 1200, true)).toBe(POSES.bater_na_mesa);
  });

  it('gesto expirado → idle (ouvinte) ou falando (orador)', () => {
    const t = 1000 + GESTURE_DURATION_MS.bater_na_mesa + 1;
    expect(poseAt(bater, t, false)).toBe(POSES.idle);
    expect(poseAt(bater, t, true)).toBe(POSES.falando);
  });

  it('expirado usa a reação recebida', () => {
    expect(poseAt(bater, 99_999, false, 'balancar_cabeca')).toBe(POSES.balancar_cabeca);
  });

  it('mao_levantada sustentada enquanto handUp', () => {
    const v = view({ gesture: { name: 'mao_levantada', at: 0 }, handUp: true });
    expect(poseAt(v, 1e9, false)).toBe(POSES.mao_levantada);
    expect(poseAt({ ...v, handUp: false }, 1e9, false)).toBe(POSES.idle);
  });

  it('handUp sem gesto também levanta a mão', () => {
    expect(poseAt(view({ handUp: true }), 0, false)).toBe(POSES.mao_levantada);
  });

  it('bracos_cruzados sustentado até outro gesto', () => {
    expect(poseAt(view({ gesture: { name: 'bracos_cruzados', at: 0 } }), 1e9, false)).toBe(POSES.bracos_cruzados);
  });
});
