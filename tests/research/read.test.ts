import { describe, it, expect, vi } from 'vitest'
import { readSource } from '../../src/research/read'
import { quickSearch } from '../../src/research/quickSearch'

const html = (n: number) => `<html><body><article><p>${'palavra '.repeat(n)}</p></article></body></html>`
const sf = (body: string, contentType = 'text/html') => vi.fn(async (u: string) => ({ url: u, contentType, body }))
const jinaOk = (t: string) => vi.fn(async () => new Response(t, { status: 200 })) as unknown as typeof fetch

describe('readSource', () => {
  it('HTML com >= 500 chars: texto extraído, Jina não chamado', async () => {
    const fetchMock = jinaOk('jina')
    const out = await readSource('https://a.com/x', { safeFetch: sf(html(200)), fetch: fetchMock })
    expect(out).toContain('palavra')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('HTML com < 500 chars: usa Jina, cortado em 3000', async () => {
    const fetchMock = jinaOk('j'.repeat(5000))
    const out = await readSource('https://a.com/x', { safeFetch: sf(html(3)), fetch: fetchMock })
    expect(out).toBe('j'.repeat(3000))
    expect((fetchMock as any).mock.calls[0][0]).toBe('https://r.jina.ai/https://a.com/x')
  })

  it('safeFetch lança e Jina lança: undefined, sem vazar mensagem', async () => {
    const bad = vi.fn(async () => { throw new Error('ENOTFOUND host') })
    const out = await readSource('https://a.com/x', { safeFetch: bad, fetch: bad as unknown as typeof fetch })
    expect(out).toBeUndefined()
  })

  it('Jina não-OK: cai para o texto curto local', async () => {
    const f = vi.fn(async () => new Response('x', { status: 500 })) as unknown as typeof fetch
    expect(await readSource('https://a.com/x', { safeFetch: sf(html(3)), fetch: f })).toBe('palavra palavra palavra')
  })

  it('text/plain usa o corpo direto', async () => {
    const f = jinaOk('jina')
    const out = await readSource('https://a.com/x', { safeFetch: sf('  ' + 'a'.repeat(4000), 'text/plain'), fetch: f })
    expect(out).toBe('a'.repeat(3000))
    expect(f).not.toHaveBeenCalled()
  })

  it('não envia a Jina URL com esquema não http(s)', async () => {
    const f = jinaOk('jina')
    const bad = vi.fn(async () => { throw new Error('Protocolo não permitido.') })
    expect(await readSource('file:///etc/passwd', { safeFetch: bad, fetch: f })).toBeUndefined()
    expect(f).not.toHaveBeenCalled()
  })
})

describe('quickSearch', () => {
  const xml = `<rss><channel>${Array.from({ length: 6 }, (_, i) => `<item><title>T${i}</title><link>https://x.com/${i}</link><description>d</description></item>`).join('')}</channel></rss>`
  it('devolve no máximo 4 itens', async () => {
    const f = vi.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch
    expect(await quickSearch('q', 'pt-BR', { fetch: f })).toHaveLength(4)
  })
  it('não rejeita se a busca falha', async () => {
    const f = vi.fn(async () => { throw new Error('x') }) as unknown as typeof fetch
    expect(await quickSearch('q', 'pt-BR', { fetch: f })).toEqual([])
  })
})
