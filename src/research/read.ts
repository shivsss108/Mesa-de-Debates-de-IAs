import { safeFetch as defaultSafeFetch } from './safeFetch'
import { extractText } from './extract'

const MAX = 3000
const MIN_USEFUL = 500
const JINA_TIMEOUT_MS = 8000

async function viaJina(url: string, doFetch: typeof fetch, signal?: AbortSignal): Promise<string | undefined> {
  // Só http(s) vai para o serviço externo.
  if (!/^https?:\/\//i.test(url)) return undefined
  const t = AbortSignal.timeout(JINA_TIMEOUT_MS)
  const r = await doFetch('https://r.jina.ai/' + url, { signal: signal ? AbortSignal.any([signal, t]) : t })
  if (!r.ok) return undefined
  return (await r.text()).trim().slice(0, MAX) || undefined
}

/** Lê o texto de uma URL (≤ 3 000 chars). Nunca lança: qualquer falha vira `undefined`. */
export async function readSource(
  url: string,
  deps: { safeFetch?: typeof defaultSafeFetch; fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<string | undefined> {
  let text = ''
  try {
    const r = await (deps.safeFetch ?? defaultSafeFetch)(url, { signal: deps.signal })
    text = /text\/plain/i.test(r.contentType) ? r.body.trim().slice(0, MAX) : extractText(r.body, MAX).trim()
  } catch { /* cai para o Jina */ }
  if (text.length >= MIN_USEFUL) return text
  try {
    return (await viaJina(url, deps.fetch ?? fetch, deps.signal)) ?? (text || undefined)
  } catch {
    return text || undefined
  }
}
