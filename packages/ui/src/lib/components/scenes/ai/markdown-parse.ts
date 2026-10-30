/**
 * @h-ai/ui — Markdown 解析工具
 *
 * 基于 marked + Shiki 的 Markdown 解析引擎。
 * 支持 GFM（GitHub Flavored Markdown），包含代码高亮、表格、任务列表等。
 * @module markdown-parse
 */

import type { RendererObject, Tokens } from 'marked'
import { Marked } from 'marked'
import { uiM } from '../../../messages.js'
import { createEditorMarkdownExtensions } from './editor-markdown-extensions.js'
import { highlightCode, isLanguageSupported } from './highlight.js'
import {
  escapeHtml,
  isExternalLinkHref,
  sanitizeImageSrc,
  sanitizeLinkHref,
  sanitizeMarkdownHtml,
} from './safe-html.js'

/**
 * Markdown 解析配置
 *
 * @example
 * ```ts
 * import type { MarkdownParseOptions } from '@h-ai/ui'
 * const example: MarkdownParseOptions = { enableHighlight: true, allowHtmlTags: false, showCopyButton: true }
 * ```
 */
export interface MarkdownParseOptions {
  /** 是否启用代码语法高亮（默认 true） */
  enableHighlight?: boolean
  /** 是否显示代码块的复制按钮（默认 true） */
  showCopyButton?: boolean
  /** 是否将换行符转换为 <br>（默认 true，适合 AI 输出） */
  breaks?: boolean
  /** 是否按安全白名单解析原始 HTML（默认 false）；img可保留1–99999正整数width/height以预留空间 */
  allowHtmlTags?: boolean
}

function readHtmlTokenSource(token: Tokens.HTML | Tokens.Tag): string {
  if ('raw' in token && typeof token.raw === 'string') {
    return token.raw
  }

  return 'text' in token && typeof token.text === 'string'
    ? token.text
    : ''
}

function createTableCellAttrs(cell: Tokens.TableCell): string {
  const attrs = []

  if (cell.align) {
    attrs.push(`style="text-align:${cell.align}"`)
  }

  if (cell.text.trim()) {
    attrs.push(`title="${escapeHtml(cell.text)}"`)
  }

  return attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
}

/** 围栏代码和 HTML 代码共用渲染，颜色与复制控件始终由框架生成。 */
function renderCodeBlock(text: string, lang: string | undefined, options: Required<MarkdownParseOptions>): string {
  const language = lang && isLanguageSupported(lang) ? lang : ''
  let highlighted: string

  if (options.enableHighlight && language) {
    highlighted = highlightCode(text, language)
  }
  else if (options.enableHighlight) {
    // 未指定语言时不做自动检测，直接转义
    highlighted = escapeHtml(text)
  }
  else {
    highlighted = escapeHtml(text)
  }

  const langLabel = language
    ? `<span class="hai-md-code-lang">${escapeHtml(language)}</span>`
    : ''
  const copyBtn = options.showCopyButton
    ? `<button type="button" class="hai-md-copy-btn" data-copy-code aria-label="${escapeHtml(uiM('markdown_copy_code'))}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`
    : ''

  return `<div class="hai-md-code-block">`
    + `<div class="hai-md-code-header">${langLabel}${copyBtn}</div>`
    + `<pre><code class="hai-hl${language ? ` language-${escapeHtml(language)}` : ''}">${highlighted}</code></pre>`
    + `</div>`
}

/** 仅还原代码文本的实体；随后仍按普通代码转义，绝不把代码中的标签作为 HTML 执行。 */
function decodeCodeText(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: '\u00A0' }
  return text.replace(/&(#(?:[xX][\da-fA-F]+|\d+)|amp|lt|gt|quot|apos|nbsp);/g, (entity, key: string) => {
    if (!key.startsWith('#'))
      return named[key] ?? entity
    const code = key[1]?.toLowerCase() === 'x' ? Number.parseInt(key.slice(2), 16) : Number(key.slice(1))
    return code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : entity
  })
}

/** 重建 pre/code，不保留输入的 style、事件或任意 class；其余 HTML 继续通过原有白名单。 */
function renderHtmlWithCode(source: string, options: Required<MarkdownParseOptions>): string {
  let html = ''
  let offset = 0
  for (const match of source.matchAll(/<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi)) {
    html += sanitizeMarkdownHtml(source.slice(offset, match.index))
    const classes = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(match[1])
    const language = /(?:^|\s)language-([a-z\d#+.-]+)(?:\s|$)/i.exec(classes?.[1] ?? classes?.[2] ?? '')?.[1]
    html += renderCodeBlock(decodeCodeText(match[2]), language, options)
    offset = match.index + match[0].length
  }
  return html + sanitizeMarkdownHtml(source.slice(offset))
}

/**
 * 创建自定义渲染器对象
 *
 * @param options - 解析配置
 * @returns marked RendererObject
 */
function createRendererObject(options: Required<MarkdownParseOptions>): RendererObject {
  return {
    // 代码块：语法高亮 + 语言标签 + 复制按钮
    code({ text, lang }: Tokens.Code): string {
      return renderCodeBlock(text, lang, options)
    },

    // 原始 HTML 块：转义以防止 XSS
    html(token: Tokens.HTML | Tokens.Tag): string {
      const source = readHtmlTokenSource(token)
      return options.allowHtmlTags
        ? renderHtmlWithCode(source, options)
        : escapeHtml(source)
    },

    // 链接：外部链接自动添加 target="_blank"，阻止危险协议
    link({ href, title, tokens }: Tokens.Link): string {
      const text = this.parser.parseInline(tokens)
      // 安全检查：仅允许安全协议
      const safeHref = sanitizeLinkHref(href)
      const isExternal = safeHref && isExternalLinkHref(safeHref)
      const attrs = [
        `href="${escapeHtml(safeHref)}"`,
        title ? `title="${escapeHtml(title)}"` : '',
        isExternal ? 'target="_blank" rel="noopener noreferrer"' : '',
      ].filter(Boolean).join(' ')
      return `<a ${attrs}>${text}</a>`
    },

    // 图片：添加 loading="lazy"，验证 src 协议
    image({ href, title, text }: Tokens.Image): string {
      // 安全检查：仅允许安全协议
      const safeSrc = sanitizeImageSrc(href)
      const attrs = [
        `src="${escapeHtml(safeSrc)}"`,
        `alt="${escapeHtml(text || '')}"`,
        title ? `title="${escapeHtml(title)}"` : '',
        'loading="lazy"',
        'class="hai-md-img"',
      ].filter(Boolean).join(' ')
      return `<img ${attrs} />`
    },

    // 表格：添加响应式包裹容器
    table(token: Tokens.Table): string {
      let headerHtml = ''
      for (const cell of token.header) {
        headerHtml += `<th${createTableCellAttrs(cell)}>${this.parser.parseInline(cell.tokens)}</th>`
      }

      let bodyHtml = ''
      for (const row of token.rows) {
        let rowHtml = ''
        for (const cell of row) {
          rowHtml += `<td${createTableCellAttrs(cell)}>${this.parser.parseInline(cell.tokens)}</td>`
        }
        bodyHtml += `<tr>${rowHtml}</tr>`
      }

      return `<div class="hai-md-table-wrap">`
        + `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
        + `</div>`
    },
  }
}

/**
 * 创建 Markdown 解析器实例
 *
 * @param options - 解析配置
 * @returns 配置好的 Marked 实例
 */
function createMarkedInstance(options: Required<MarkdownParseOptions>): Marked {
  return new Marked({
    renderer: createRendererObject(options),
    extensions: createEditorMarkdownExtensions(),
    gfm: true,
    breaks: options.breaks,
  })
}

/** 默认配置 */
const DEFAULT_OPTIONS: Required<MarkdownParseOptions> = {
  enableHighlight: true,
  showCopyButton: true,
  breaks: true,
  allowHtmlTags: false,
}

/** 缓存 Marked 实例，避免重复创建 */
let cachedInstance: Marked | null = null
let cachedOptionsKey = ''

/**
 * 获取配置签名，用于实例缓存比较
 */
function getOptionsKey(options: Required<MarkdownParseOptions>): string {
  return `${options.enableHighlight}-${options.showCopyButton}-${options.breaks}-${options.allowHtmlTags}`
}

/**
 * 将 Markdown 文本解析为 HTML
 *
 * @param content - Markdown 源文本
 * @param options - 可选的解析配置
 * @returns 解析后的 HTML 字符串
 *
 * @example
 * ```ts
 * import { parseMarkdown } from '@h-ai/ui'
 * const html = parseMarkdown('# 简介\n**重点**', { allowHtmlTags: false })
 * ```
 */
export function parseMarkdown(content: string, options?: MarkdownParseOptions): string {
  if (!content)
    return ''

  const mergedOptions: Required<MarkdownParseOptions> = { ...DEFAULT_OPTIONS, ...options }
  const key = getOptionsKey(mergedOptions)

  if (!cachedInstance || cachedOptionsKey !== key) {
    cachedInstance = createMarkedInstance(mergedOptions)
    cachedOptionsKey = key
  }

  const result = cachedInstance.parse(content)
  // marked.parse 可能返回 string | Promise<string>，此处同步调用
  return typeof result === 'string' ? result : ''
}
