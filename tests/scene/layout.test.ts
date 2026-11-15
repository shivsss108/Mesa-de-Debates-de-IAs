import { describe, expect, it } from 'vitest';
import { defaultRadius, seatPositions, studioSize, type SeatPose } from '@/scene/layout';
import demo from '@/replays/demo-1.json';
import { parseReplay } from '@/client/replay';
import { initialScene, sceneReducer } from '@/scene/sceneReducer';

describe('seatPositions (arco)', () => {
  const n = 5;
  const radius = 3;
  const ps = seatPositions(n, radius);
  const dist = (a: SeatPose, b: SeatPose) => Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);

  it('moderador no fundo, olhando para +Z', () => {
    expect(ps).toHaveLength(n);
    expect(ps[0].position[0]).toBeCloseTo(0);
    expect(ps[0].position[2]).toBeCloseTo(-radius);
    expect(ps[0].rotationY).toBeCloseTo(0);
  });

  it('membros em arco à frente do moderador, simétricos, no raio', () => {
    for (const p of ps.slice(1)) {
      expect(p.position[2]).toBeGreaterThan(ps[0].position[2]);
      expect(Math.hypot(p.position[0], p.position[2])).toBeCloseTo(radius);
    }
    for (let i = 1; i < n; i++) expect(ps[i].position[0]).toBeCloseTo(-ps[n - i].position[0]);
  });

  it('rotationY aponta para a origem', () => {
    for (const p of ps) {
      const dir = [Math.sin(p.rotationY), Math.cos(p.rotationY)];
      expect((p.position[0] * dir[0] + p.position[2] * dir[1]) / radius).toBeCloseTo(-1);
    }
  });

  it('um único membro fica em 0° (frente)', () => {
    const q = seatPositions(2, radius)[1];
    expect(q.position[0]).toBeCloseTo(0);
    expect(q.position[2]).toBeCloseTo(radius);
  });

  it('espaçamento entre vizinhos >= 1.1 com o raio padrão (n = 3..9)', () => {
    for (let k = 3; k <= 9; k++) {
      const s = seatPositions(k, defaultRadius(k));
      for (let i = 2; i < k; i++) expect(dist(s[i], s[i - 1])).toBeGreaterThanOrEqual(1.1);
    }
  });

  it('studioSize cabe o arco', () => {
    expect(studioSize(defaultRadius(9))).toBeGreaterThan(2 * defaultRadius(9) + 4);
  });
});

describe('demo-1 replay', () => {
  it('valida e termina com debate_end', () => {
    const r = parseReplay(demo);
    const s = r.events.reduce(sceneReducer, initialScene);
    expect(s.ended).toBeDefined();
    expect(r.events.some((e) => e.type === 'gesture' && e.gesture === 'bater_na_mesa')).toBe(true);
  });
});
