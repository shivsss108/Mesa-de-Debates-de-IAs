import { connection } from 'next/server';
import { quickKey, quickSetup } from '@/quick/quick';

/** A home só mostra o debate rápido quando o servidor tem a chave. */
export async function GET() {
  await connection(); // lê o env a cada requisição, não no build
  return Response.json({ enabled: !!quickKey() });
}

/** tema + seed → a config que o servidor vai usar (o cliente precisa dela para montar a cena). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { tema?: unknown; seed?: unknown } | null;
  const q = await quickSetup(req, body?.tema, body?.seed);
  if ('error' in q) return Response.json({ error: q.error }, { status: q.status });
  return Response.json({ config: q.config });
}
