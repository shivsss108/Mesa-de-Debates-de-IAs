import { chat } from '@/providers/client';
import { resolveKey } from '@/providers/catalog';
import { PROVIDERS } from '@/providers/table';
import { parseResearchBody, runResearch } from '@/research/pipeline';

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const v = parseResearchBody(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  const { keys, ...input } = v.value;
  const { provider, model } = input.moderador;

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
      const fail = (message: string) => send(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      const apiKey = resolveKey(provider, keys);
      if (!apiKey) fail(`Sem chave de API para ${PROVIDERS[provider].nome}.`);
      else {
        try {
          const dossie = await runResearch(input, { t: { chat, provider, model, apiKey, signal: req.signal } }, (p) =>
            send(`event: progress\ndata: ${JSON.stringify(p)}\n\n`),
          );
          send(`event: dossie\ndata: ${JSON.stringify(dossie)}\n\n`);
        } catch (e) {
          // só a mensagem de chave é literal; o resto pode carregar hostnames/detalhes
          fail(e instanceof Error && e.message.startsWith('Chave inválida para ') ? e.message : 'Falha interna ao pesquisar.');
        }
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
