import { bestOf } from '@/app/config/assignModels';
import { TEMA_MAX } from '@/engine/prompts';
import { defaultNames, randomizePersonalities } from '@/presets/randomize';
import { getCatalog } from '@/providers/catalog';
import type { DebateConfig } from '@/types';

// Debate rápido: o visitante só manda o tema; mesa, modelos e chave são do servidor.
export const QUICK_SEATS = 4;
export const QUICK_TURNS = 2;
/** teto do `state` que o cliente devolve a cada passo (vira prompt pago com a chave do servidor) */
export const QUICK_STATE_MAX = 40_000;
/** a pesquisa do debate rápido: só busca de notícias, nada enviado pelo visitante */
export const REPERTORIO_RAPIDO = { busca: true, links: [], textos: [], modo: 'todos' as const };
const PER_IP = 60; // passos por hora: uns 3 debates
const GLOBAL = 600;
const HOUR = 3_600_000;

/** Só a chave NVIDIA do servidor, e só por este caminho: não depende de `envKeysAllowed`. */
export const quickKey = () => process.env.NVIDIA_API_KEY?.trim() || undefined;

/** `MESA_QUICK_MODEL`, senão o melhor Nemotron do catálogo, senão o melhor modelo NVIDIA. */
export async function quickModel(key: string): Promise<string | undefined> {
  const fixed = process.env.MESA_QUICK_MODEL?.trim();
  if (fixed) return fixed;
  const nvidia = (await getCatalog({ nvidia: key })).models.filter((m) => m.provider === 'nvidia');
  return (bestOf(nvidia.filter((m) => /nemotron/i.test(m.id)), 'nvidia') ?? bestOf(nvidia, 'nvidia'))?.model;
}

/** mulberry32: a mesma semente monta a mesma mesa em todos os passos. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quickConfig(tema: string, seed: number, model: string): DebateConfig {
  const m = { provider: 'nvidia' as const, model };
  const seats = randomizePersonalities(
    defaultNames(QUICK_SEATS).map((nome, i) => ({ id: `m${i + 1}`, nome, ...m, temperamento: { presetId: '' }, expertise: { presetId: '' } })),
    rng(seed),
  );
  return { tema: tema.trim().slice(0, TEMA_MAX), idioma: 'pt-BR', maxTurns: QUICK_TURNS, moderador: { ...m, provocacao: 'media' }, seats };
}

// ponytail: contador em memória, por instância — em serverless cada instância conta sozinha e um cold start zera.
// Segura abuso casual; para limite de verdade, trocar por um contador compartilhado (Upstash/Vercel KV).
const hits = new Map<string, { at: number; n: number }>();
export function allow(key: string, max: number, now = Date.now()): boolean {
  if (hits.size > 10_000) hits.clear();
  const h = hits.get(key);
  if (!h || now - h.at >= HOUR) return hits.set(key, { at: now, n: 1 }), true;
  return ++h.n <= max;
}

type Setup = { config: DebateConfig; key: string } | { error: string; status: number };

/** Valida o pedido, aplica o limite de uso e devolve a config montada no servidor (nada dela vem do cliente além do tema). */
export async function quickSetup(req: Request, tema: unknown, seed: unknown, now = Date.now()): Promise<Setup> {
  const key = quickKey();
  if (!key) return { error: 'Debate rápido indisponível neste servidor.', status: 404 };
  if (typeof tema !== 'string' || !tema.trim() || tema.length > TEMA_MAX) return { error: `Tema inválido (1 a ${TEMA_MAX} caracteres).`, status: 400 };
  if (!Number.isInteger(seed)) return { error: 'seed inválida.', status: 400 };
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (!allow(`ip:${ip}`, PER_IP, now) || !allow('global', GLOBAL, now))
    return { error: 'Muitos debates rápidos por agora. Tente de novo mais tarde.', status: 429 };
  const model = await quickModel(key).catch(() => undefined);
  if (!model) return { error: 'Nenhum modelo NVIDIA disponível agora.', status: 503 };
  return { config: quickConfig(tema, seed as number, model), key };
}
