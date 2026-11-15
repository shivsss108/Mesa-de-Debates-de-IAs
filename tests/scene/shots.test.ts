import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { REACTION_AT, REACTION_MS, shotFor, wideFraming } from '@/scene/shots';
import { defaultRadius, seatPositions, studioSize } from '@/scene/layout';

const base = { speaking: false, progress: 0, now: 10_000, reducedMotion: false };

describe('shotFor', () => {
  it('aberto sem orador ou com orador ainda pensando', () => {
    expect(shotFor(base)).toEqual({ kind: 'aberto' });
    expect(shotFor({ ...base, speaker: 'm1' })).toEqual({ kind: 'aberto' });
  });

  it('close no orador enquanto fala', () => {
    expect(shotFor({ ...base, speaker: 'm1', speaking: true, progress: 0.2 })).toEqual({ kind: 'close', target: 'm1' });
  });

  it('reação de REACTION_MS no citado, depois volta ao close', () => {
    const i = { ...base, speaker: 'm1', addressedTo: 'm2', speaking: true, progress: REACTION_AT + 0.1 };
    expect(REACTION_MS).toBe(1500);
    expect(REACTION_AT).toBe(0.4);
    expect(shotFor({ ...i, reactionSince: i.now - 500 })).toEqual({ kind: 'reacao', target: 'm2' });
    expect(shotFor({ ...i, reactionSince: i.now - 1600 })).toEqual({ kind: 'close', target: 'm1' });
    expect(shotFor(i)).toEqual({ kind: 'close', target: 'm1' }); // sem marca, sem reação
  });

  it('reducedMotion nunca devolve reacao', () => {
    const i = { ...base, speaker: 'm1', addressedTo: 'm2', speaking: true, progress: 0.5, reactionSince: base.now - 100, reducedMotion: true };
    expect(shotFor(i)).toEqual({ kind: 'close', target: 'm1' });
  });
});

const inFrame = (pos: [number, number, number], look: [number, number, number], aspect: number, p: [number, number, number]) => {
  const cam = new THREE.PerspectiveCamera(55, aspect);
  cam.position.set(...pos);
  cam.lookAt(...look);
  cam.updateMatrixWorld();
  const v = new THREE.Vector3(...p).project(cam);
  return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
};

describe('wideFraming', () => {
  it('de frente e dentro do estúdio; paisagem: arco inteiro + telão, para 3 a 9 assentos', () => {
    for (const aspect of [16 / 9, 4 / 3]) {
      for (let n = 3; n <= 9; n++) {
        const r = defaultRadius(n);
        const { pos, look } = wideFraming(r, aspect);
        expect(pos[2]).toBeGreaterThan(r + 2); // na frente (+Z), longe das costas do membro do meio
        expect(pos[2]).toBeLessThanOrEqual(studioSize(r) / 2);
        const pts: [number, number, number][] = [
          ...seatPositions(n, r).flatMap(({ position: [x, , z] }) => [[x, 1.2, z], [x, 1.8, z]] as [number, number, number][]),
          ...[-2.2, 2.2].flatMap((x) => [[x, 2.22, -r - 1.9], [x, 4.78, -r - 1.9]] as [number, number, number][]),
        ];
        for (const p of pts) expect(inFrame(pos, look, aspect, p), `n=${n} aspect=${aspect} ${p}`).toBe(true);
      }
    }
  });

  it('retrato (0.46): câmera dentro do estúdio, moderador e telão no quadro', () => {
    for (let n = 3; n <= 9; n++) {
      const r = defaultRadius(n);
      const { pos, look } = wideFraming(r, 0.46);
      expect(Math.abs(pos[0])).toBeLessThanOrEqual(studioSize(r) / 2);
      expect(pos[2]).toBeLessThanOrEqual(studioSize(r) / 2);
      const pts: [number, number, number][] = [[0, 1.0, -r], [0, 1.98, -r], [0, 2.22, -r - 1.9], [0, 4.78, -r - 1.9], [-2.2, 3.5, -r - 1.9], [2.2, 3.5, -r - 1.9]];
      for (const p of pts) expect(inFrame(pos, look, 0.46, p), `n=${n} ${p}`).toBe(true);
    }
  });
});
