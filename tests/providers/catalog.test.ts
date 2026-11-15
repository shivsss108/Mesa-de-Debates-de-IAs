import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCatalog, resetCatalogCache, resolveKey } from '@/providers/catalog';
import { isDebateModel as isChatModel } from '@/providers/models';

beforeEach(() => {
  resetCatalogCache();
  vi.unstubAllEnvs();
  for (const k of ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY', 'NVIDIA_API_KEY', 'GOOGLE_API_KEY', 'CEREBRAS_API_KEY']) {
    vi.stubEnv(k, '');
  }
});

const keys = { openrouter: 'k1', groq: 'k2' };

describe('resolveKey', () => {
  it('chave do cliente vence; env só fora de produção ou com MESA_ALLOW_ENV_KEYS=1', () => {
    vi.stubEnv('GROQ_API_KEY', 'env-k');
    expect(resolveKey('groq', { groq: 'cli' })).toBe('cli');
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveKey('groq', {})).toBe('env-k');
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveKey('groq', {})).toBeUndefined();
    expect(resolveKey('groq', { groq: 'cli' })).toBe('cli');
    vi.stubEnv('MESA_ALLOW_ENV_KEYS', '1');
    expect(resolveKey('groq', {})).toBe('env-k');
  });
});

describe('getCatalog', () => {
  it('marca free corretamente e omite provider sem chave', async () => {
    const fetchModels = vi.fn(async (p: string) => (p === 'openrouter' ? ['a:free', 'b'] : ['llama']));
    const { models, errors } = await getCatalog(keys, fetchModels);
    expect(errors).toEqual([]);
    expect(models).toContainEqual({ provider: 'openrouter', id: 'a:free', free: true });
    expect(models).toContainEqual({ provider: 'openrouter', id: 'b', free: false });
    expect(models).toContainEqual({ provider: 'groq', id: 'llama', free: true });
    expect(models.some((m) => m.provider === 'mistral')).toBe(false);
    expect(fetchModels).toHaveBeenCalledTimes(2);
  });

  it('erro de um provider vai para errors e os demais permanecem', async () => {
    const fetchModels = async (p: string) => {
      if (p === 'groq') throw new Error('HTTP 401');
      return ['x:free'];
    };
    const { models, errors } = await getCatalog(keys, fetchModels);
    expect(errors).toEqual([{ provider: 'groq', message: 'HTTP 401' }]);
    expect(models.map((m) => m.provider)).toEqual(['openrouter']);
  });

  it('usa cache por 10 min', async () => {
    const fetchModels = vi.fn(async () => ['m']);
    let t = 1000;
    const now = () => t;
    await getCatalog({ groq: 'k' }, fetchModels, now);
    t += 9 * 60_000;
    await getCatalog({ groq: 'k' }, fetchModels, now);
    expect(fetchModels).toHaveBeenCalledTimes(1);
    t += 2 * 60_000;
    await getCatalog({ groq: 'k' }, fetchModels, now);
    expect(fetchModels).toHaveBeenCalledTimes(2);
  });
});

describe('isChatModel', () => {
  it('esconde modelos de voz, classificadores e agentes; mantém os de conversa', () => {
    for (const id of ['canopylabs/orpheus-arabic-saudi', 'openai/gpt-oss-safeguard-20b', 'meta-llama/llama-guard-4-12b', 'whisper-large-v3', 'playai-tts', 'groq/compound', 'nvidia/nv-embedqa-e5-v5'])
      expect(isChatModel(id), id).toBe(false);
    for (const id of ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'meta/llama-3.3-70b-instruct', 'moonshotai/kimi-k2-instruct'])
      expect(isChatModel(id), id).toBe(true);
  });

  it('getCatalog não lista modelos que não conversam', async () => {
    resetCatalogCache();
    const { models } = await getCatalog({ groq: 'k' }, async () => ['llama-3.3-70b-versatile', 'playai-tts']);
    expect(models.map((m) => m.id)).toEqual(['llama-3.3-70b-versatile']);
  });
});
