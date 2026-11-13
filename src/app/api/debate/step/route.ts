import { runStep } from '@/engine/step';
import { validateStepBody } from '@/engine/validate';
import { chat } from '@/providers/client';

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const v = validateStepBody(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  const { config, state, keys, seqStart } = v.value;

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (s: string) => ctrl.enqueue(enc.encode(s));
      let next = state;
      try {
        const gen = runStep(config, state, { chat, keys, now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), signal: req.signal }, seqStart);
        for (;;) {
          const r = await gen.next();
          if (r.done) {
            next = r.value;
            break;
          }
          send(`data: ${JSON.stringify(r.value)}\n\n`);
        }
      } catch {
        // mensagem genérica: nunca ecoar detalhes que possam conter chaves
        send(`data: ${JSON.stringify({ type: 'error', message: 'Falha interna ao executar o passo.', seq: seqStart, t: 0 })}\n\n`);
      }
      send(`event: state\ndata: ${JSON.stringify(next)}\n\n`);
      ctrl.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
