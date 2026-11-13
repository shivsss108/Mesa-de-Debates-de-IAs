import { describe, expect, it } from 'vitest';
import { seatPositions } from '@/scene/layout';
import demo from '@/replays/demo-1.json';
import { parseReplay } from '@/client/replay';
import { initialScene, sceneReducer } from '@/scene/sceneReducer';

describe('seatPositions', () => {
  const n = 5;
  const radius = 1.6 + 0.15 * n;
  const ps = seatPositions(n);

  it('devolve n posições, [0] em ângulo 0, todas no raio', () => {
    expect(ps).toHaveLength(n);
    expect(ps[0].position[0]).toBeCloseTo(0);
    expect(ps[0].position[2]).toBeCloseTo(radius);
    for (const p of ps) expect(Math.hypot(p.position[0], p.position[2])).toBeCloseTo(radius);
  });

  it('rotationY aponta para o centro', () => {
    for (const p of ps) {
      // frente do avatar (+Z rotacionado por rotationY)
      const dir = [Math.sin(p.rotationY), Math.cos(p.rotationY)];
      const dot = (p.position[0] * dir[0] + p.position[2] * dir[1]) / radius;
      expect(dot).toBeCloseTo(-1);
    }
  });

  it('membros igualmente espaçados', () => {
    const ang = ps.slice(1).map((p) => Math.atan2(p.position[0], p.position[2]));
    const gaps = ang.slice(1).map((a, i) => (a - ang[i] + 2 * Math.PI) % (2 * Math.PI));
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]);
  });

  it('raio explícito é respeitado', () => {
    expect(Math.hypot(...(seatPositions(3, 4)[1].position.filter((_, i) => i !== 1) as [number, number]))).toBeCloseTo(4);
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
