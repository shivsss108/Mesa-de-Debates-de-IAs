import type { ProviderId } from '@/types';
import { PROVIDERS } from './table';

export interface CatalogModel { provider: ProviderId; id: string; free: boolean }
type Keys = Partial<Record<ProviderId, string>>;
type FetchModels = (p: ProviderId, key: string) => Promise<string[]>;

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<ProviderId, { at: number; ids: string[] }>();

export function resetCatalogCache() {
  cache.clear();
}

/** Chaves do servidor só em dev ou com opt-in explícito: num deploy público, qualquer visitante as usaria. */
export function envKeysAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.MESA_ALLOW_ENV_KEYS === '1';
}

export function resolveKey(p: ProviderId, keys: Keys): string | undefined {
  return keys[p] || (envKeysAllowed() ? process.env[PROVIDERS[p].envKey] : undefined) || undefined;
}

const defaultFetchModels: FetchModels = async (p, key) => {
  const res = await fetch(`${PROVIDERS[p].baseURL}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { id: string }[] };
  // Google devolve ids como "models/gemini-..."
  return (json.data ?? []).map((m) => m.id.replace(/^models\//, ''));
};

export async function getCatalog(
  keys: Keys,
  fetchModels: FetchModels = defaultFetchModels,
  now: () => number = Date.now,
): Promise<{ models: CatalogModel[]; errors: { provider: ProviderId; message: string }[] }> {
  const models: CatalogModel[] = [];
  const errors: { provider: ProviderId; message: string }[] = [];
  await Promise.all(
    (Object.keys(PROVIDERS) as ProviderId[]).map(async (p) => {
      const key = resolveKey(p, keys);
      if (!key) return;
      let hit = cache.get(p);
      if (!hit || now() - hit.at >= TTL_MS) {
        try {
          hit = { at: now(), ids: await fetchModels(p, key) };
          cache.set(p, hit);
        } catch (e) {
          // a mensagem nunca carrega a chave
          errors.push({ provider: p, message: e instanceof Error ? e.message : 'falha ao listar modelos' });
          return;
        }
      }
      for (const id of hit.ids) models.push({ provider: p, id, free: PROVIDERS[p].isFree(id) });
    }),
  );
  return { models, errors };
}
