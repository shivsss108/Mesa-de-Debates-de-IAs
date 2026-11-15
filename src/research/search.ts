import { decodeEntities } from './extract'

export interface NewsItem { titulo: string; resumo: string; veiculo?: string; url?: string; data?: string }

const MAX_RESULTS = 6
const TIMEOUT_MS = 8000

const tag = (block: string, name: string) => {
  const m = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)</' + name + '>', 'i').exec(block)
  if (!m) return undefined
  const v = m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
  return v
}
// Decodifica entidades, remove tags (a descrição do Google vem como HTML escapado) e normaliza espaços.
const text = (s: string | undefined) =>
  s === undefined ? undefined : decodeEntities(decodeEntities(s).replace(/<[^<>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

const items = (xml: string) => [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1])

export function parseBingRss(xml: string): NewsItem[] {
  return items(xml).map((b) => {
    const link = decodeEntities(tag(b, 'link') ?? '').trim()
    let url: string | undefined = /^https?:\/\//.test(link) ? link : undefined
    if (/apiclick\.aspx/i.test(link)) {
      const real = /[?&]url=([^&]+)/.exec(link)?.[1]
      try { url = real ? decodeURIComponent(real) : undefined } catch { url = undefined }
    }
    return {
      titulo: text(tag(b, 'title')) ?? '',
      resumo: text(tag(b, 'description')) ?? '',
      veiculo: text(tag(b, 'News:Source')) || undefined,
      url,
      data: text(tag(b, 'pubDate')) || undefined,
    }
  }).filter((i) => i.titulo)
}

export function parseGoogleRss(xml: string): NewsItem[] {
  // O <link> do Google é um redirecionamento opaco: url fica indefinida.
  return items(xml).map((b) => ({
    titulo: text(tag(b, 'title')) ?? '',
    resumo: text(tag(b, 'description')) ?? '',
    veiculo: text(tag(b, 'source')) || undefined,
    data: text(tag(b, 'pubDate')) || undefined,
  })).filter((i) => i.titulo)
}

function locale(idioma: string) {
  const l = idioma.toLowerCase()
  if (l === 'pt-br') return { mkt: 'pt-BR', hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' }
  if (l.startsWith('es')) return { mkt: 'es-ES', hl: 'es-ES', gl: 'ES', ceid: 'ES:es' }
  return { mkt: 'en-US', hl: 'en-US', gl: 'US', ceid: 'US:en' }
}

export async function searchNews(
  query: string,
  idioma: string,
  deps: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<NewsItem[]> {
  const doFetch = deps.fetch ?? fetch
  const { mkt, hl, gl, ceid } = locale(idioma)
  const q = encodeURIComponent(query)
  const get = async (url: string) => {
    const signal = deps.signal ? AbortSignal.any([deps.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS)
    const r = await doFetch(url, { signal, headers: { 'user-agent': 'Mozilla/5.0' } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.text()
  }
  let found: NewsItem[] = []
  try {
    found = parseBingRss(await get(`https://www.bing.com/news/search?q=${q}&format=rss&mkt=${mkt}`))
  } catch { /* cai para o Google */ }
  if (!found.length) {
    found = parseGoogleRss(await get(`https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`))
  }
  const seen = new Set<string>()
  return found.filter((i) => {
    const k = i.url ?? i.titulo
    return seen.has(k) ? false : (seen.add(k), true)
  }).slice(0, MAX_RESULTS)
}
