import { describe, expect, it } from 'vitest';
import { isDebateModel, modelParams, modelScore } from '@/providers/models';

describe('modelParams', () => {
  it('lê o maior tamanho em bilhões', () => {
    expect(modelParams('llama-3.3-70b-versatile')).toBe(70);
    expect(modelParams('qwen/qwen3-235b-a22b')).toBe(235);
    expect(modelParams('mixtral-8x7b-32768')).toBe(56);
    expect(modelParams('kimi-k2-instruct')).toBeUndefined();
  });
});

describe('isDebateModel', () => {
  it('descarta código, visão, recompensa e modelos minúsculos', () => {
    for (const id of ['qwen/qwen2.5-coder-32b-instruct', 'meta/llama-3.2-90b-vision-instruct', 'nvidia/llama-3.1-nemotron-70b-reward', 'meta/llama-3.2-1b-instruct', 'nvidia/nemotron-nano-8b', 'mistralai/codestral-22b'])
      expect(isDebateModel(id), id).toBe(false);
    for (const id of ['deepseek-ai/deepseek-r1', 'meta/llama-3.1-405b-instruct', 'llama-3.1-8b-instant'])
      expect(isDebateModel(id), id).toBe(true);
  });
});

describe('modelScore', () => {
  it('ordena forte > médio > pequeno', () => {
    expect(modelScore('meta/llama-3.1-405b-instruct')).toBeGreaterThan(modelScore('llama-3.3-70b-versatile'));
    expect(modelScore('llama-3.3-70b-versatile')).toBeGreaterThan(modelScore('llama-3.1-8b-instant'));
  });
});
