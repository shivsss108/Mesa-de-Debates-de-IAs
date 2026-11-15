import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { extractText } from '@/research/extract'

const html = readFileSync(new URL('./fixtures/article.html', import.meta.url), 'utf8')

describe('extractText', () => {
  it('usa os <p> do <article>, sem nav, script nem rodapé', () => {
    const t = extractText(html)
    expect(t).toContain('Primeiro parágrafo')
    expect(t).toContain('Segundo parágrafo')
    expect(t).toContain('Terceiro parágrafo')
    expect(t).not.toContain('MENU_DO_NAV')
    expect(t).not.toContain('TEXTO_DO_SCRIPT')
    expect(t).not.toContain('RODAPE_FORA_DO_ARTICLE')
  })
  it('sem <article> usa todos os <p>', () => {
    expect(extractText('<nav>NAV</nav><p>um</p><div><p>dois</p></div>')).toBe('um\n\ndois')
  })
  it('corta em max', () => {
    expect(extractText('<p>' + 'a'.repeat(50) + '</p>', 10)).toHaveLength(10)
  })
  it('decodifica entidades', () => {
    const t = extractText(html)
    expect(t).toContain('Nvidia & seus')
    expect(t).toContain('parágrafo com destaque')
  })
  it('<article> sem <p> cai para os <p> da página', () => {
    expect(extractText('<article>só texto</article><p>fora</p>')).toBe('fora')
  })
  it('<p> sem fechamento', () => {
    expect(extractText('<p>um<p>dois</p>')).toBe('um\n\ndois')
  })
  it.each(['<p>x', '<script>x'])('entrada de ~1,5 MB com %s sem fechar é linear', (unit) => {
    const big = unit.repeat(Math.ceil(1_500_000 / unit.length))
    const t0 = performance.now()
    extractText(big)
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})
