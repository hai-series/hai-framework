/**
 * @h-ai/ai — HTML 文本提取
 *
 * 使用 HTML 解析器识别结构，不执行脚本；迭代遍历避免深层文档递归。
 * @module ai-file-html
 */
import type { DefaultTreeAdapterTypes } from 'parse5'
import type { OutputFormat } from './ai-file-types.js'
import { parseFragment } from 'parse5'

const OMITTED_TAGS = new Set(['script', 'style'])
const MARKDOWN_MARKERS: Readonly<Record<string, readonly [string, string]>> = {
  p: ['', '\n\n'],
  div: ['', '\n\n'],
  section: ['', '\n\n'],
  article: ['', '\n\n'],
  header: ['', '\n\n'],
  footer: ['', '\n\n'],
  main: ['', '\n\n'],
  nav: ['', '\n\n'],
  aside: ['', '\n\n'],
  ul: ['\n', '\n'],
  ol: ['\n', '\n'],
  li: ['\n- ', ''],
  strong: ['**', '**'],
  b: ['**', '**'],
  em: ['*', '*'],
  i: ['*', '*'],
  br: ['\n', ''],
  hr: ['\n\n---\n\n', ''],
}

/** template 的惰性内容也属于文件文本，按普通子节点提取。 */
function children(node: DefaultTreeAdapterTypes.Node): readonly DefaultTreeAdapterTypes.ChildNode[] {
  if ('content' in node)
    return node.content.childNodes
  return 'childNodes' in node
    ? node.childNodes
    : []
}

/** 只收集文本节点；标记间隔用于保持纯文本模式原有的分词边界。 */
function textContent(node: DefaultTreeAdapterTypes.Node, separateTags = false): string {
  const pending: Array<DefaultTreeAdapterTypes.Node | string> = [node]
  const output: string[] = []
  while (pending.length) {
    const current = pending.pop()!
    if (typeof current === 'string') {
      output.push(current)
      continue
    }
    if ('value' in current) {
      output.push(current.value)
      continue
    }
    if ('tagName' in current && OMITTED_TAGS.has(current.tagName))
      continue
    if (separateTags && 'tagName' in current) {
      output.push(' ')
      pending.push(' ')
    }
    const nested = children(current)
    for (let index = nested.length - 1; index >= 0; index--)
      pending.push(nested[index]!)
  }
  return output.join('')
}

/** 代码内容可能包含反引号，围栏长度超过正文的最长连续反引号。 */
function codeMarkdown(value: string, block: boolean): string {
  const content = block
    ? value.trim()
    : value
  let longest = 0
  let current = 0
  for (const character of content) {
    current = character === '`'
      ? current + 1
      : 0
    longest = Math.max(longest, current)
  }
  const fence = '`'.repeat(Math.max(block ? 3 : 1, longest + 1))
  if (block)
    return `\n${fence}\n${content}\n${fence}\n`
  const padding = content.startsWith('`') || content.endsWith('`')
    ? ' '
    : ''
  return `${fence}${padding}${content}${padding}${fence}`
}

/** 结构节点只产生 Markdown 标记；输出不承担 HTML 净化或 URL 授权。 */
function markdown(root: DefaultTreeAdapterTypes.DocumentFragment): string {
  const pending: Array<DefaultTreeAdapterTypes.Node | string> = [root]
  const output: string[] = []
  while (pending.length) {
    const node = pending.pop()!
    if (typeof node === 'string') {
      output.push(node)
      continue
    }
    if ('value' in node) {
      output.push(node.value)
      continue
    }
    if ('tagName' in node && OMITTED_TAGS.has(node.tagName))
      continue
    let opening = ''
    let closing = ''
    if ('tagName' in node) {
      const tag = node.tagName
      const attribute = (name: string) => node.attrs.find(item => item.name === name)?.value
      if (tag === 'pre' || tag === 'code') {
        output.push(codeMarkdown(textContent(node), tag === 'pre'))
        continue
      }
      if (tag === 'blockquote') {
        output.push(`\n${textContent(node).trim().split('\n').map(line => `> ${line.trim()}`).filter(line => line !== '> ').join('\n')}\n`)
        continue
      }
      if (tag === 'img') {
        output.push(`![${attribute('alt') ?? ''}](${attribute('src') ?? ''})`)
        continue
      }
      if (tag === 'tr') {
        const cells = children(node).filter(child => 'tagName' in child && (child.tagName === 'td' || child.tagName === 'th'))
        output.push(`| ${cells.map(cell => textContent(cell).trim()).join(' | ')} |\n`)
        continue
      }
      if (tag === 'a' && attribute('href') !== undefined) {
        opening = '['
        closing = `](${attribute('href')})`
      }
      else if (/^h[1-6]$/.test(tag)) {
        opening = `\n${'#'.repeat(Number(tag[1]))} `
        closing = '\n\n'
      }
      else {
        [opening, closing] = MARKDOWN_MARKERS[tag] ?? ['', '']
      }
    }
    output.push(opening)
    if (closing)
      pending.push(closing)
    const nested = children(node)
    for (let index = nested.length - 1; index >= 0; index--)
      pending.push(nested[index]!)
  }
  return output.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 提取 HTML 文本或 Markdown；返回值不是已净化的可执行 HTML。
 * @param content - HTML 原文。
 * @param outputFormat - 文本或 Markdown。
 * @returns 完整的提取内容。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * const text = parseHtmlFile('<p>Hello</p>', 'text')
 * ```
 */
export function parseHtmlFile(content: string, outputFormat: OutputFormat): string {
  const document = parseFragment(content)
  return outputFormat === 'markdown'
    ? markdown(document)
    : textContent(document, true).replace(/\s+/g, ' ').trim()
}
