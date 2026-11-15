import { ProviderError, type ChatFn, type ChatMessage } from '@/providers/client';
import { PROVIDERS } from '@/providers/table';
import { afterThink } from '@/engine/step';
import type { ProviderId } from '@/types';

export type LlmTarget = {
  chat: ChatFn;
  provider: ProviderId;
  model: string;
  apiKey: string;
  signal?: AbortSignal;
  /** espera entre tentativas (injetável nos testes); padrão: setTimeout */
  sleep?: (ms: number) => Promise<void>;
};

export const isKeyError = (e: unknown) => e instanceof ProviderError && (e.status === 401 || e.status === 403);

/** Uma chamada não-streaming: concatena o stream e remove o `<think>` inicial. 401/403 viram "Chave inválida". */
export async function ask(t: LlmTarget, messages: ChatMessage[], maxTokens = 1500): Promise<string> {
  try {
    let out = '';
    for await (const c of t.chat({ provider: t.provider, model: t.model, messages, apiKey: t.apiKey, signal: t.signal, maxTokens }))
      out += c;
    return afterThink(out) ?? '';
  } catch (e) {
    if (isKeyError(e)) throw new Error(`Chave inválida para ${PROVIDERS[t.provider].nome}.`);
    throw e;
  }
}

/** Erros que sobem em vez de virar fallback: chave recusada e abort. */
export const isFatal = (e: unknown, t: LlmTarget) =>
  (e instanceof Error && e.message.startsWith('Chave inválida para ')) || !!t.signal?.aborted;

export const pause = (t: LlmTarget) =>
  (t.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))))(PROVIDERS[t.provider].minIntervalMs);
