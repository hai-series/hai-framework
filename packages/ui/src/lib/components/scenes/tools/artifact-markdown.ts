import type { Token } from 'marked'
import type { MarkdownSelectionSnapshot } from '../ai/document-types.js'
import { Marked } from 'marked'
import { renderMarkdownDocument } from '../ai/document-parse.js'
import { createEditorMarkdownExtensions } from '../ai/editor-markdown-extensions.js'
import { sanitizeLinkHref } from '../ai/safe-html.js'

/**
 * 保留复杂源码的可视编辑快照；结构变化失败时不能覆盖原文。
 * @example 模块内部上下文
 * ```ts
 * const result: MarkdownEditResult = { success: true, content: '# 简介' }
 * ```
 */
export type MarkdownEditResult = { success: true, content: string } | { success: false }

/**
 * 当前编辑 DOM 与原始 Markdown 的绑定。
 * @example 模块内部上下文
 * ```ts
 * const session: MarkdownEditSession = { enabled: false, read: () => ({ success: false }), readSelection: () => ({ success: false }) }
 * ```
 */
export interface MarkdownEditSession {
  enabled: boolean
  read: () => MarkdownEditResult
  readSelection: (snapshot: MarkdownSelectionSnapshot) => { success: true, selectedText: string } | { success: false }
}

/** 只忽略排版空白和 Svelte 标记，不忽略有内容的文本。 */
function nodes(host: Node): Node[] {
  return [...host.childNodes].filter(node => node.nodeType !== Node.COMMENT_NODE
    && (node.nodeType !== Node.TEXT_NODE || !!node.textContent?.trim()))
}

/** 保留现有转义语义，避免输入被重新解释为 Markdown 结构。 */
function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replace(/([\\`*_[\]<>~#])/g, '\\$1')
}

/** 支持的行内结构不包含原始 HTML、图像和私有扩展。 */
function supported(token: Token): boolean {
  if (![
    'text',
    'escape',
    'strong',
    'em',
    'del',
    'codespan',
    'link',
    'br',
  ].includes(token.type)) {
    return false
  }
  return !('tokens' in token) || !Array.isArray(token.tokens) || token.tokens.every(supported)
}

/** 已编辑普通块的受限行内序列化；未知结构显式失败。 */
function inline(node: Node): string | undefined {
  if (node.nodeType === Node.TEXT_NODE)
    return escapeText(node.textContent ?? '')
  if (!(node instanceof HTMLElement))
    return undefined
  if (node.tagName === 'BR')
    return '  \n'
  const parts = [...node.childNodes].map(inline)
  if (parts.includes(undefined))
    return undefined
  const text = parts.join('')
  switch (node.tagName) {
    case 'P': case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': return text
    case 'STRONG': case 'B': return `**${text}**`
    case 'EM': case 'I': return `*${text}*`
    case 'DEL': case 'S': return `~~${text}~~`
    case 'CODE': {
      const code = node.textContent ?? ''
      const width = Math.max(1, ...[
        ...code.matchAll(/`+/g),
      ].map(match => match[0].length + 1))
      const fence = '`'.repeat(width)
      return `${fence}${code.startsWith('`') || code.endsWith('`') || (code.startsWith(' ') && code.endsWith(' ') && /[^ ]/.test(code))
        ? ` ${code} `
        : code}${fence}`
    }
    case 'A': {
      const href = sanitizeLinkHref(node.getAttribute('href'))
      const title = node.getAttribute('title')
      const suffix = title === null
        ? ''
        : ` "${title.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
      return href
        ? `[${text}](<${href.replaceAll('>', '%3E')}>${suffix})`
        : undefined
    }
    default: return undefined
  }
}

/** 复杂块只比较业务内容，忽略 Mermaid 渲染和代码复制按钮的显示状态。 */
function signature(node: Node, editable: boolean): string {
  if (node instanceof HTMLElement && !editable) {
    if (node.classList.contains('hai-md-mermaid'))
      return ''
    if (node.classList.contains('hai-md-code-block'))
      return node.querySelector('pre code')?.textContent ?? ''
  }
  return node instanceof Element
    ? node.outerHTML
    : node.textContent ?? ''
}

/**
 * 将普通块的可视选区投影回源码，无法可靠对齐时失败。
 * @example 模块内部上下文
 * ```ts
 * const host = document.createElement('article')
 * host.innerHTML = '<p>Hello <strong>world</strong>.</p>'
 * const result = readMarkdownSelection('Hello **world**.', host, { start: 0, end: 12, text: 'Hello world.' })
 * ```
 */
export function readMarkdownSelection(content: string, host: HTMLElement, snapshot: MarkdownSelectionSnapshot): { success: true, selectedText: string } | { success: false } {
  return captureMarkdownEdit(content, host).readSelection(snapshot)
}

/**
 * 将普通段落/标题绑定到源码位置，其他块锁定并逐字保留。
 * 不使用 innerText 回写全文；无法可靠对齐的文档降级为源码编辑。
 * @example 模块内部上下文
 * ```ts
 * const host = document.createElement('article')
 * host.innerHTML = '<p>原文</p>'
 * const session = captureMarkdownEdit('原文', host)
 * const result = session.read()
 * ```
 */
export function captureMarkdownEdit(content: string, host: HTMLElement): MarkdownEditSession {
  const normalized = content.replace(/\r\n?/g, '\n')
  const sourceOffsets = [0]
  for (let index = 0; index < content.length; index++) {
    if (content[index] === '\r' && content[index + 1] === '\n')
      index++
    sourceOffsets.push(index + 1)
  }
  const lexer = new Marked({
    gfm: true,
    breaks: true,
    extensions: createEditorMarkdownExtensions(),
  })
  const tokens = lexer.lexer(normalized)
  const actual = nodes(host)
  const entries: { start: number, end: number, normalizedStart: number, token: Token, dom: Node[], snapshot: string[], editable: boolean, sourceInline?: string }[] = []
  let cursor = 0
  let domCursor = 0
  for (const token of tokens) {
    const start = cursor
    if (normalized.slice(start, start + token.raw.length) !== token.raw) {
      return {
        enabled: false,
        read: () => ({ success: false }),
        readSelection: () => ({ success: false }),
      }
    }
    cursor += token.raw.length
    const fragment = document.createElement('div')
    for (const block of renderMarkdownDocument(token.raw, { enableHighlight: false, showCopyButton: false }).blocks) {
      if (block.kind === 'html')
        fragment.insertAdjacentHTML('beforeend', block.html)
      else fragment.append(document.createElement('div'))
    }
    const expected = nodes(fragment)
    const dom = actual.slice(domCursor, domCursor + expected.length)
    domCursor += expected.length
    if (dom.length !== expected.length || dom.some((node, index) => node.nodeType !== expected[index]!.nodeType
      || (node instanceof Element && expected[index] instanceof Element && node.tagName !== expected[index]!.tagName))) {
      return {
        enabled: false,
        read: () => ({ success: false }),
        readSelection: () => ({ success: false }),
      }
    }
    const editable = (token.type === 'paragraph' || token.type === 'heading') && 'tokens' in token
      && Array.isArray(token.tokens) && token.tokens.every(supported) && dom.length === 1 && dom[0] instanceof HTMLElement
    if (!editable) {
      for (const node of dom) {
        if (node instanceof HTMLElement)
          node.setAttribute('contenteditable', 'false')
      }
    }
    entries.push({
      start: sourceOffsets[start]!,
      end: sourceOffsets[cursor]!,
      normalizedStart: start,
      token,
      dom,
      editable,
      sourceInline: editable
        ? inline(expected[0]!)
        : undefined,
      snapshot: dom.map(node => signature(node, editable)),
    })
  }
  if (cursor !== normalized.length || domCursor !== actual.length) {
    return {
      enabled: false,
      read: () => ({ success: false }),
      readSelection: () => ({ success: false }),
    }
  }
  return {
    enabled: entries.some(entry => entry.editable),
    readSelection(snapshot) {
      const text = host.textContent ?? ''
      if (!Number.isSafeInteger(snapshot.start) || !Number.isSafeInteger(snapshot.end)
        || snapshot.start < 0 || snapshot.end <= snapshot.start || !snapshot.text.trim()
        || text.slice(snapshot.start, snapshot.end) !== snapshot.text) {
        return { success: false }
      }
      const current = nodes(host)
      if (current.length !== actual.length || current.some((node, index) => node !== actual[index]))
        return { success: false }
      for (const entry of entries) {
        if (!entry.editable || !(entry.dom[0] instanceof HTMLElement) || entry.sourceInline === undefined
          || inline(entry.dom[0]) !== entry.sourceInline || !('tokens' in entry.token) || !Array.isArray(entry.token.tokens)) {
          continue
        }
        const block = entry.dom[0]
        const prefix = document.createRange()
        prefix.selectNodeContents(host)
        prefix.setEndBefore(block)
        const textStart = prefix.toString().length
        const blockText = block.textContent ?? ''
        if (snapshot.start < textStart || snapshot.end > textStart + blockText.length)
          continue
        const tokens: Token[] = entry.token.tokens
        const sourceText = tokens.map(token => token.raw).join('')
        const headingPrefix = entry.token.type === 'heading'
          ? /^ {0,3}#{1,6}[ \t]+/.exec(entry.token.raw)?.[0].length ?? 0
          : 0
        if (entry.token.raw.slice(headingPrefix, headingPrefix + sourceText.length) !== sourceText)
          return { success: false }
        let rawOffset = 0
        let visibleOffset = 0
        const spans = tokens.map((token) => {
          // supported 已排除 HTML、图像和扩展；template 只用于取得与渲染相同的纯文本。
          const template = document.createElement('template')
          template.innerHTML = lexer.parseInline(token.raw, { async: false })
          const visible = template.content.textContent ?? ''
          const span = {
            raw: token.raw,
            visible,
            rawStart: rawOffset,
            visibleStart: visibleOffset,
          }
          rawOffset += token.raw.length
          visibleOffset += visible.length
          return span
        })
        if (spans.map(span => span.visible).join('') !== blockText)
          return { success: false }
        // 格式节点只允许完整取入或排除；切断其边界时拒绝，不能生成失衡 Markdown。
        const boundary = (position: number, edge: 'start' | 'end'): number | undefined => {
          const ordered = edge === 'start'
            ? spans
            : [...spans].reverse()
          for (const span of ordered) {
            if (!span.visible.length)
              continue
            const offset = position - span.visibleStart
            if (offset === (edge === 'start'
              ? 0
              : span.visible.length)) {
              return span.rawStart + (edge === 'start'
                ? 0
                : span.raw.length)
            }
            if (offset > 0 && offset < span.visible.length && span.raw === span.visible)
              return span.rawStart + offset
          }
          return undefined
        }
        const start = boundary(snapshot.start - textStart, 'start')
        const end = boundary(snapshot.end - textStart, 'end')
        if (start === undefined || end === undefined || end <= start)
          return { success: false }
        const sourceStart = sourceOffsets[entry.normalizedStart + headingPrefix + start]
        const sourceEnd = sourceOffsets[entry.normalizedStart + headingPrefix + end]
        if (sourceStart === undefined || sourceEnd === undefined)
          return { success: false }
        return {
          success: true,
          selectedText: content.slice(sourceStart, sourceEnd),
        }
      }
      return { success: false }
    },
    read() {
      const current = nodes(host)
      if (current.length !== actual.length || current.some((node, index) => node !== actual[index]))
        return { success: false }
      let result = ''
      let copied = 0
      for (const entry of entries) {
        result += content.slice(copied, entry.start)
        const unchanged = entry.dom.every((node, index) => signature(node, entry.editable) === entry.snapshot[index])
        if (!entry.editable && !unchanged)
          return { success: false }
        if (!entry.editable || unchanged) {
          result += content.slice(entry.start, entry.end)
        }
        else {
          const value = inline(entry.dom[0]!)
          if (value === undefined)
            return { success: false }
          const prefix = entry.token.type === 'heading' && 'depth' in entry.token
            ? `${'#'.repeat(Number(entry.token.depth))} `
            : ''
          let suffixStart = entry.end
          while (suffixStart > entry.start && /[\r\n]/.test(content.charAt(suffixStart - 1)))
            suffixStart--
          const suffix = content.slice(suffixStart, entry.end)
          const newline = content.includes('\r\n')
            ? '\r\n'
            : '\n'
          const safeValue = value.replace(/^(\s*)([-+])(?=\s)/gm, '$1\\$2').replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2')
          result += prefix + safeValue.replaceAll('\n', newline) + suffix
        }
        copied = entry.end
      }
      return { success: true, content: result + content.slice(copied) }
    },
  }
}
