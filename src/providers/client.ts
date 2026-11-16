import OpenAI from 'openai';
import type { ProviderId } from '@/types';
import { PROVIDERS } from './table';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatFn = (req: {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  apiKey: string;
  signal?: AbortSignal;
  maxTokens?: number;
  /** pede ao modelo para não raciocinar antes de responder (NIM: chat_template_kwargs.enable_thinking) */
  noThink?: boolean;
}) => AsyncIterable<string>;

export class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

/** Nunca inclui a chave: usa só status e mensagem do provedor. */
function toProviderError(e: unknown): Error {
  if (e instanceof ProviderError) return e;
  if (e instanceof OpenAI.APIUserAbortError) return e;
  if (e instanceof Error && e.name === 'AbortError') return e;
  const status = e instanceof OpenAI.APIError ? e.status : undefined;
  const msg = e instanceof Error ? e.message : 'falha desconhecida';
  return new ProviderError(status ? `HTTP ${status}: ${msg}` : msg, status);
}

export const chat: ChatFn = async function* ({ provider, model, messages, apiKey, signal, maxTokens, noThink }) {
  // maxRetries 0: o backoff é responsabilidade do motor de debate.
  const client = new OpenAI({
    apiKey,
    baseURL: PROVIDERS[provider].baseURL,
    dangerouslyAllowBrowser: false,
    maxRetries: 0,
    timeout: 20_000,
  });
  const t0 = Date.now();
  let first = 0;
  let chars = 0;
  let pensou = 0; // raciocínio fora de `content` (reasoning_content): não aparece, mas custa tempo e tokens
  try {
    const stream = await client.chat.completions.create(
      {
        model, messages, stream: true, ...(maxTokens ? { max_tokens: maxTokens } : {}),
        // campo fora do tipo da OpenAI; medido no nemotron-3-ultra: 1º token de ~5,7 s para ~0,5 s
        ...(noThink ? ({ chat_template_kwargs: { enable_thinking: false } } as object) : {}),
      },
      { signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as { content?: string | null; reasoning_content?: string; reasoning?: string } | undefined;
      pensou += (delta?.reasoning_content ?? delta?.reasoning ?? '').length;
      const text = delta?.content;
      if (text) {
        first ||= Date.now();
        chars += text.length;
        yield text;
      }
    }
    console.info(`[chat] ${provider}/${model}: 1º token ${first ? first - t0 : '—'} ms, total ${Date.now() - t0} ms, ${chars} chars, raciocínio ${pensou} chars`);
  } catch (e) {
    const err = toProviderError(e);
    // alguns provedores ecoam a chave no erro 401; o motivo agora vai para a transcrição
    if (apiKey && err.message.includes(apiKey)) err.message = err.message.split(apiKey).join('***');
    throw err;
  }
};
