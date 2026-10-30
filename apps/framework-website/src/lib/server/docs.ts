import type { DocNavigation, DocNode, SearchEntry } from '../docs-types.js'
import { Buffer } from 'node:buffer'
import { open, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Marked } from 'marked'
import { docLink, docSlug } from '../doc-links.js'

const repository = 'https://github.com/hai-series/hai-framework'
const usageRoot = path.resolve('../../docs/usage')

/** 只处理公开仓库路径，拒绝发布机器路径、私有验收目录和危险协议。 */
export function contentHref(href: string, source: string, base: string): string {
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
  if (repositoryPath.startsWith('docs/usage/') && repositoryPath.endsWith('.md'))
    return `${docLink(repositoryPath.slice('docs/usage/'.length), base)}${target.hash}`
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
      return [file, { width, height }] as const
    }
    const handle = await open(path.join(usageRoot, 'images', file), 'r')
    try {
      const header = Buffer.alloc(24)
      await handle.read(header, 0, header.length, 0)
      return [file, { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }] as const
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
    return entry.isFile() && entry.name.endsWith('.md') ? [path.relative(usageRoot, file).split(path.sep).join('/')] : []
  }))
  return nested.flat().sort()
}

/** 平铺兼容入口与新目录入口重名时，路由只保留目录中的正式章节。 */
export async function routeDocuments(): Promise<string[]> {
  const routes = new Map<string, string>()
  for (const file of await documentFiles()) {
    const slug = docSlug(file)
    if (!routes.has(slug) || file.endsWith('/README.md'))
      routes.set(slug, file)
  }
  return [...routes.values()]
}

export async function getDocument(file: string, base: string) {
  const files = await documentFiles()
  if (!files.includes(file))
    return undefined
  const content = await readFile(path.join(usageRoot, file), 'utf8')
  const dimensions = await imageDimensions()
  const headings: { id: string, title: string, depth: number }[] = []
  const used = new Map<string, number>()
  const parser = new Marked({ renderer: {
    code({ text, lang }) {
      // 公共 MarkdownRenderer 按语言安全重建代码高亮；校验元数据不进入语言名。
      const language = lang?.split(/\s+/)[0] ?? 'text'
      return `<pre><code class="language-${escapeAttribute(language)}">${escapeAttribute(text)}</code></pre>`
    },
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens)
      const root = headingSlug(text)
      const previous = used.get(root) ?? 0
      used.set(root, previous + 1)
      const id = previous ? `${root}-${previous}` : root
      headings.push({ id, title: plainText(text), depth })
      return `<h${depth} id="${escapeAttribute(id)}">${text}</h${depth}>`
    },
    link({ href, title, tokens }) {
      const target = contentHref(href, file, base)
      const external = /^https?:/.test(target)
      return `<a href="${escapeAttribute(target)}"${title ? ` title="${escapeAttribute(title)}"` : ''}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${this.parser.parseInline(tokens)}</a>`
    },
    image({ href, text }) {
      const target = contentHref(href, file, base)
      const size = dimensions.get(decodeURIComponent(target.slice(`${base}/guide-images/`.length)))
      return `<a href="${escapeAttribute(target)}"><img src="${escapeAttribute(target)}" alt="${escapeAttribute(text)}" loading="lazy"${size ? ` width="${size.width}" height="${size.height}"` : ''} /></a>`
    },
  } })
  // 最终显示仍使用公共 MarkdownRenderer 的 HTML 消毒边界。
  const html = await parser.parse(content)
  // 公共HTML消毒器不允许任意id；可信文档锚点由Svelte section属性承接，不放宽消毒边界。
  const sectionIds = new Set<string>()
  const sections = html.split(/(?=<h[1-6] id="|<a\s+id=["'])/).map((part) => {
    const candidate = /^(?:<h[1-6]|<a)\s+id=["']([^"']+)["']/.exec(part)?.[1]
    const id = candidate && /^[\p{L}\p{N}_:.\-]+$/u.test(candidate) && !sectionIds.has(candidate) ? candidate : undefined
    if (id)
      sectionIds.add(id)
    return { id, html: part }
  }).filter(section => section.html.trim())
  const title = headings.find(heading => heading.depth === 1)?.title ?? file
  const description = plainText(content.replace(/^#.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')).replace(/\s+/g, ' ').slice(0, 160)
  return { file, title, description, sections, headings: headings.filter(heading => heading.depth === 2 || heading.depth === 3), sourceUrl: `${repository}/blob/main/docs/usage/${file}` }
}

export async function searchIndex(base: string): Promise<SearchEntry[]> {
  const navigation = await getNavigation()
  function collect(nodes: DocNode[]): string[] {
    return nodes.flatMap(node => [node.path, ...collect(node.children ?? [])])
  }
  const files = [...new Set([...collect(navigation.sections), ...Object.values(navigation.locales).map(locale => locale.path), 'getting-started/workflow.en.md', 'getting-started/workflow.ja.md'])]
  return Promise.all(files.map(async (file) => {
    const content = await readFile(path.join(usageRoot, file), 'utf8')
    return { title: content.split('\n').find(line => line.startsWith('# '))?.slice(2).trim() ?? file, href: docLink(file, base), text: content.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#`*_>|]/g, ' ').replace(/\s+/g, ' ').trim() }
  }))
}
