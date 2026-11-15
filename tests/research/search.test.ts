import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBingRss, parseGoogleRss, searchNews } from '@/research/search'

const read = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')
const bing = read('bing.xml')
const google = read('google.xml')
const ok = (body: string) => new Response(body, { status: 200 })

describe('parseBingRss', () => {
  const items = parseBingRss(bing)
  it('decodifica a URL real do apiclick', () => {
    expect(items[0].url).toBe('https://olhardigital.com.br/2026/11/13/pro/caso-jensen-huang/')
  })
  it('título, resumo, veículo e data', () => {
    expect(items).toHaveLength(2)
    expect(items[0].titulo).toContain('império dos chips após a queda')
    expect(items[0].resumo).toContain('renúncia de Jensen Huang. Polêmica & suspeitas')
    expect(items[0].veiculo).toBe('olhardigital')
    expect(items[0].data).toBe('Fri, 13 Nov 2026 06:53:00 GMT')
  })
  it('link direto é mantido', () => {
    expect(items[1].url).toMatch(/^https:\/\/www\.msn\.com\/pt-br\//)
  })
})

describe('parseGoogleRss', () => {
  const items = parseGoogleRss(google)
  it('título, veículo, url indefinida', () => {
    expect(items).toHaveLength(2)
    expect(items[0].titulo).toContain('Os últimos dias de Jensen Huang')
    expect(items[0].veiculo).toBe('Valor Econômico')
    expect(items[0].url).toBeUndefined()
    expect(items[0].resumo).toContain('Valor Econômico')
    expect(items[0].resumo).not.toMatch(/[<>]|&nbsp;/)
  })
})

describe('searchNews', () => {
  it('usa o Bing quando funciona', async () => {
    const urls: string[] = []
    const fetch = (async (u: string) => { urls.push(u); return ok(bing) }) as unknown as typeof globalThis.fetch
    const r = await searchNews('Jensen Huang', 'pt-BR', { fetch })
    expect(r).toHaveLength(2)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe('https://www.bing.com/news/search?q=Jensen%20Huang&format=rss&mkt=pt-BR')
  })
  it('cai para o Google quando o Bing lança', async () => {
    const urls: string[] = []
    const fetch = (async (u: string) => {
      urls.push(u)
      if (u.includes('bing.com')) throw new Error('rede')
      return ok(google)
    }) as unknown as typeof globalThis.fetch
    const r = await searchNews('x', 'pt-BR', { fetch })
    expect(r.map((i) => i.veiculo)).toEqual(['Valor Econômico', 'Folha de S.Paulo'])
    expect(urls[1]).toContain('hl=pt-BR&gl=BR&ceid=BR:pt-419')
  })
  it('mapeia idiomas en/es/outro', async () => {
    const urls: string[] = []
    const fetch = (async (u: string) => { urls.push(u); throw new Error('x') }) as unknown as typeof globalThis.fetch
    for (const l of ['en-GB', 'es-MX', 'fr']) await searchNews('q', l, { fetch }).catch(() => {})
    expect(urls.filter((u) => u.includes('google'))[0]).toContain('ceid=US:en')
    expect(urls.filter((u) => u.includes('google'))[1]).toContain('ceid=ES:es')
    expect(urls.filter((u) => u.includes('google'))[2]).toContain('hl=en-US')
  })
  it('dedup por URL', async () => {
    const item = (n: number, link: string) => `<item><title>T${n}</title><link>${link}</link><description>d</description></item>`
    const xml = '<rss><channel>' + [1, 2, 3, 4, 5, 6, 7, 8].map((n) => item(n, `https://a.com/${n % 4}`)).join('') + '</channel></rss>'
    const fetch = (async () => ok(xml)) as unknown as typeof globalThis.fetch
    const r = await searchNews('q', 'pt-BR', { fetch })
    expect(r.map((i) => i.url)).toEqual(['https://a.com/1', 'https://a.com/2', 'https://a.com/3', 'https://a.com/0'])
  })
  const item = (t: string, link?: string) => `<item><title>${t}</title>${link ? `<link>${link}</link>` : ''}<description>d</description></item>`
  const rss = (...its: string[]) => '<rss><channel>' + its.join('') + '</channel></rss>'
  const fake = (xml: string) => (async () => ok(xml)) as unknown as typeof globalThis.fetch
  it('limita a 6 com 8 itens únicos', async () => {
    const xml = rss(...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => item(`T${n}`, `https://a.com/${n}`)))
    const r = await searchNews('q', 'pt-BR', { fetch: fake(xml) })
    expect(r.map((i) => i.url)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `https://a.com/${n}`))
  })
  it('sem URL, dedup por título (caminho do Google incluído)', async () => {
    const xml = rss(item('Igual'), item('Igual'), item('Outro'))
    const fetch = (async (u: string) => { if (u.includes('bing.com')) throw new Error('x'); return ok(xml) }) as unknown as typeof globalThis.fetch
    const r = await searchNews('q', 'pt-BR', { fetch })
    expect(r.map((i) => i.titulo)).toEqual(['Igual', 'Outro'])
  })
})
