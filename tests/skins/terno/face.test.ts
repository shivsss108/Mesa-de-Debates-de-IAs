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

const SKIN = '#e0b89a';

type Shape = { kind: 'fill' | 'stroke' | 'rect'; style: string; ops: { k: string; a: number[] }[] };

/** ctx falso estruturado: cada fill/stroke/fillRect vira uma forma com a cor vigente no momento. */
function shapes(emotion: Parameters<typeof drawFace>[1], opts: Parameters<typeof drawFace>[2]): Shape[] {
  const out: Shape[] = [];
  let fillStyle = '', strokeStyle = '', cur: Shape['ops'] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_, k) => (...a: unknown[]) => {
      const n = a as number[];
      if (k === 'beginPath') cur = [];
      else if (k === 'fill') out.push({ kind: 'fill', style: fillStyle, ops: cur });
      else if (k === 'stroke') out.push({ kind: 'stroke', style: strokeStyle, ops: cur });
      else if (k === 'fillRect') out.push({ kind: 'rect', style: fillStyle, ops: [{ k: 'rect', a: n }] });
      else cur.push({ k: String(k), a: n });
    },
    set: (_, k, v) => {
      if (k === 'fillStyle') fillStyle = String(v);
      if (k === 'strokeStyle') strokeStyle = String(v);
      return true;
    },
  });
  drawFace(ctx as unknown as CanvasRenderingContext2D, emotion, opts);
  return out;
}
const ys = (s: Shape) => s.ops.flatMap((o) => (o.k === 'ellipse' ? [o.a[1]] : o.a.filter((_, i) => i % 2 === 1)));
const ell = (sh: Shape[], style: string) => sh.filter((s) => s.kind === 'fill' && s.style === style && s.ops[0]?.k === 'ellipse');
const SCLERA = '#f6f4ee', IRIS = '#3b2a1e', HILITE = '#fff', MOUTH = '#3a0f14', TEETH = '#f8f6f0', BROW = '#2a1a12';

describe('drawFace', () => {
  const base = { blink: false, mouthOpen: 0, offline: false, skin: SKIN };

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

  it('fundo pintado com a cor da pele', () => {
    const [bg] = shapes('neutro', base);
    expect(bg).toMatchObject({ kind: 'rect', style: SKIN });
  });

  it('sobrancelhas aparecem em todas as 8 emoções', () => {
    for (const e of EMOTIONS) {
      const brows = shapes(e, base).filter((s) => s.kind === 'stroke' && s.style === BROW && ys(s).every((y) => y < -20));
      expect(brows.length, e).toBeGreaterThanOrEqual(2);
    }
  });

  it('olho aberto: esclera, íris e brilho; piscar troca por pálpebra', () => {
    const open = shapes('neutro', base);
    expect(ell(open, SCLERA)).toHaveLength(2);
    expect(ell(open, IRIS)).toHaveLength(2);
    expect(ell(open, HILITE).length).toBeGreaterThanOrEqual(2);
    const blink = shapes('neutro', { ...base, blink: true });
    expect(ell(blink, SCLERA)).toHaveLength(0);
    expect(ell(blink, IRIS)).toHaveLength(0);
    expect(blink.filter((s) => s.kind === 'stroke' && s.style === BROW && ys(s).some((y) => y > -20 && y < 0)).length).toBeGreaterThanOrEqual(2);
  });

  it('boca aberta cresce com mouthOpen e mostra dentes a partir de 2/3', () => {
    const h = (m: number) => ell(shapes('neutro', { ...base, mouthOpen: m }), MOUTH).map((s) => s.ops[0].a[3]);
    const [a, b, c] = [1 / 3, 2 / 3, 1].map(h);
    expect(a).toHaveLength(1);
    expect(a[0]).toBeLessThan(b[0]);
    expect(b[0]).toBeLessThan(c[0]);
    const teeth = (m: number) => shapes('neutro', { ...base, mouthOpen: m }).filter((s) => s.kind === 'rect' && s.style === TEETH).length;
    expect([0, 1 / 3, 2 / 3, 1].map(teeth)).toEqual([0, 0, 1, 1]);
  });

  it('boca fechada tem lábios por emoção; offline só desenha o chuvisco', () => {
    for (const e of EMOTIONS) expect(shapes(e, base).some((s) => s.kind === 'stroke' && s.style !== BROW), e).toBe(true);
    const off = shapes('feliz', { ...base, offline: true });
    expect(off.every((s) => s.kind === 'rect')).toBe(true);
    expect(off[0].style).toBe(SKIN);
  });
});
