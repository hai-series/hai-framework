import type { DocChapter, DocLocale } from '../doc-links.js'
import type { DocNavigation, DocNode, SearchEntry } from '../docs-types.js'
import { Buffer } from 'node:buffer'
import { open, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Marked } from 'marked'
import { docFileLocale, docLink, docSlug, docTitle } from '../doc-links.js'

const repository = 'https://github.com/hai-series/hai-framework'
const usageRoot = path.resolve('../../docs/usage')

/** 只处理公开仓库路径，拒绝发布机器路径、私有验收目录和危险协议。 */
export function contentHref(href: string, source: string, base: string, locale = docFileLocale(source)): string {
  if (/^(?:https?:|mailto:|#)/i.test(href))
    return href
  if (/^[a-z][\w+.-]*:/i.test(href) || href.startsWith('//'))
    return '#'
  const target = new URL(href, `https://repository.invalid/docs/usage/${source}`)
  const repositoryPath = decodeURIComponent(target.pathname.slice(1))
  if (/^(?:tmp|test-results)\//.test(repositoryPath))
    return '#'
  if (repositoryPath.startsWith('docs/usage/images/'))
    return `${base}/guide-images/${target.pathname.slice('/docs/usage/images/'.length)}${target.hash}`
  if (repositoryPath.startsWith('docs/usage/') && repositoryPath.endsWith('.md')) {
    const file = repositoryPath.slice('docs/usage/'.length)
    const language = docFileLocale(file)
    const original = docFileLocale(source) !== 'zh-CN' && docSlug(file, 'zh-CN') === docSlug(source, 'zh-CN')
    // 中文专用标题在译文中会变化；跨语言共享的小节使用显式 ASCII 锚点。
    const chineseHeading = target.hash && /\p{Script=Han}/u.test(decodeURIComponent(target.hash))
    const targetLocale = language === 'zh-CN' && !original && !chineseHeading
      ? locale
      : language
    return `${docLink(file, base, targetLocale)}${target.hash}`
  }
  return `${repository}/blob/main/${target.pathname.slice(1)}${target.hash}`
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/[`*_]/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, ' ').trim()
}

function headingSlug(value: string): string {
  return plainText(value).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/ /g, '-')
}

let navigationPromise: Promise<DocNavigation> | undefined
let imageDimensionsPromise: Promise<Map<string, { width: number, height: number }>> | undefined
let catalogPromise: Promise<Awaited<ReturnType<typeof buildCatalog>>> | undefined

/** 读取截图与流程图尺寸，为浏览器预留空间，避免加载图片时把锚点推离视口。 */
function imageDimensions() {
  imageDimensionsPromise ??= readdir(path.join(usageRoot, 'images')).then(async files => new Map(await Promise.all(files.filter(file => /\.(?:png|svg)$/.test(file)).map(async (file) => {
    if (file.endsWith('.svg')) {
      const source = await readFile(path.join(usageRoot, 'images', file), 'utf8')
      const root = /<svg\b[^>]*>/.exec(source)?.[0] ?? ''
      const width = Number(/\bwidth="([1-9]\d{0,4})"/.exec(root)?.[1])
      const height = Number(/\bheight="([1-9]\d{0,4})"/.exec(root)?.[1])
      if (!width || !height)
        throw new Error(`Invalid documentation image dimensions: ${file}`)
      return [
        file,
        { width, height },
      ] as const
    }
    const handle = await open(path.join(usageRoot, 'images', file), 'r')
    try {
      const header = Buffer.alloc(24)
      await handle.read(header, 0, header.length, 0)
      return [
        file,
        {
          width: header.readUInt32BE(16),
          height: header.readUInt32BE(20),
        },
      ] as const
    }
    finally {
      await handle.close()
    }
  }))))
  return imageDimensionsPromise
}
export function getNavigation(): Promise<DocNavigation> {
  navigationPromise ??= readFile(path.join(usageRoot, 'navigation.json'), 'utf8').then(text => JSON.parse(text) as DocNavigation)
  return navigationPromise
}

export async function documentFiles(directory = usageRoot): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory() && entry.name !== 'images' && entry.name !== 'examples')
      return documentFiles(file)
    return entry.isFile() && entry.name.endsWith('.md')
      ? [
          path.relative(usageRoot, file).split(path.sep).join('/'),
        ]
      : []
  }))
  return nested.flat().sort()
}

async function buildCatalog() {
  const files = new Set(await documentFiles())
  const chapters = new Map<string, Partial<Record<DocLocale, string>>>()
  for (const file of files) {
    const slug = docSlug(file, 'zh-CN')
    const locale = docFileLocale(file)
    const sources = chapters.get(slug) ?? {}
    if (!sources[locale] || /\bREADME(?:\.(?:en|ja))?\.md$/.test(file))
      sources[locale] = file
    chapters.set(slug, sources)
  }
  return { files, chapters }
}

function documentCatalog() {
  catalogPromise ??= buildCatalog()
  return catalogPromise
}

/** 以中文章节为准生成三语入口，同名目录由其 README 承接。 */
export async function routeDocuments(): Promise<string[]> {
  const { chapters } = await documentCatalog()
  return [
    ...chapters.values(),
  ].flatMap(sources => sources['zh-CN'] ?? [])
}

function partialTranslation(content: string): boolean {
  return /^<!-- translation: partial -->\s*$/m.test(content)
}

export async function getDocument(file: string, base: string, locale = docFileLocale(file)) {
  const { files } = await documentCatalog()
  if (!files.has(file))
    return undefined
  const content = await readFile(path.join(usageRoot, file), 'utf8')
  const dimensions = await imageDimensions()
  const headings: { id: string, title: string, depth: number }[] = []
  const used = new Map<string, number>()
  const parser = new Marked({
    renderer: {
      code({ text, lang }) {
        // 让 MarkdownRenderer 单独识别 pre 块，保留代码中的空行和缩进。
        const language = lang?.split(/\s+/)[0] ?? 'text'
        return `\n\n<pre><code class="language-${escapeAttribute(language)}">${escapeAttribute(text)}</code></pre>\n\n`
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        const root = headingSlug(text)
        const previous = used.get(root) ?? 0
        used.set(root, previous + 1)
        const id = previous
          ? `${root}-${previous}`
          : root
        headings.push({
          id,
          title: plainText(text),
          depth,
        })
        return `<h${depth} id="${escapeAttribute(id)}">${text}</h${depth}>`
      },
      link({ href, title, tokens }) {
        const target = contentHref(href, file, base, locale)
        const external = /^https?:/.test(target)
        return `<a href="${escapeAttribute(target)}"${title
          ? ` title="${escapeAttribute(title)}"`
          : ''}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${this.parser.parseInline(tokens)}</a>`
      },
      image({ href, text }) {
        const target = contentHref(href, file, base)
        const size = dimensions.get(decodeURIComponent(target.slice(`${base}/guide-images/`.length)))
        return `<a href="${escapeAttribute(target)}"><img src="${escapeAttribute(target)}" alt="${escapeAttribute(text)}" loading="lazy"${size
          ? ` width="${size.width}" height="${size.height}"`
          : ''} /></a>`
      },
    },
  })
  // 最终显示仍使用公共 MarkdownRenderer 的 HTML 消毒边界。
  const html = await parser.parse(content)
  // 公共HTML消毒器不允许任意id；可信文档锚点由Svelte section属性承接，不放宽消毒边界。
  const sectionIds = new Set<string>()
  const sections = html.split(/(?=<h[1-6] id="|<a\s+id=["'])/).map((part) => {
    const candidate = /^(?:<h[1-6]|<a)\s+id=["']([^"']+)["']/.exec(part)?.[1]
    const id = candidate && /^[\p{L}\p{N}_:.\-]+$/u.test(candidate) && !sectionIds.has(candidate)
      ? candidate
      : undefined
    if (id)
      sectionIds.add(id)
    return { id, html: part }
  }).filter(section => section.html.trim())
  const title = headings.find(heading => heading.depth === 1)?.title ?? file
  const description = plainText(content.replace(/^#.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')).replace(/\s+/g, ' ').slice(0, 160)
  return {
    file,
    locale,
    sourceLocale: docFileLocale(file),
    partialTranslation: partialTranslation(content),
    title,
    description,
    sections,
    headings: headings.filter(heading => heading.depth === 2 || heading.depth === 3),
    sourceUrl: `${repository}/blob/main/docs/usage/${file}`,
  }
}

export async function getDocumentPage(chapter: DocChapter, base: string) {
  const { chapters } = await documentCatalog()
  const sources = chapters.get(chapter.slug)
  const original = sources?.['zh-CN']
  if (!original)
    return undefined
  return getDocument(sources[chapter.locale] ?? original, base, chapter.locale)
}

export async function searchIndex(base: string, locale: DocLocale = 'zh-CN'): Promise<SearchEntry[]> {
  const navigation = await getNavigation()
  const { chapters } = await documentCatalog()
  function collect(nodes: DocNode[]): DocNode[] {
    return nodes.flatMap(node => [
      node,
      ...collect(node.children ?? []),
    ])
  }
  const nodes = new Map<string, string>(collect(navigation.sections).map(node => [
    docSlug(node.path, 'zh-CN'),
    docTitle(node, locale),
  ]))
  nodes.set('', navigation.locales[locale].title)
  return Promise.all([
    ...nodes.entries(),
  ].map(async ([chapter, title]) => {
    const sources = chapters.get(chapter)
    const file = sources?.[locale] ?? sources?.['zh-CN']
    if (!file)
      throw new Error(`Missing documentation source: ${chapter}`)
    const content = await readFile(path.join(usageRoot, file), 'utf8')
    const sourceLocale = docFileLocale(file)
    return {
      title: sourceLocale === locale
        ? content.split('\n').find(line => line.startsWith('# '))?.slice(2).trim() ?? title
        : title,
      href: docLink(file, base, locale),
      text: content.replace(/<!--[\s\S]*?-->|!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#`*_>|]/g, ' ').replace(/\s+/g, ' ').trim(),
      sourceLocale,
      partialTranslation: partialTranslation(content),
    }
  }))
}
