import { PROVIDERS } from '@/providers/table';
import type { Dossie, Fonte, ProviderId } from '@/types';
import { validateDossie, type Keys } from '@/engine/validate';
import { dataSP } from '@/engine/prompts';
import { isFatal, type LlmTarget } from './llm';
import { buildQueries } from './queries';
import { readSource } from './read';
import { searchNews, type NewsItem } from './search';
import { fallback, synthesize, type FonteLida } from './synthesize';

export interface ResearchInput {
  tema: string;
  idioma: string;
  moderador: { provider: ProviderId; model: string };
  busca: boolean;
  links: string[];
  textos: { nome: string; conteudo: string }[];
  modo: Dossie['modo'];
}
export type Progress = { etapa: 'buscando' | 'lendo' | 'sintetizando'; detalhe?: string; lidas?: number; total?: number };
export interface ResearchDeps {
  t: LlmTarget;
  search?: (query: string, idioma: string) => Promise<NewsItem[]>;
  read?: (url: string, deps?: { signal?: AbortSignal }) => Promise<string | undefined>;
  now?: () => number;
  deadlineMs?: number;
  /** orçamento total da rota (Vercel mata em 60 s); estourou na síntese → dossiê de fallback */
  budgetMs?: number;
}

const MAX_FONTES = 12;
const MAX_WEB = 6;
const MAX_TEXTO = 6000;
const MAX_TEXTO_TOTAL = 20_000;
const MAX_TITULO = 120;
const MAX_VEICULO = 80;

const hostname = (u: string) => {
  try {
    return new URL(u).hostname || u.slice(0, 80);
  } catch {
    return u.slice(0, 80);
  }
};

export async function runResearch(input: ResearchInput, deps: ResearchDeps, onProgress: (p: Progress) => void): Promise<Dossie> {
  const { t } = deps;
  const search = deps.search ?? ((q, i) => searchNews(q, i, { signal: t.signal }));
  const read = deps.read ?? readSource;
  const now = deps.now ?? Date.now;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), deps.deadlineMs ?? 50_000);
  const budget = new AbortController();
  const budgetTimer = setTimeout(() => budget.abort(), deps.budgetMs ?? 57_000);
  // LLM sob o orçamento; só o abort do chamador (t.signal) e a chave recusada são fatais (isFatal(e, t))
  const tb: LlmTarget = { ...t, signal: t.signal ? AbortSignal.any([budget.signal, t.signal]) : budget.signal };
  try {
    // 1. busca: 2 consultas em paralelo; se ambas falham, zero resultados
    let web: NewsItem[] = [];
    if (input.busca) {
      onProgress({ etapa: 'buscando' });
      const queries = await buildQueries(input.tema, input.idioma, tb).catch((e) => {
        if (isFatal(e, t)) throw e;
        return [input.tema];
      });
      const rs = await Promise.allSettled(queries.slice(0, 2).map((q) => search(q, input.idioma)));
      const seen = new Set<string>();
      web = rs
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .filter((i) => {
          const k = i.url ?? i.titulo;
          return seen.has(k) ? false : (seen.add(k), true);
        })
        .slice(0, MAX_WEB);
    }

    // 2. leitura (links do usuário, depois resultados com url), abandonada no deadline
    const urls = [...input.links, ...web.flatMap((i) => (i.url ? [i.url] : []))];
    const total = urls.length;
    let lidas = 0;
    if (total) onProgress({ etapa: 'lendo', lidas, total });
    const signal = t.signal ? AbortSignal.any([deadline.signal, t.signal]) : deadline.signal;
    const detalhes = [...input.links.map(hostname), ...web.filter((i) => i.url).map((i) => (i.veiculo || hostname(i.url!)).slice(0, MAX_VEICULO))];
    const lido = await Promise.all(
      urls.map(async (url, idx) => {
        const text = await Promise.race([
          read(url, { signal }).catch(() => undefined),
          new Promise<undefined>((r) => deadline.signal.addEventListener('abort', () => r(undefined), { once: true })),
        ]);
        const clean = text?.trim() || undefined;
        if (clean) onProgress({ etapa: 'lendo', detalhe: detalhes[idx], lidas: ++lidas, total });
        else if (!deadline.signal.aborted) onProgress({ etapa: 'lendo', detalhe: detalhes[idx], lidas, total });
        return clean;
      }),
    );

    // 3. fontes: links, textos, web (links sem leitura são descartados)
    const cru: (Omit<Fonte, 'id'> & { conteudo: string })[] = [];
    input.links.forEach((url, i) => {
      if (lido[i]) cru.push({ titulo: hostname(url), url, origem: 'link', conteudo: lido[i]! });
    });
    let restante = MAX_TEXTO_TOTAL;
    for (const x of input.textos) {
      const conteudo = x.conteudo.trim().slice(0, Math.min(MAX_TEXTO, restante));
      if (!conteudo) continue;
      restante -= conteudo.length;
      cru.push({ titulo: x.nome.slice(0, MAX_TITULO), origem: /\.\w+$/.test(x.nome) ? 'arquivo' : 'texto', conteudo });
    }
    let k = input.links.length;
    for (const item of web) {
      const r = item.url ? lido[k++] : undefined;
      // leitura curta (paywall, banner) não vence o resumo do RSS
      const conteudo = r && (r.length >= 500 || r.length > (item.resumo?.length ?? 0)) ? r : (item.resumo ?? r);
      if (!conteudo) continue;
      cru.push({ titulo: item.titulo.slice(0, MAX_TITULO), veiculo: item.veiculo?.slice(0, MAX_VEICULO), url: item.url, data: item.data, origem: 'web', conteudo });
    }
    const fontes: FonteLida[] = cru.slice(0, MAX_FONTES).map((f, i) => {
      const o = { id: `S${i + 1}`, ...f };
      for (const key of ['veiculo', 'url', 'data'] as const) if (o[key] === undefined) delete o[key];
      return o;
    });

    // 4. síntese
    const geradoEm = dataSP(now());
    let saida: Pick<Dossie, 'premissa' | 'fatos' | 'disputas'>;
    if (fontes.length) {
      onProgress({ etapa: 'sintetizando' });
      saida = await synthesize(fontes, input.tema, input.idioma, geradoEm, tb).catch((e) => {
        if (isFatal(e, t)) throw e;
        return fallback(fontes);
      });
    } else {
      saida = { premissa: { status: 'nao_encontrada', nota: 'Nenhuma fonte encontrada sobre o tema.' }, fatos: [], disputas: [] };
    }
    return fit({ geradoEm, ...saida, fontes: fontes.map(({ conteudo: _c, ...f }) => f), modo: input.modo });
  } finally {
    clearTimeout(timer);
    clearTimeout(budgetTimer);
  }
}

/** Se o dossiê estoura 8 KB, descarta fontes (as não citadas primeiro, depois as finais) e os fatos que ficam sem fonte. */
function fit(d: Dossie): Dossie {
  while (d.fontes.length && validateDossie(d)?.includes('8 KB')) {
    const citadas = new Set(d.fatos.flatMap((f) => f.fontes));
    const drop = [...d.fontes].reverse().find((f) => !citadas.has(f.id)) ?? d.fontes[d.fontes.length - 1];
    d = {
      ...d,
      fontes: d.fontes.filter((f) => f !== drop),
      fatos: d.fatos.map((f) => ({ ...f, fontes: f.fontes.filter((x) => x !== drop.id) })).filter((f) => f.manual || f.fontes.length),
    };
  }
  return d;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isProvider = (p: unknown): p is ProviderId => typeof p === 'string' && Object.hasOwn(PROVIDERS, p);

/** Só provedores conhecidos, strings aparadas, sem vazias. */
export function cleanKeys(keys: unknown): Keys {
  const clean: Keys = {};
  if (!isObj(keys)) return clean;
  for (const p of Object.keys(PROVIDERS) as ProviderId[]) {
    const v = keys[p];
    if (typeof v === 'string' && v.trim()) clean[p] = v.trim();
  }
  return clean;
}

export function parseResearchBody(body: unknown): { ok: true; value: ResearchInput & { keys: Keys } } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  if (!isObj(body)) return bad('Corpo inválido.');
  const { tema, idioma, moderador, busca, links, textos, modo, keys } = body;
  if (!str(tema) || tema.length > 300) return bad('Tema inválido (1 a 300 caracteres).');
  if (!str(idioma)) return bad('Idioma inválido.');
  if (!isObj(moderador) || !isProvider(moderador.provider) || !str(moderador.model)) return bad('Moderador inválido.');
  if (typeof busca !== 'boolean') return bad('busca deve ser booleano.');
  if (!Array.isArray(links) || links.length > 5 || !links.every((l) => typeof l === 'string')) return bad('No máximo 5 links.');
  if (!Array.isArray(textos) || !textos.every((x) => isObj(x) && typeof x.nome === 'string' && typeof x.conteudo === 'string'))
    return bad('Textos inválidos.');
  if (textos.length > 10 || textos.some((x) => (x.nome as string).length > 200)) return bad('No máximo 10 textos, com nome de até 200 caracteres.');
  if (textos.reduce((n, x) => n + (x.conteudo as string).length, 0) > 200_000) return bad('Texto demais (máx. 200 000 caracteres).');
  if (!['todos', 'dividido', 'recorte'].includes(modo as string)) return bad('Modo inválido.');
  if (keys !== undefined && !isObj(keys)) return bad('keys inválido.');
  return {
    ok: true,
    value: {
      tema,
      idioma,
      busca,
      modo: modo as Dossie['modo'],
      keys: cleanKeys(keys),
      moderador: { provider: moderador.provider, model: moderador.model },
      links: links as string[],
      textos: textos as { nome: string; conteudo: string }[],
    },
  };
}
