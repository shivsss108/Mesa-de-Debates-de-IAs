import { describe, expect, it } from 'vitest';
import { EMOTIONS } from '@/types';
import { drawFace } from '@/skins/terno/face';

/** ctx falso que registra cada chamada/atribuição — basta para comparar desenhos. */
function recorder() {
  const log: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_, k) => (...a: unknown[]) => void log.push(`${String(k)}(${a.map((x) => (typeof x === 'number' ? x.toFixed(1) : x)).join(',')})`),
    set: (_, k, v) => (log.push(`${String(k)}=${v}`), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

const draw = (...a: Parameters<typeof drawFace> extends [unknown, ...infer R] ? R : never) => {
  const r = recorder();
  drawFace(r.ctx, ...a);
  return r.log.join(';');
};

describe('drawFace', () => {
  const base = { blink: false, mouthOpen: 0, offline: false };

  it('as 8 emoções desenham rostos distintos', () => {
    const faces = EMOTIONS.map((e) => draw(e, base));
    expect(new Set(faces).size).toBe(EMOTIONS.length);
  });

  it('piscar, boca aberta e offline mudam o desenho', () => {
    const n = draw('neutro', base);
    expect(draw('neutro', { ...base, blink: true })).not.toBe(n);
    expect(draw('neutro', { ...base, mouthOpen: 1 })).not.toBe(n);
    expect(draw('neutro', { ...base, offline: true })).not.toBe(n);
  });
});
