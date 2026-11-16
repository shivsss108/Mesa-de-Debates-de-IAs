import { afterEach, describe, expect, it, vi } from 'vitest';
import { allow, quickConfig, quickSetup } from '@/quick/quick';

const req = (ip: string) => new Request('http://x/api/quick', { headers: { 'x-forwarded-for': ip } });
const env = () => {
  vi.stubEnv('NVIDIA_API_KEY', 'nv-key');
  vi.stubEnv('MESA_QUICK_MODEL', 'nvidia/nemotron-x');
};
afterEach(() => vi.unstubAllEnvs());

describe('debate rápido', () => {
  it('config: 4 assentos e moderador no modelo do servidor; mesma semente, mesma mesa', () => {
    const a = quickConfig('  tema  ', 7, 'nvidia/nemotron-x');
    expect(a).toEqual(quickConfig('tema', 7, 'nvidia/nemotron-x'));
    expect(a.seats).toHaveLength(4);
    expect([a.moderador, ...a.seats].every((s) => s.provider === 'nvidia' && s.model === 'nvidia/nemotron-x')).toBe(true);
    expect(a.seats.every((s) => 'presetId' in s.temperamento && s.temperamento.presetId)).toBe(true);
    expect(a.dossie).toBeUndefined();
    expect(JSON.stringify(quickConfig('tema', 8, 'm').seats)).not.toBe(JSON.stringify(quickConfig('tema', 7, 'm').seats));
  });

  it('sem chave NVIDIA no servidor: indisponível', async () => {
    vi.stubEnv('NVIDIA_API_KEY', '');
    expect(await quickSetup(req('1.1.1.1'), 'tema', 1)).toMatchObject({ status: 404 });
  });

  it('com chave: devolve a chave do servidor e a config montada', async () => {
    env();
    const q = await quickSetup(req('2.2.2.2'), 'tema', 1);
    expect(q).toMatchObject({ key: 'nv-key', config: { tema: 'tema', maxTurns: 2 } });
  });

  it('recusa tema vazio, tema longo e semente não inteira', async () => {
    env();
    for (const [tema, seed] of [['', 1], ['x'.repeat(301), 1], [42, 1], ['tema', 1.5], ['tema', null]] as const)
      expect(await quickSetup(req('3.3.3.3'), tema, seed)).toMatchObject({ status: 400 });
  });

  it('limite por IP: o 61º passo na mesma hora leva 429; outro IP segue passando', async () => {
    env();
    for (let i = 0; i < 60; i++) expect(await quickSetup(req('4.4.4.4'), 'tema', 1, 1000)).toHaveProperty('config');
    expect(await quickSetup(req('4.4.4.4'), 'tema', 1, 1000)).toMatchObject({ status: 429 });
    expect(await quickSetup(req('5.5.5.5'), 'tema', 1, 1000)).toHaveProperty('config');
  });

  it('a janela do limite reabre depois de uma hora', () => {
    expect(allow('k', 1, 0)).toBe(true);
    expect(allow('k', 1, 10)).toBe(false);
    expect(allow('k', 1, 3_600_000)).toBe(true);
  });
});
