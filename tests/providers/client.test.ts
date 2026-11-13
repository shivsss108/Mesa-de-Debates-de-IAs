import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, ProviderError } from '@/providers/client';

afterEach(() => vi.unstubAllGlobals());

const req = { provider: 'groq' as const, model: 'm', messages: [{ role: 'user' as const, content: 'oi' }], apiKey: 'SECRET' };

async function collect(it: AsyncIterable<string>) {
  const out: string[] = [];
  for await (const t of it) out.push(t);
  return out;
}

describe('chat', () => {
  it('emite os deltas do stream SSE', async () => {
    const sse =
      ['Oi', ' mundo'].map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') +
      'data: [DONE]\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { headers: { 'content-type': 'text/event-stream' } })));
    expect(await collect(chat(req))).toEqual(['Oi', ' mundo']);
  });

  it('429 vira ProviderError com status, sem vazar a chave', async () => {
    const body = '{"error":{"message":"rate limited"}}';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 429, headers: { 'content-type': 'application/json' } })));
    const err = await collect(chat(req)).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(429);
    expect(err.message).not.toContain('SECRET');
  });
});
