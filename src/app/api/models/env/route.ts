import { connection } from 'next/server';
import { PROVIDERS } from '@/providers/table';
import type { ProviderId } from '@/types';

/** Só os ids dos provedores com chave no servidor; nunca os valores. */
export async function GET() {
  await connection(); // lê o env a cada requisição, não no build
  const ids = (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => !!process.env[PROVIDERS[p].envKey]);
  return Response.json(ids);
}
