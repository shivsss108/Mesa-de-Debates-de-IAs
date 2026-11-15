import { searchNews, type NewsItem } from './search'

/** Busca rápida para os membros: até 4 notícias; nunca rejeita. */
export async function quickSearch(
  query: string,
  idioma: string,
  deps: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<NewsItem[]> {
  try {
    return (await searchNews(query, idioma, deps)).slice(0, 4)
  } catch {
    return []
  }
}
