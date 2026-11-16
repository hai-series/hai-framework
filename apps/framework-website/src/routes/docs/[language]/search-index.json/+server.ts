import type { EntryGenerator, RequestHandler } from './$types'
import { resolve } from '$app/paths'
import { error } from '@sveltejs/kit'
import { parseDocSlug } from '#lib/doc-links.js'
import { searchIndex } from '#lib/server/docs.js'

const base = resolve('/').replace(/\/$/, '')

export const prerender = true
export const entries: EntryGenerator = () => [
  { language: 'en' },
  { language: 'ja' },
]

export const GET: RequestHandler = async ({ params }) => {
  const { locale } = parseDocSlug(params.language)
  if (locale === 'zh-CN')
    error(404, 'Documentation search index not found')
  return Response.json(await searchIndex(base, locale))
}
