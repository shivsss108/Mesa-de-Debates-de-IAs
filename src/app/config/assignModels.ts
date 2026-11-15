import type { CatalogModel } from '@/providers/catalog';
import { modelScore } from '@/providers/models';
import type { DebateConfig, ProviderId } from '@/types';

type Pick = { provider: ProviderId; model: string };
const pick = (m: CatalogModel): Pick => ({ provider: m.provider, model: m.id });

/** Do melhor para o pior, alternando provedores: 1º de cada provedor, depois o 2º de cada… */
export function rankVaried(models: CatalogModel[]): CatalogModel[] {
  const byProvider = new Map<ProviderId, CatalogModel[]>();
  for (const m of [...models].sort((a, b) => modelScore(b.id) - modelScore(a.id))) {
    byProvider.set(m.provider, [...(byProvider.get(m.provider) ?? []), m]);
  }
  const lists = [...byProvider.values()].sort((a, b) => modelScore(b[0].id) - modelScore(a[0].id));
  const out: CatalogModel[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

/** O melhor modelo de um provedor (ou undefined se não houver nenhum). */
export function bestOf(models: CatalogModel[], provider: ProviderId): Pick | undefined {
  const m = rankVaried(models.filter((x) => x.provider === provider))[0];
  return m && pick(m);
}

/** Melhores modelos variados: assento i recebe o i-ésimo do ranking; o moderador, o melhor de todos. */
export function variedBest(c: DebateConfig, models: CatalogModel[]): DebateConfig {
  const ranked = rankVaried(models);
  if (!ranked.length) return c;
  return {
    ...c,
    seats: c.seats.map((s, i) => ({ ...s, ...pick(ranked[i % ranked.length]) })),
    moderador: { ...c.moderador, ...pick(ranked[0]) },
  };
}

/** Um modelo sorteado por assento; o moderador fica com o melhor (precisa responder JSON com confiança). */
export function randomModels(c: DebateConfig, models: CatalogModel[], rng: () => number = Math.random): DebateConfig {
  if (!models.length) return c;
  return {
    ...c,
    seats: c.seats.map((s) => ({ ...s, ...pick(models[Math.floor(rng() * models.length)]) })),
    moderador: { ...c.moderador, ...pick(rankVaried(models)[0]) },
  };
}
