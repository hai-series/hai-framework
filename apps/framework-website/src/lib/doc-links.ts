import type { DocNode } from './docs-types.js'

const localePrefixes = { 'zh-CN': '', 'en-US': 'en', 'ja-JP': 'ja' } as const
export type DocLocale = keyof typeof localePrefixes
export interface DocChapter {
  /** 章节标识不包含语言目录。 */
  slug: string
  locale: DocLocale
}

export const docLocales = ['zh-CN', 'en-US', 'ja-JP'] as const
export const docLocaleStrategy = 'custom-docs-locale'

function localeForPrefix(prefix: string): DocLocale | undefined {
  return docLocales.find(locale => localePrefixes[locale] === prefix)
}

export function docFileLocale(file: string): DocLocale {
  return localeForPrefix(/\.(en|ja)\.md$/.exec(file)?.[1] ?? '') ?? 'zh-CN'
}

export function localizedDocSlug(chapter: string, locale: DocLocale): string {
  return [localePrefixes[locale], chapter].filter(Boolean).join('/')
}

/** 同一章的 Markdown 源文件共享章节标识，保留原中文路径。 */
export function docSlug(file: string, locale = docFileLocale(file)): string {
  const chapter = file.replace(/\.(en|ja)\.md$/, '.md').replace(/(^|\/)README\.md$/, '$1').replace(/\.md$/, '').replace(/\/$/, '')
  // 已发布的英日文工作流对应中文的「从创建到首次交付」。
  return localizedDocSlug(chapter === 'getting-started/workflow'
    ? 'getting-started'
    : chapter, locale)
}

export function docLink(file: string, base: string, locale = docFileLocale(file)): string {
  return docChapterLink(docSlug(file, 'zh-CN'), base, locale)
}

function docChapterLink(chapter: string, base: string, locale: DocLocale): string {
  const slug = localizedDocSlug(chapter, locale)
  return `${base}/docs/${slug
    ? `${slug}/`
    : ''}`
}

export const legacyDocSlugs = ['en', 'ja'].flatMap(language => [
  'README',
  'getting-started/workflow',
  'configuration/core',
  'data/core',
  'function/core',
].map(chapter => `${chapter}.${language}`))

export function parseDocSlug(slug: string): DocChapter {
  const [prefix, ...segments] = slug.replace(/\/$/, '').split('/')
  const locale = localeForPrefix(prefix)
  if (locale && locale !== 'zh-CN') {
    return {
      slug: segments.join('/'),
      locale,
    }
  }
  if (legacyDocSlugs.includes(slug)) {
    const file = `${slug}.md`
    return {
      slug: docSlug(file, 'zh-CN'),
      locale: docFileLocale(file),
    }
  }
  return { slug, locale: 'zh-CN' }
}

export function docChapter(pathname: string, base: string): DocChapter | undefined {
  const prefix = `${base}/docs`
  if (pathname === prefix)
    return parseDocSlug('')
  if (pathname.startsWith(`${prefix}/`))
    return parseDocSlug(pathname.slice(prefix.length + 1).replace(/\/$/, ''))
}

export function docTitle(node: DocNode, locale: DocLocale): string {
  return node.titles?.[locale] ?? node.title
}

export function searchIndexLink(base: string, locale: DocLocale): string {
  return locale === 'zh-CN'
    ? `${base}/search-index.json`
    : `${docChapterLink('', base, locale)}search-index.json`
}
