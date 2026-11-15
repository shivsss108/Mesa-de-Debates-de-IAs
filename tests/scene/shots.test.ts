import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { REACTION_AT, REACTION_MS, shotFor, wideFraming } from '@/scene/shots';
import { defaultRadius, seatPositions } from '@/scene/layout';

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

describe('wideFraming', () => {
  it('enquadra todo o arco + telão, de frente, para 3 a 9 assentos', () => {
    for (const aspect of [16 / 9, 4 / 3]) {
      for (let n = 3; n <= 9; n++) {
        const r = defaultRadius(n);
        const { pos, look } = wideFraming(r, aspect);
        expect(pos[2]).toBeGreaterThan(r + 2); // na frente (+Z), longe das costas do membro do meio
        const cam = new THREE.PerspectiveCamera(55, aspect);
        cam.position.set(...pos);
        cam.lookAt(...look);
        cam.updateMatrixWorld();
        const pts: [number, number, number][] = [
          ...seatPositions(n, r).flatMap(({ position: [x, , z] }) => [[x, 1.2, z], [x, 1.8, z]] as [number, number, number][]),
          ...[-2.2, 2.2].flatMap((x) => [[x, 2.22, -r - 1.9], [x, 4.78, -r - 1.9]] as [number, number, number][]),
        ];
        for (const p of pts) {
          const v = new THREE.Vector3(...p).project(cam);
          expect(Math.abs(v.x), `n=${n} aspect=${aspect} x ${p}`).toBeLessThanOrEqual(1);
          expect(Math.abs(v.y), `n=${n} aspect=${aspect} y ${p}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
