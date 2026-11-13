import { getCatalog } from '@/providers/catalog';
import { PROVIDERS } from '@/providers/table';
import type { ProviderId } from '@/types';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const raw = (body as { keys?: unknown } | null)?.keys;
  const keys: Partial<Record<ProviderId, string>> = {};
  if (raw && typeof raw === 'object') {
    for (const p of Object.keys(PROVIDERS) as ProviderId[]) {
      const k = (raw as Record<string, unknown>)[p];
      if (typeof k === 'string' && k) keys[p] = k;
    }
  }
  return Response.json(await getCatalog(keys));
}
