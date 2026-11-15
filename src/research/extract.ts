const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, d, h, n) => {
    if (n) return NAMED[n.toLowerCase()] ?? m
    try { return String.fromCodePoint(d ? +d : parseInt(h, 16)) } catch { return m }
  })
}

const clean = (s: string) => decodeEntities(s.replace(/<[^<>]*>/g, '')).replace(/\s+/g, ' ').trim()

const lower = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase()) // preserva o comprimento (índices)
const isLetter = (c: string | undefined) => c !== undefined && /[a-z0-9]/i.test(c)

// Varredura linear com indexOf (regex `[\s\S]*?` até um fechamento ausente seria quadrática).
function dropBlocks(h: string, name: string): string {
  const lo = lower(h)
  let out = ''
  let pos = 0
  let from = 0
  for (;;) {
    const i = lo.indexOf('<' + name, from)
    if (i < 0) break
    if (isLetter(lo[i + name.length + 1])) { from = i + 1; continue }
    const j = lo.indexOf('</' + name, i)
    out += h.slice(pos, i) + ' '
    if (j < 0) { pos = h.length; break } // sem fechamento: descarta o resto
    const k = lo.indexOf('>', j)
    pos = from = k < 0 ? h.length : k + 1
  }
  return out + h.slice(pos)
}

function paragraphs(h: string, max: number): string {
  const lo = lower(h)
  const ps: string[] = []
  let total = 0
  let pos = 0
  let close = 0
  while (total <= max) {
    const i = lo.indexOf('<p', pos)
    if (i < 0) break
    if (isLetter(lo[i + 2])) { pos = i + 1; continue }
    const k = lo.indexOf('>', i)
    if (k < 0) break
    const start = k + 1
    if (close >= 0 && close < start) close = lo.indexOf('</p', start) // -1 fica -1: não reescaneia
    const next = lo.indexOf('<p', start)
    const end = Math.min(...[close, next].filter((x) => x >= 0), h.length)
    const t = clean(h.slice(start, Math.min(end, start + max * 4)))
    if (t) { ps.push(t); total += t.length + 2 }
    pos = end
  }
  return ps.join('\n\n')
}

/** Texto dos <p> do <article> (ou de toda a página, se não houver), até `max` caracteres. */
export function extractText(html: string, max = 3000): string {
  let body = html
  for (const n of ['script', 'style', 'nav', 'noscript']) body = dropBlocks(body, n)
  const lo = lower(body)
  const a = lo.indexOf('<article')
  let text = ''
  if (a >= 0) {
    const s = lo.indexOf('>', a)
    const e = lo.indexOf('</article', a)
    if (s >= 0) text = paragraphs(body.slice(s + 1, e < 0 ? body.length : e), max)
  }
  return (text || paragraphs(body, max)).slice(0, max)
}
