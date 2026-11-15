import { validateDossie } from '@/engine/validate';
import { chat } from '@/providers/client';
import { resolveKey } from '@/providers/catalog';
import { PROVIDERS } from '@/providers/table';
import { cleanKeys } from '@/research/pipeline';
import { buildRecortes } from '@/research/recortes';
import type { Dossie, ProviderId, Seat } from '@/types';

export const maxDuration = 60;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const err = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('JSON inválido.');
  }
  if (!isObj(body)) return err('Corpo inválido.');
  const { dossie, seats, moderador, keys } = body;
  const e = validateDossie(dossie);
  if (e) return err(e);
  if (
    !Array.isArray(seats) || seats.length < 1 || seats.length > 8 ||
    !seats.every((s) => isObj(s) && typeof s.id === 'string' && typeof s.nome === 'string' && isObj(s.expertise) &&
      (typeof s.expertise.presetId === 'string' || typeof s.expertise.custom === 'string'))
  )
    return err('Membros inválidos.');
  if (!isObj(moderador) || typeof moderador.provider !== 'string' || !Object.hasOwn(PROVIDERS, moderador.provider) ||
    typeof moderador.model !== 'string' || !moderador.model.trim())
    return err('Moderador inválido.');
  const provider = moderador.provider as ProviderId;
  const apiKey = resolveKey(provider, cleanKeys(keys));
  if (!apiKey) return err(`Sem chave de API para ${PROVIDERS[provider].nome}.`);
  try {
    const recortes = await buildRecortes(dossie as Dossie, seats as Seat[], { chat, provider, model: moderador.model, apiKey, signal: req.signal });
    return Response.json({ recortes });
  } catch (x) {
    return err(x instanceof Error && x.message.startsWith('Chave inválida para ') ? x.message : 'Falha interna ao gerar recortes.', 500);
  }
}
