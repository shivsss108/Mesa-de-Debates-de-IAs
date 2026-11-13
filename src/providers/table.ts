import type { ProviderId } from '@/types';

export interface ProviderInfo {
  id: ProviderId;
  nome: string;
  baseURL: string;
  envKey: string;
  keyUrl: string;
  minIntervalMs: number;
  isFree: (modelId: string) => boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  groq: {
    id: 'groq', nome: 'Groq', baseURL: 'https://api.groq.com/openai/v1', envKey: 'GROQ_API_KEY',
    keyUrl: 'https://console.groq.com/keys', minIntervalMs: 2000, isFree: () => true,
  },
  nvidia: {
    id: 'nvidia', nome: 'NVIDIA NIM', baseURL: 'https://integrate.api.nvidia.com/v1', envKey: 'NVIDIA_API_KEY',
    keyUrl: 'https://build.nvidia.com/settings/api-keys', minIntervalMs: 1500, isFree: () => true,
  },
  openrouter: {
    id: 'openrouter', nome: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', envKey: 'OPENROUTER_API_KEY',
    keyUrl: 'https://openrouter.ai/keys', minIntervalMs: 3000, isFree: (id) => id.endsWith(':free'),
  },
  google: {
    id: 'google', nome: 'Google AI Studio', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GOOGLE_API_KEY', keyUrl: 'https://aistudio.google.com/apikey', minIntervalMs: 4000,
    isFree: (id) => /flash|gemma/i.test(id),
  },
  mistral: {
    id: 'mistral', nome: 'Mistral', baseURL: 'https://api.mistral.ai/v1', envKey: 'MISTRAL_API_KEY',
    keyUrl: 'https://console.mistral.ai/api-keys', minIntervalMs: 1000, isFree: () => true, // tier de experimentação
  },
  cerebras: {
    id: 'cerebras', nome: 'Cerebras', baseURL: 'https://api.cerebras.ai/v1', envKey: 'CEREBRAS_API_KEY',
    keyUrl: 'https://cloud.cerebras.ai/platform', minIntervalMs: 2000, isFree: () => true,
  },
};
