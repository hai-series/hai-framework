import type { Token } from 'marked'
import type { MarkdownSelectionSnapshot, MarkdownSourceRange } from './document-types.js'
import { marked } from 'marked'

/**
 * 来自一个递归 Markdown 字元的连续文本段和 UTF-16 起点。
 * @example 模块内部上下文
 * ```ts
 * const run: SourceText = { text: '重点', start: 2 }
 * ```
 */
interface SourceText {
  /** 原样存在于 Markdown 中的渲染文字。 */
  text: string
  /** 文字在完整 Markdown 中的起点。 */
  start: number
}

function findTextRuns(tokens: readonly Token[], parent: string, base: number, runs: SourceText[]): boolean {
  let cursor = 0
  for (const token of tokens) {
    const start = parent.indexOf(token.raw, cursor)
    if (start < 0)
      return false
    const raw = token.raw
    cursor = start + raw.length
    const absoluteStart = base + start
    if (token.type === 'space' || token.type === 'br' || token.type === 'hr' || token.type === 'def')
      continue
    if (token.type === 'list') {
      if (!findTextRuns(token.items, raw, absoluteStart, runs))
        return false
      continue
    }
    if (![
      'list_item',
      'heading',
      'paragraph',
      'strong',
      'em',
      'del',
      'link',
      'text',
      'codespan',
    ].includes(token.type)) {
      return false
    }

    const text = 'text' in token && typeof token.text === 'string'
      ? token.text
      : undefined
    const children = 'tokens' in token
      ? token.tokens
      : undefined
    if (Array.isArray(children) && children.length > 0) {
      const childStart = token.type === 'list_item' || text === undefined
        ? 0
        : raw.indexOf(text)
      if (childStart < 0 || !findTextRuns(children, text !== undefined && token.type !== 'list_item'
        ? text
        : raw, absoluteStart + childStart, runs)) {
        return false
      }
    }
    else if (text) {
      const textStart = raw.indexOf(text)
      if (textStart < 0)
        return false
      runs.push({ text, start: absoluteStart + textStart })
    }
  }
  return true
}

/**
 * 对照实际 DOM 文本和 Markdown 字元顺序，只返回与选中文本完全相同的连续原文。
 * 不支持的语法、插入的显示文字与无法还原的 Markdown 均没有可用位置。
 * @example 模块内部上下文
 * ```ts
 * const range = resolveMarkdownSourceRange('**重点**', '重点', { start: 0, end: 2, text: '重点' })
 * ```
 */
export function resolveMarkdownSourceRange(markdown: string, plainText: string, selection: MarkdownSelectionSnapshot): MarkdownSourceRange | undefined {
  if (plainText.slice(selection.start, selection.end).trim() !== selection.text.trim())
    return undefined
  const runs: SourceText[] = []
  if (!findTextRuns(marked.lexer(markdown), markdown, 0, runs))
    return undefined
  const positions: number[] = []
  let rendered = ''
  for (const run of runs) {
    for (const match of run.text.matchAll(/\S/g)) {
      rendered += match[0]
      positions.push(run.start + match.index)
    }
  }
  if (rendered !== plainText.replace(/\s/g, ''))
    return undefined
  const first = plainText.slice(0, selection.start).replace(/\s/g, '').length
  const size = selection.text.replace(/\s/g, '').length
  if (!size || first + size > positions.length)
    return undefined
  const start = positions[first]
  const end = positions[first + size - 1] + 1
  const text = markdown.slice(start, end)
  return text === selection.text.trim()
    ? { start, end, text }
    : undefined
}
