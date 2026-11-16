import { runStep } from '@/engine/step';
import { validateStepBody } from '@/engine/validate';
import { chat } from '@/providers/client';
import { QUICK_STATE_MAX, quickSetup } from '@/quick/quick';

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
  const { state, seqStart } = v.value;
  let { config, keys } = v.value;
  // debate rápido: config e chave são do servidor; do cliente só valem o tema, a semente e o estado (com teto)
  const seed = (body as { quick?: unknown }).quick;
  if (seed !== undefined) {
    if (JSON.stringify(state).length > QUICK_STATE_MAX) return Response.json({ error: 'Estado grande demais.' }, { status: 400 });
    const q = await quickSetup(req, config.tema, seed);
    if ('error' in q) return Response.json({ error: q.error }, { status: q.status });
    config = q.config;
    keys = { nvidia: q.key };
  }

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
        // debate rápido: sem raciocínio, para o passo caber nos 60 s
        const ask: typeof chat = seed === undefined ? chat : (r) => chat({ ...r, noThink: true });
        const gen = runStep(config, state, { chat: ask, keys, now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), signal: req.signal }, seqStart);
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
