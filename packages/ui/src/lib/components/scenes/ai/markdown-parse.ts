/**
 * @h-ai/ui — Markdown 解析工具
 *
 * 基于 marked + highlight.js 的 Markdown 解析引擎。
 * 支持 GFM（GitHub Flavored Markdown），包含代码高亮、表格、任务列表等。
 * @module markdown-parse
 */

import type { RendererObject, Tokens } from 'marked'
import hljs from 'highlight.js/lib/common'
import { Marked } from 'marked'

/**
 * Markdown 解析配置
 */
export interface MarkdownParseOptions {
  /** 是否启用代码语法高亮（默认 true） */
  enableHighlight?: boolean
  /** 是否显示代码块的复制按钮（默认 true） */
  showCopyButton?: boolean
  /** 是否将换行符转换为 <br>（默认 true，适合 AI 输出） */
  breaks?: boolean
}

/**
 * 对 HTML 特殊字符进行转义
 *
 * @param text - 原始文本
 * @returns 转义后的安全文本
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
      const language = lang && hljs.getLanguage(lang) ? lang : ''
      let highlighted: string

      if (options.enableHighlight && language) {
        highlighted = hljs.highlight(text, { language }).value
      }
      else if (options.enableHighlight) {
        highlighted = hljs.highlightAuto(text).value
      }
      else {
        highlighted = escapeHtml(text)
      }

      const langLabel = language
        ? `<span class="hai-md-code-lang">${escapeHtml(language)}</span>`
        : ''
      const copyBtn = options.showCopyButton
        ? `<button type="button" class="hai-md-copy-btn" data-copy-code aria-label="Copy code"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`
        : ''

      return `<div class="hai-md-code-block">`
        + `<div class="hai-md-code-header">${langLabel}${copyBtn}</div>`
        + `<pre><code class="hljs${language ? ` language-${escapeHtml(language)}` : ''}">${highlighted}</code></pre>`
        + `</div>`
    },

    // 链接：外部链接自动添加 target="_blank"
    link({ href, title, tokens }: Tokens.Link): string {
      const text = this.parser.parseInline(tokens)
      const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'))
      const attrs = [
        `href="${escapeHtml(href || '')}"`,
        title ? `title="${escapeHtml(title)}"` : '',
        isExternal ? 'target="_blank" rel="noopener noreferrer"' : '',
      ].filter(Boolean).join(' ')
      return `<a ${attrs}>${text}</a>`
    },

    // 图片：添加 loading="lazy"
    image({ href, title, text }: Tokens.Image): string {
      const attrs = [
        `src="${escapeHtml(href || '')}"`,
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
        const align = cell.align ? ` style="text-align:${cell.align}"` : ''
        headerHtml += `<th${align}>${this.parser.parseInline(cell.tokens)}</th>`
      }

      let bodyHtml = ''
      for (const row of token.rows) {
        let rowHtml = ''
        for (const cell of row) {
          const align = cell.align ? ` style="text-align:${cell.align}"` : ''
          rowHtml += `<td${align}>${this.parser.parseInline(cell.tokens)}</td>`
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
    gfm: true,
    breaks: options.breaks,
  })
}

/** 默认配置 */
const DEFAULT_OPTIONS: Required<MarkdownParseOptions> = {
  enableHighlight: true,
  showCopyButton: true,
  breaks: true,
}

/** 缓存 Marked 实例，避免重复创建 */
let cachedInstance: Marked | null = null
let cachedOptionsKey = ''

/**
 * 获取配置签名，用于实例缓存比较
 */
function getOptionsKey(options: Required<MarkdownParseOptions>): string {
  return `${options.enableHighlight}-${options.showCopyButton}-${options.breaks}`
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
 * const html = parseMarkdown('# Hello\n\nWorld')
 * // => '<h1>Hello</h1>\n<p>World</p>\n'
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
