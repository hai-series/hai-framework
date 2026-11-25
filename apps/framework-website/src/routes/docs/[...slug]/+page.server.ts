import { resolve } from '$app/paths'
import { error } from '@sveltejs/kit'
import { docLocales, docSlug, parseDocSlug } from '#lib/doc-links.js'
import { getDocumentPage, routeDocuments } from '#lib/server/docs.js'

// Vite 配置固定 paths.relative=false，HTTP 前缀不会随 SSR 页面深度改变。
const base = resolve('/').replace(/\/$/, '')

export async function entries() {
  const documents = (await routeDocuments()).flatMap(file => docLocales.map(locale => docSlug(file, locale)))
  return documents.map(slug => ({ slug }))
}

export async function load({ params }: { params: { slug?: string } }) {
  const chapter = parseDocSlug((params.slug ?? '').replace(/\/$/, ''))
  const document = await getDocumentPage(chapter, base)
  if (!document)
    error(404, 'Documentation page not found')
  return { document }
}
