import { PROVIDERS } from '@/providers/table';
import { MAX_BUSCAS, MODERATOR_ID } from '@/types';
import type { DebateConfig, DebateState, ProviderId } from '@/types';

export type Keys = Partial<Record<ProviderId, string>>;
export interface StepBody { config: DebateConfig; state: DebateState; keys: Keys; seqStart: number }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isProvider = (p: unknown): p is ProviderId => typeof p === 'string' && Object.hasOwn(PROVIDERS, p);
const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

const STATUS = ['confirmada', 'nao_encontrada', 'contradita'];
const MODOS = ['todos', 'dividido', 'recorte'];
const ORIGENS = ['web', 'link', 'arquivo', 'texto', 'membro'];
const txt = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const optStr = (v: unknown) => v === undefined || typeof v === 'string';
const optTxt = (v: unknown, max: number) => v === undefined || txt(v, max);
/** `extra`: fonte do repertório de buscas (limites apertados; o dossiê traz URLs longas da pesquisa). */
const fonteOk = (f: unknown, extra = false) =>
  isObj(f) && str(f.id) && txt(f.titulo, extra ? 120 : Infinity) && ORIGENS.includes(f.origem as string) &&
  optTxt(f.resumo, 300) &&
  (extra
    ? optTxt(f.veiculo, 80) && optTxt(f.url, 500) && optTxt(f.data, 40) && optTxt(f.porMembro, 40)
    : [f.veiculo, f.url, f.data, f.porMembro].every(optStr));

/** Mensagem de erro, ou null se o dossiê é válido (limites da spec §3). */
export function validateDossie(d: unknown): string | null {
  const bad = 'Dossiê inválido.';
  if (!isObj(d)) return bad;
  if (!str(d.geradoEm)) return bad;
  if (!isObj(d.premissa) || !STATUS.includes(d.premissa.status as string) || typeof d.premissa.nota !== 'string') return bad;
  if (!MODOS.includes(d.modo as string)) return bad;
  const { fatos, disputas, fontes, recortes } = d;
  if (!Array.isArray(fatos) || fatos.length > 12) return 'Dossiê: no máximo 12 fatos.';
  for (const f of fatos)
    if (!isObj(f) || !str(f.id) || !txt(f.texto, 300) || !Array.isArray(f.fontes) || !f.fontes.every((x) => typeof x === 'string'))
      return 'Dossiê: fato inválido.';
  if (!Array.isArray(disputas) || disputas.length > 5 || !disputas.every((x) => txt(x, 200))) return 'Dossiê: disputas inválidas.';
  if (!Array.isArray(fontes) || fontes.length > 12) return 'Dossiê: no máximo 12 fontes.';
  if (!fontes.every((f) => fonteOk(f))) return 'Dossiê: fonte inválida.';
  if (recortes !== undefined && (!isObj(recortes) || !Object.values(recortes).every((x) => txt(x, 400))))
    return 'Dossiê: recorte inválido.';
  if (JSON.stringify(d).length > 8192) return 'Dossiê grande demais (máx. 8 KB).';
  return null;
}

export function validateStepBody(body: unknown): { ok: true; value: StepBody } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  if (!isObj(body)) return bad('Corpo inválido.');
  const { config, state, keys, seqStart } = body;
  if (!isObj(config)) return bad('config ausente.');
  if (!str(config.tema)) return bad('Tema vazio.');
  if (!Number.isInteger(config.maxTurns) || (config.maxTurns as number) < 1 || (config.maxTurns as number) > 20)
    return bad('maxTurns deve estar entre 1 e 20.');
  if (config.dossie !== undefined) {
    const e = validateDossie(config.dossie);
    if (e) return bad(e);
  }
  if (config.membrosPesquisam !== undefined && typeof config.membrosPesquisam !== 'boolean')
    return bad('membrosPesquisam deve ser booleano.');
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
  // repertório e contador vêm do cliente a cada passo; ausentes (cliente antigo) = vazio/0
  const repertorioExtra = state.repertorioExtra === undefined ? { fontes: [] } : state.repertorioExtra;
  if (!isObj(repertorioExtra) || !Array.isArray(repertorioExtra.fontes) || repertorioExtra.fontes.length > 24 || !repertorioExtra.fontes.every((f) => fonteOk(f, true)))
    return bad('Repertório inválido.');
  const buscasFeitas = state.buscasFeitas === undefined ? 0 : state.buscasFeitas;
  if (!Number.isInteger(buscasFeitas) || (buscasFeitas as number) < 0 || (buscasFeitas as number) > MAX_BUSCAS)
    return bad('buscasFeitas inválido.');
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
      state: { ...state, repertorioExtra, buscasFeitas } as unknown as DebateState,
      keys: clean,
      seqStart: seqStart as number,
    },
  };
}
