import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_BYTES = 1_500_000
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 8000

export interface SafeFetchDeps {
  fetch?: typeof fetch
  lookup?: (host: string) => Promise<string[]>
  signal?: AbortSignal
}

const defaultLookup = async (host: string) =>
  (await dnsLookup(host, { all: true })).map((a) => a.address)

function isPrivateV4(p: number[]): boolean {
  const [a, b] = p
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** true se o IP é privado/local/reservado. Entrada que não é IP → true (falha fechada). */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return isPrivateV4(ip.split('.').map(Number))
  if (kind !== 6) return true
  let s = ip.toLowerCase()
  const dot = s.lastIndexOf('.')
  if (dot !== -1) {
    // sufixo IPv4 (::ffff:1.2.3.4) -> dois grupos hex
    const colon = s.lastIndexOf(':')
    const [a, b, c, d] = s.slice(colon + 1).split('.').map(Number)
    s = `${s.slice(0, colon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, tail = ''] = s.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const g = s.includes('::')
    ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t].map((x) => parseInt(x, 16))
    : h.map((x) => parseInt(x, 16))
  if (g.slice(0, 5).every((x) => x === 0)) {
    // ::, ::1, ::ffff:a.b.c.d (mapeado) e ::a.b.c.d (compatível, obsoleto)
    if (g[5] === 0xffff) return isPrivateV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255])
    if (g[5] === 0) return true
  }
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80
}

async function assertPublic(url: URL, lookup: (h: string) => Promise<string[]>) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Protocolo não permitido.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [host] : await lookup(host)
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error('Endereço não permitido.')
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error('Página grande demais.')
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let o = 0
  for (const c of chunks) { all.set(c, o); o += c.byteLength }
  return new TextDecoder().decode(all)
}

export async function safeFetch(
  rawUrl: string,
  deps: SafeFetchDeps = {},
): Promise<{ url: string; contentType: string; body: string }> {
  const doFetch = deps.fetch ?? fetch
  const lookup = deps.lookup ?? defaultLookup
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout

  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('URL inválida.') }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url, lookup)
    // ponytail: DNS rebinding entre este lookup e a resolução do próprio fetch não é prevenido; upgrade = conectar por IP fixo (undici Agent com lookup customizado).
    const res = await doFetch(url.href, { redirect: 'manual', signal })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      await res.body?.cancel().catch(() => {})
      if (!loc) throw new Error('Redirecionamento inválido.')
      try { url = new URL(loc, url) } catch { throw new Error('Redirecionamento inválido.') }
      continue
    }
    if (!res.ok) throw new Error(`Falha ao abrir a página (${res.status}).`)
    const contentType = res.headers.get('content-type') ?? ''
    if (!/^(text\/html|text\/plain)\b/i.test(contentType)) throw new Error('Tipo de conteúdo não permitido.')
    return { url: url.href, contentType, body: await readCapped(res) }
  }
  throw new Error('Redirecionamentos demais.')
}
