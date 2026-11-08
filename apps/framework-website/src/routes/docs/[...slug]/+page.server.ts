import { resolve } from '$app/paths'
import { error } from '@sveltejs/kit'
import { docSlug } from '#lib/doc-links.js'
import { getDocument, routeDocuments } from '#lib/server/docs.js'

// Vite 配置固定 paths.relative=false，HTTP 前缀不会随 SSR 页面深度改变。
const base = resolve('/').replace(/\/$/, '')

export async function entries() {
  return (await routeDocuments()).map(file => ({
    slug: docSlug(file),
  }))
}

export async function load({ params }: { params: { slug?: string } }) {
  const slug = (params.slug ?? '').replace(/\/$/, '')
  const files = await routeDocuments()
  const file = files.find(candidate => docSlug(candidate) === slug)
  const document = file
    ? await getDocument(file, base)
    : undefined
  if (!document)
    error(404, 'Documentation page not found')
  return { document }
}
