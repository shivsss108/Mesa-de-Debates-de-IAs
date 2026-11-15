import { describe, expect, it } from 'vitest';
import { defaultRadius, seatPositions, studioSize, type SeatPose } from '@/scene/layout';
import demo from '@/replays/demo-1.json';
import { parseReplay } from '@/client/replay';
import { initialScene, sceneReducer } from '@/scene/sceneReducer';

const dist = (a: SeatPose, b: SeatPose) => Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
const NS = [2, 3, 4, 5, 6, 7, 8, 9];

describe('seatPositions (arco aberto para a câmera)', () => {
  it('moderador no fundo, olhando para +Z', () => {
    for (const n of NS) {
      const r = defaultRadius(n);
      const ps = seatPositions(n, r);
      expect(ps).toHaveLength(n);
      expect(ps[0].position[0]).toBeCloseTo(0);
      expect(ps[0].position[2]).toBeCloseTo(-r);
      expect(ps[0].rotationY).toBeCloseTo(0);
    }
  });

  it('membros no raio, olhando para a origem, nenhum de costas para a câmera (z <= 0.25·r)', () => {
    for (const n of NS) {
      const r = defaultRadius(n);
      for (const p of seatPositions(n, r).slice(1)) {
        const [x, , z] = p.position;
        expect(Math.hypot(x, z)).toBeCloseTo(r);
        expect((x * Math.sin(p.rotationY) + z * Math.cos(p.rotationY)) / r).toBeCloseTo(-1);
        expect(z, `n=${n}`).toBeLessThanOrEqual(0.25 * r);
      }
    }
  });

  it('dos dois lados do moderador, simétricos, extra à esquerda', () => {
    for (const n of NS) {
      const ms = seatPositions(n, defaultRadius(n)).slice(1).map((p) => p.position);
      const left = ms.filter(([x]) => x < 0);
      const right = ms.filter(([x]) => x > 0);
      expect(left.length - right.length, `n=${n}`).toBe((n - 1) % 2);
      // espelho, de dentro para fora
      const l = [...left].reverse();
      right.forEach(([x, , z], i) => {
        expect(x).toBeCloseTo(-l[i][0]);
        expect(z).toBeCloseTo(l[i][2]);
      });
    }
  });

  it('ordem dos assentos = esquerda → direita vista da câmera (borda do piso, +Z)', () => {
    for (const n of NS) {
      const camZ = studioSize(defaultRadius(n)) / 2;
      const xs = seatPositions(n, defaultRadius(n)).slice(1).map(({ position: [x, , z] }) => Math.atan2(x, camZ - z));
      for (let i = 1; i < xs.length; i++) expect(xs[i], `n=${n}`).toBeGreaterThan(xs[i - 1]);
    }
  });

  it('espaçamento >= 1.1 entre todos, inclusive o moderador', () => {
    for (const n of NS) {
      const s = seatPositions(n, defaultRadius(n));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(dist(s[i], s[j]), `n=${n} ${i}-${j}`).toBeGreaterThanOrEqual(1.1);
    }
  });

  it('studioSize cabe o arco', () => {
    for (const n of NS) expect(studioSize(defaultRadius(n))).toBeGreaterThan(2 * defaultRadius(n) + 4);
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
