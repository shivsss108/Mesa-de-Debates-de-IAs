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
      // cliente desconectado: enqueue/close lançariam; não há mais a quem entregar
      const send = (s: string) => {
        if (req.signal.aborted) return;
        try {
          ctrl.enqueue(enc.encode(s));
        } catch {}
      };
      let sent = 0;
      try {
        const gen = runStep(config, state, { chat, keys, now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), signal: req.signal }, seqStart);
        for (;;) {
          const r = await gen.next();
          if (r.done) {
            send(`event: state\ndata: ${JSON.stringify(r.value)}\n\n`);
            break;
          }
          send(`data: ${JSON.stringify(r.value)}\n\n`);
          sent++;
        }
      } catch {
        // mensagem genérica: nunca ecoar detalhes que possam conter chaves.
        // Sem `event: state`: o cliente trata isso como fim do debate.
        send(`data: ${JSON.stringify({ type: 'error', message: 'Falha interna ao executar o passo.', seq: seqStart + sent, t: 0 })}\n\n`);
      }
      try {
        ctrl.close();
      } catch {}
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
