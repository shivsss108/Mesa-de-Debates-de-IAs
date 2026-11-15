import { PROVIDERS } from '@/providers/table';
import type { Dossie, Fonte, ProviderId } from '@/types';
import type { Keys } from '@/engine/validate';
import type { LlmTarget } from './llm';
import { buildQueries } from './queries';
import { readSource } from './read';
import { searchNews, type NewsItem } from './search';
import { synthesize, type FonteLida } from './synthesize';

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
}

const MAX_FONTES = 12;
const MAX_WEB = 6;
const MAX_TEXTO = 6000;
const MAX_TEXTO_TOTAL = 20_000;

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
  try {
    // 1. busca: 2 consultas em paralelo; se ambas falham, zero resultados
    let web: NewsItem[] = [];
    if (input.busca) {
      onProgress({ etapa: 'buscando' });
      const queries = await buildQueries(input.tema, input.idioma, t);
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
    const lido = await Promise.all(
      urls.map(async (url) => {
        const text = await Promise.race([
          read(url, { signal }).catch(() => undefined),
          new Promise<undefined>((r) => deadline.signal.addEventListener('abort', () => r(undefined), { once: true })),
        ]);
        const clean = text?.trim() || undefined;
        if (clean) onProgress({ etapa: 'lendo', lidas: ++lidas, total });
        else if (!deadline.signal.aborted) onProgress({ etapa: 'lendo', lidas, total });
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
      cru.push({ titulo: x.nome, origem: /\.\w+$/.test(x.nome) ? 'arquivo' : 'texto', conteudo });
    }
    let k = input.links.length;
    for (const item of web) {
      const conteudo = (item.url ? lido[k++] : undefined) ?? item.resumo;
      if (!conteudo) continue;
      cru.push({ titulo: item.titulo, veiculo: item.veiculo, url: item.url, data: item.data, origem: 'web', conteudo });
    }
    const fontes: FonteLida[] = cru.slice(0, MAX_FONTES).map((f, i) => {
      const o = { id: `S${i + 1}`, ...f };
      for (const key of ['veiculo', 'url', 'data'] as const) if (o[key] === undefined) delete o[key];
      return o;
    });

    // 4. síntese
    const geradoEm = new Date(now()).toISOString().slice(0, 10);
    let saida: Pick<Dossie, 'premissa' | 'fatos' | 'disputas'>;
    if (fontes.length) {
      onProgress({ etapa: 'sintetizando' });
      saida = await synthesize(fontes, input.tema, input.idioma, geradoEm, t);
    } else {
      saida = { premissa: { status: 'nao_encontrada', nota: 'Nenhuma fonte encontrada sobre o tema.' }, fatos: [], disputas: [] };
    }
    return { geradoEm, ...saida, fontes: fontes.map(({ conteudo: _c, ...f }) => f), modo: input.modo };
  } finally {
    clearTimeout(timer);
  }
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
