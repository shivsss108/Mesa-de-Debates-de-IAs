const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, d, h, n) => {
    if (n) return NAMED[n.toLowerCase()] ?? m
    try { return String.fromCodePoint(d ? +d : parseInt(h, 16)) } catch { return m }
  })
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

/** Texto dos <p> do <article> (ou de toda a página, se não houver), até `max` caracteres. */
export function extractText(html: string, max = 3000): string {
  const body = html.replace(/<(script|style|nav|noscript)\b[\s\S]*?<\/\1\s*>/gi, ' ')
  const scope = /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i.exec(body)?.[1] ?? body
  const ps = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)].map((m) => clean(m[1])).filter(Boolean)
  return ps.join('\n\n').slice(0, max)
}
