import { describe, it, expect } from 'vitest'
import { isPrivateIp, safeFetch } from '@/research/safeFetch'

const pub = async () => ['93.184.216.34']
const html = (body = '<p>oi</p>', type = 'text/html; charset=utf-8') =>
  new Response(body, { status: 200, headers: { 'content-type': type } })

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1',
  ])('bloqueia %s', (ip) => expect(isPrivateIp(ip)).toBe(true))
  it.each(['8.8.8.8', '172.32.0.1', '2606:4700::1111'])('permite %s', (ip) =>
    expect(isPrivateIp(ip)).toBe(false))
})

describe('safeFetch', () => {
  it('recusa protocolo não http(s)', async () => {
    await expect(safeFetch('ftp://x', { lookup: pub })).rejects.toThrow(/Protocolo não permitido/)
  })
  it('recusa localhost (DNS -> 127.0.0.1)', async () => {
    await expect(
      safeFetch('http://localhost/', { lookup: async () => ['127.0.0.1'], fetch: async () => html() }),
    ).rejects.toThrow(/Endereço não permitido/)
  })
  it('recusa IP literal privado, inclusive IPv6 entre colchetes', async () => {
    const f = async () => html()
    await expect(safeFetch('http://[::1]/', { fetch: f, lookup: pub })).rejects.toThrow(/Endereço não permitido/)
    await expect(safeFetch('http://[::ffff:127.0.0.1]/', { fetch: f, lookup: pub })).rejects.toThrow(/Endereço não permitido/)
    await expect(safeFetch('http://10.0.0.1/', { fetch: f, lookup: pub })).rejects.toThrow(/Endereço não permitido/)
  })
  it('recusa content-type que não é texto', async () => {
    await expect(
      safeFetch('http://exemplo.com/', { lookup: pub, fetch: async () => html('x', 'image/png') }),
    ).rejects.toThrow(/Tipo de conteúdo/)
  })
  it('recusa redirecionamento para IP privado', async () => {
    let calls = 0
    const f = async () =>
      calls++ === 0
        ? new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/' } })
        : html()
    await expect(safeFetch('http://exemplo.com/', { lookup: pub, fetch: f })).rejects.toThrow(/Endereço não permitido/)
    expect(calls).toBe(1)
  })
  it('segue até 3 redirecionamentos e recusa o 4º', async () => {
    let n = 0
    const f = async () =>
      new Response(null, { status: 302, headers: { location: `http://exemplo.com/${++n}` } })
    await expect(safeFetch('http://exemplo.com/', { lookup: pub, fetch: f })).rejects.toThrow(/Redirecionamentos demais/)
    expect(n).toBe(4)
    let m = 0
    const g = async () =>
      m++ < 3
        ? new Response(null, { status: 302, headers: { location: '/x' } })
        : html('<p>fim</p>')
    const r = await safeFetch('http://exemplo.com/', { lookup: pub, fetch: g })
    expect(r.body).toBe('<p>fim</p>')
  })
  it('recusa corpo maior que 1,5 MB', async () => {
    const big = new Uint8Array(1_600_000).fill(97)
    const f = async () => html(new TextDecoder().decode(big))
    await expect(safeFetch('http://exemplo.com/', { lookup: pub, fetch: f })).rejects.toThrow(/grande demais/)
  })
  it('devolve HTML pequeno', async () => {
    const r = await safeFetch('https://exemplo.com/a', { lookup: pub, fetch: async () => html() })
    expect(r).toEqual({ url: 'https://exemplo.com/a', contentType: 'text/html; charset=utf-8', body: '<p>oi</p>' })
  })
})
