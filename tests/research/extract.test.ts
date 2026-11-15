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
})
