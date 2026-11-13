import { describe, expect, it, vi } from 'vitest';

vi.mock('@/engine/step', () => ({
  runStep: async function* () {
    yield { type: 'token', speaker: 'a', text: 'oi', seq: 5, t: 0 };
    return { done: true, history: [], lastCallAt: {} };
  },
}));

import { POST } from '@/app/api/debate/step/route';
import { validateStepBody } from '@/engine/validate';

const seat = (id: string, provider = 'groq') => ({ id, nome: id, provider, model: 'm', temperamento: { presetId: 'x' }, expertise: { presetId: 'y' } });
const body = (over: Record<string, unknown> = {}, seats = [seat('a'), seat('b')]) => ({
  config: { tema: 't', idioma: 'pt', maxTurns: 20, moderador: { provider: 'groq', model: 'm', provocacao: 'media' }, seats, ...over },
  state: { history: [], lastCallAt: {} },
  keys: {},
  seqStart: 5,
});

describe('validateStepBody', () => {
  it('aceita corpo válido', () => expect(validateStepBody(body()).ok).toBe(true));
  it('rejeita 1 e 9 seats', () => {
    expect(validateStepBody(body({}, [seat('a')])).ok).toBe(false);
    expect(validateStepBody(body({}, Array.from({ length: 9 }, (_, i) => seat('s' + i)))).ok).toBe(false);
  });
  it('rejeita ids duplicados, moderador, provider xai, maxTurns 100, tema vazio', () => {
    expect(validateStepBody(body({}, [seat('a'), seat('a')])).ok).toBe(false);
    expect(validateStepBody(body({}, [seat('a'), seat('moderador')])).ok).toBe(false);
    expect(validateStepBody(body({}, [seat('a'), seat('b', 'xai')])).ok).toBe(false);
    expect(validateStepBody(body({ maxTurns: 100 })).ok).toBe(false);
    expect(validateStepBody(body({ tema: '  ' })).ok).toBe(false);
    expect(validateStepBody(null).ok).toBe(false);
  });
});

describe('POST /api/debate/step', () => {
  const req = (b: unknown) => new Request('http://x/api/debate/step', { method: 'POST', body: JSON.stringify(b) });
  it('400 em corpo inválido', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
  it('stream com data: e termina com event: state', async () => {
    const res = await POST(req(body()));
    const text = await res.text();
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(text).toContain('data: {"type":"token"');
    expect(text.trimEnd().split('\n\n').pop()).toMatch(/^event: state\ndata: \{/);
  });
});
