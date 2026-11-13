import { PROVIDERS } from '@/providers/table';
import type { DebateConfig, ProviderId } from '@/types';

/** Problemas (em PT) que impedem começar; vazia = pode começar. Espelha src/engine/validate.ts. */
export function validateConfig(
  config: DebateConfig,
  keys: Partial<Record<ProviderId, string>>,
  envProviders: ProviderId[],
): string[] {
  const out: string[] = [];
  if (!config.tema.trim()) out.push('Escreva o tema do debate.');
  if (config.seats.length < 2 || config.seats.length > 8) out.push('A mesa deve ter de 2 a 8 membros.');
  if (!Number.isInteger(config.maxTurns) || config.maxTurns < 6 || config.maxTurns > 60)
    out.push('O limite de turnos deve estar entre 6 e 60.');
  if (!config.moderador.model) out.push('Escolha o modelo do moderador.');
  for (const s of config.seats) if (!s.model) out.push(`Escolha o modelo de ${s.nome || s.id}.`);
  for (const s of config.seats)
    for (const [k, r] of [['temperamento', s.temperamento], ['expertise', s.expertise]] as const)
      if ('custom' in r && !r.custom.trim()) out.push(`Descreva o ${k} personalizado de ${s.nome || s.id}.`);
  const used = new Set<ProviderId>([config.moderador.provider, ...config.seats.map((s) => s.provider)]);
  for (const p of used)
    if (!keys[p]?.trim() && !envProviders.includes(p)) out.push(`Falta a chave de ${PROVIDERS[p].nome}.`);
  return out;
}
