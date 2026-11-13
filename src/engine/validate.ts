import { PROVIDERS } from '@/providers/table';
import { MODERATOR_ID } from '@/types';
import type { DebateConfig, DebateState, ProviderId } from '@/types';

export type Keys = Partial<Record<ProviderId, string>>;
export interface StepBody { config: DebateConfig; state: DebateState; keys: Keys; seqStart: number }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isProvider = (p: unknown): p is ProviderId => typeof p === 'string' && Object.hasOwn(PROVIDERS, p);
const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function validateStepBody(body: unknown): { ok: true; value: StepBody } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  if (!isObj(body)) return bad('Corpo inválido.');
  const { config, state, keys, seqStart } = body;
  if (!isObj(config)) return bad('config ausente.');
  if (!str(config.tema)) return bad('Tema vazio.');
  if (!Number.isInteger(config.maxTurns) || (config.maxTurns as number) < 6 || (config.maxTurns as number) > 60)
    return bad('maxTurns deve estar entre 6 e 60.');
  const mod = config.moderador;
  if (!isObj(mod) || !isProvider(mod.provider) || !str(mod.model)) return bad('Moderador inválido.');
  const seats = config.seats;
  if (!Array.isArray(seats) || seats.length < 2 || seats.length > 8) return bad('A mesa deve ter de 2 a 8 membros.');
  const ids = new Set<string>();
  for (const s of seats) {
    if (!isObj(s) || !str(s.id) || s.id === MODERATOR_ID || !isProvider(s.provider) || !str(s.model))
      return bad('Membro inválido.');
    if (ids.has(s.id)) return bad('Ids de membros duplicados.');
    ids.add(s.id);
  }
  if (!isObj(state) || !Array.isArray(state.history) || !isObj(state.lastCallAt)) return bad('Estado inválido.');
  if (keys !== undefined && !isObj(keys)) return bad('keys inválido.');
  if (!Number.isInteger(seqStart) || (seqStart as number) < 0) return bad('seqStart inválido.');
  // só provedores conhecidos, strings aparadas, sem vazias
  const clean: Keys = {};
  for (const p of Object.keys(PROVIDERS) as ProviderId[]) {
    const k = keys?.[p];
    if (typeof k === 'string' && k.trim()) clean[p] = k.trim();
  }
  return {
    ok: true,
    value: {
      config: config as unknown as DebateConfig,
      state: state as unknown as DebateState,
      keys: clean,
      seqStart: seqStart as number,
    },
  };
}
