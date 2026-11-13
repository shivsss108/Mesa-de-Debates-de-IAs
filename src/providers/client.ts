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

export const chat: ChatFn = async function* ({ provider, model, messages, apiKey, signal, maxTokens }) {
  // maxRetries 0: o backoff é responsabilidade do motor de debate.
  const client = new OpenAI({
    apiKey,
    baseURL: PROVIDERS[provider].baseURL,
    dangerouslyAllowBrowser: false,
    maxRetries: 0,
  });
  try {
    const stream = await client.chat.completions.create(
      { model, messages, stream: true, ...(maxTokens ? { max_tokens: maxTokens } : {}) },
      { signal },
    );
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  } catch (e) {
    throw toProviderError(e);
  }
};
