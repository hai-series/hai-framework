import type { SearchEntry } from '../docs-types.js'

export function searchDocuments(query: string, entries: SearchEntry[]) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length)
    return []
  return entries.filter(entry => terms.every(term => `${entry.title} ${entry.text}`.toLocaleLowerCase().includes(term))).map((entry) => {
    const index = entry.text.toLocaleLowerCase().indexOf(terms[0])
    const start = Math.max(0, index - 35)
    return { ...entry, excerpt: `${start ? '…' : ''}${entry.text.slice(start, start + 155)}…`, score: terms.reduce((score, term) => score + (entry.title.toLocaleLowerCase().includes(term) ? 10 : 1), 0) }
  }).sort((left, right) => right.score - left.score).slice(0, 20)
}

export async function loadSearchIndex(url: string): Promise<SearchEntry[]> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error('Documentation search index unavailable')
  return response.json() as Promise<SearchEntry[]>
}
