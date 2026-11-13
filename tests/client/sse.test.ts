import { describe, expect, it } from 'vitest';
import { readSSE } from '@/client/sse';

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(new TextEncoder().encode(s));
      c.close();
    },
  });

describe('readSSE', () => {
  it('junta eventos cortados no meio de chunks', async () => {
    const out = [];
    for await (const e of readSSE(streamOf(['data: {"a"', ':1}\n', '\ndata: 2\n\nevent: st', 'ate\ndata: {"x":1}\n\n']))) out.push(e);
    expect(out).toEqual([
      { event: 'message', data: '{"a":1}' },
      { event: 'message', data: '2' },
      { event: 'state', data: '{"x":1}' },
    ]);
  });
});
