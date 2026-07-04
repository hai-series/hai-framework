/**
 * @h-ai/ui — Markdown document parsing helpers
 *
 * Extracts HTML, outline, and code block metadata for document-mode rendering.
 */

import type { RendererObject, Tokens } from 'marked'
import type { MarkdownCodeBlockItem, MarkdownOutlineItem } from './document-types.js'
import { Marked } from 'marked'
import {
  createEditorMarkdownExtensions,
  extractPlainTextFromTokens,
} from './editor-markdown-extensions.js'
import { highlightCode, isLanguageSupported } from './highlight.js'
import { isMermaidLanguage } from './mermaid-render.js'
import {
  escapeHtml,
  isExternalLinkHref,
  sanitizeImageSrc,
  sanitizeLinkHref,
  sanitizeMarkdownHtml,
} from './safe-html.js'

export interface MarkdownDocumentParseOptions {
  /** Whether to enable syntax highlighting for code blocks. */
  enableHighlight?: boolean
  /** Whether to render the copy button in code blocks. */
  showCopyButton?: boolean
  /** Whether to render the run button and preview slot. */
  showRunButton?: boolean
  /** Whether to render code/preview tabs in code-block headers. */
  showCodePreviewToggle?: boolean
  /** Label used for the "code" tab when preview toggle is enabled. */
  codeViewCodeLabel?: string
  /** Label used for the "preview" tab when preview toggle is enabled. */
  codeViewPreviewLabel?: string
  /** Optional helper text displayed beside language in code headers. */
  codePreviewHint?: string
  /** Whether soft line breaks are converted to <br>. */
  breaks?: boolean
  /** Whether raw HTML tags are parsed through a safe allowlist. */
  allowHtmlTags?: boolean
}

export interface MarkdownRenderResult {
  /** Rendered HTML output. */
  html: string
  /** Extracted outline items for navigation. */
  outline: MarkdownOutlineItem[]
  /** Extracted code blocks for run/copy features. */
  codeBlocks: MarkdownCodeBlockItem[]
}

interface MarkdownRenderState {
  /** Raw outline data before numbering is applied. */
  outline: Array<Omit<MarkdownOutlineItem, 'numberedTitle'>>
  /** Code blocks collected during rendering. */
  codeBlocks: MarkdownCodeBlockItem[]
  /** Heading id counter map for stable de-duplication. */
  headingIds: Map<string, number>
}

/** Default parsing options for document mode. */
const DEFAULT_OPTIONS: Required<MarkdownDocumentParseOptions> = {
  enableHighlight: true,
  showCopyButton: true,
  showRunButton: false,
  showCodePreviewToggle: false,
  codeViewCodeLabel: 'Code',
  codeViewPreviewLabel: 'Preview',
  codePreviewHint: '',
  breaks: true,
  allowHtmlTags: false,
}

function readHtmlTokenSource(token: Tokens.HTML | Tokens.Tag): string {
  if ('raw' in token && typeof token.raw === 'string') {
    return token.raw
  }

  return 'text' in token && typeof token.text === 'string'
    ? token.text
    : ''
}

/**
 * 判断 fenced code block 是否已经输出闭合 fence。
 *
 * marked 在流式半截内容里也会把未闭合 fence 识别成 code token；如果此时提前
 * 调用 Mermaid，会把临时语法错误渲染成错误 SVG 并残留在界面上。
 */
function isClosedFencedCodeBlock(token: Tokens.Code): boolean {
  const firstLineEnd = token.raw.indexOf('\n')
  const firstLine = firstLineEnd === -1
    ? token.raw
    : token.raw.slice(0, firstLineEnd)
  const openingStart = firstLine.search(/\S/)
  if (openingStart === -1 || openingStart > 3) {
    return true
  }

  const markerChar = firstLine[openingStart]
  if (markerChar !== '`' && markerChar !== '~') {
    return true
  }

  let markerLength = 0
  for (
    let index = openingStart;
    firstLine[index] === markerChar;
    index += 1
  ) {
    markerLength += 1
  }
  if (markerLength < 3) {
    return true
  }

  const trimmedRaw = token.raw.trimEnd()
  const lastLineStart = trimmedRaw.lastIndexOf('\n')
  if (lastLineStart === -1) {
    return false
  }

  const closingFence = trimmedRaw.slice(lastLineStart + 1).trim()
  return closingFence.length >= markerLength
    && [...closingFence].every(char => char === markerChar)
}

/**
 * Create a URL-safe heading slug while keeping letters and digits.
 */
function slugifyHeading(text: string): string {
  // normalized slug used as the base key for headings.
  const normalized = text
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'section'
}

/**
 * Generate a stable heading id, de-duplicating repeated titles.
 */
function createHeadingId(state: MarkdownRenderState, text: string): string {
  // base slug before de-duplication.
  const base = slugifyHeading(text)
  // next count per slug ensures stable suffixing.
  const nextCount = (state.headingIds.get(base) ?? 0) + 1
  state.headingIds.set(base, nextCount)
  return nextCount === 1 ? base : `${base}-${nextCount}`
}

/**
 * Add numeric prefixes (1, 1.1, 1.1.1) to outline items.
 */
function createNumberedOutline(
  outline: Array<Omit<MarkdownOutlineItem, 'numberedTitle'>>,
): MarkdownOutlineItem[] {
  // counters track the current numbering state per heading depth.
  const counters = [0, 0, 0, 0, 0, 0]

  return outline.map((item) => {
    // levelIndex caps the depth within 1-6.
    const levelIndex = Math.max(0, Math.min(5, item.level - 1))
    counters[levelIndex] += 1
    for (let index = levelIndex + 1; index < counters.length; index += 1) {
      counters[index] = 0
    }

    // prefix is the dotted numbering prefix for the current heading.
    const prefix = counters
      .slice(0, levelIndex + 1)
      .filter(count => count > 0)
      .join('.')

    return {
      ...item,
      numberedTitle: prefix ? `${prefix} ${item.text}` : item.text,
    }
  })
}

/**
 * Build the marked renderer with outline extraction and code metadata.
 */
function createRendererObject(
  options: Required<MarkdownDocumentParseOptions>,
  state: MarkdownRenderState,
): RendererObject {
  return {
    heading(token: Tokens.Heading): string {
      // depth is clamped to the valid heading range.
      const depth = Math.max(1, Math.min(6, token.depth))
      // text 需要剥离自定义 span / 强调等 inline token，保证目录显示的是用户可见标题。
      const text = extractPlainTextFromTokens(token.tokens).trim()
      // id is the stable anchor for outline navigation.
      const id = createHeadingId(state, text)
      state.outline.push({
        id,
        text: text || `Section ${state.outline.length + 1}`,
        level: depth,
      })

      // headingHtml preserves inline markdown in headings.
      const headingHtml = this.parser.parseInline(token.tokens)
      return `<h${depth} id="${escapeHtml(id)}" data-heading-id="${escapeHtml(id)}">${headingHtml}</h${depth}>`
    },

    code(token: Tokens.Code): string {
      const { text, lang } = token
      // rawLanguage is the original info string from the fence.
      const rawLanguage = lang?.trim() || ''

      // mermaid 块在阅读态自动渲染为图表；只有 code 模式的代码/预览切换才保留源码视图。
      if (
        isMermaidLanguage(rawLanguage)
        && !options.showCodePreviewToggle
        && isClosedFencedCodeBlock(token)
      ) {
        const mermaidBlockId = `hai-md-code-${state.codeBlocks.length + 1}`
        state.codeBlocks.push({
          id: mermaidBlockId,
          code: text,
          language: rawLanguage,
        })

        return `<div class="hai-md-mermaid" contenteditable="false" data-mermaid-host="${escapeHtml(mermaidBlockId)}"></div>`
      }

      // highlightLanguage is validated against supported languages.
      const highlightLanguage = rawLanguage && isLanguageSupported(rawLanguage)
        ? rawLanguage
        : ''

      // highlighted is the final HTML for the code content.
      const highlighted = options.enableHighlight && highlightLanguage
        ? highlightCode(text, highlightLanguage)
        : escapeHtml(text)

      // codeBlockId is used by run/copy hooks and DOM bindings.
      const codeBlockId = `hai-md-code-${state.codeBlocks.length + 1}`
      state.codeBlocks.push({
        id: codeBlockId,
        code: text,
        language: rawLanguage || undefined,
      })

      // langLabel keeps a consistent header layout even when language is empty.
      const langLabel = rawLanguage
        ? `<span class="hai-md-code-lang">${escapeHtml(rawLanguage)}</span>`
        : '<span class="hai-md-code-lang hai-md-code-lang-empty">Plain Text</span>'

      // copyBtn is optional based on the options.
      const copyBtn = options.showCopyButton
        ? `<button type="button" class="hai-md-code-action hai-md-copy-btn" data-copy-code aria-label="Copy code"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`
        : ''

      // codePreviewToggle replaces run when enabled to provide a cleaner code/preview switch.
      const codePreviewToggle = options.showCodePreviewToggle
        ? `<div class="hai-md-code-view-switch" role="group" aria-label="${escapeHtml(options.codeViewPreviewLabel)}">`
        + `<button type="button" class="hai-md-code-view-btn" data-code-view-toggle data-code-view="code" data-code-block-id="${escapeHtml(codeBlockId)}" aria-pressed="true">${escapeHtml(options.codeViewCodeLabel)}</button>`
        + `<button type="button" class="hai-md-code-view-btn" data-code-view-toggle data-code-view="preview" data-code-block-id="${escapeHtml(codeBlockId)}" aria-pressed="false">${escapeHtml(options.codeViewPreviewLabel)}</button>`
        + `</div>`
        : ''

      // hint text is optional and only rendered when the toggle is present.
      const previewHint = options.showCodePreviewToggle && options.codePreviewHint
        ? `<span class="hai-md-code-preview-hint">${escapeHtml(options.codePreviewHint)}</span>`
        : ''

      // runBtn exposes the run action when enabled and no toggle is active.
      const runBtn = options.showRunButton && !options.showCodePreviewToggle
        ? `<button type="button" class="hai-md-code-action hai-md-run-btn" data-run-code data-code-block-id="${escapeHtml(codeBlockId)}" aria-label="Run code"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7z"/></svg></button>`
        : ''

      // previewHost reserves the DOM slot for run previews or code/preview toggle mode.
      const previewHost = options.showRunButton || options.showCodePreviewToggle
        ? `<div class="hai-md-code-preview-slot" data-code-preview-host="${escapeHtml(codeBlockId)}"></div>`
        : ''

      return `<div class="hai-md-code-block" data-code-block-id="${escapeHtml(codeBlockId)}" data-code-view="code">`
        + `<div class="hai-md-code-header">`
        + `<div class="hai-md-code-header-main">${codePreviewToggle}${langLabel}${previewHint}</div>`
        + `<div class="hai-md-code-actions">${runBtn}${copyBtn}</div>`
        + `</div>`
        + `<pre><code class="hai-hl${highlightLanguage ? ` language-${escapeHtml(highlightLanguage)}` : ''}">${highlighted}</code></pre>`
        + `${previewHost}`
        + `</div>`
    },

    html(token: Tokens.HTML | Tokens.Tag): string {
      const source = readHtmlTokenSource(token)
      return options.allowHtmlTags
        ? sanitizeMarkdownHtml(source)
        : escapeHtml(source)
    },

    link({ href, title, tokens }: Tokens.Link): string {
      // text preserves inline markdown within the link label.
      const text = this.parser.parseInline(tokens)
      // safeHref strips potentially unsafe protocols.
      const safeHref = sanitizeLinkHref(href)
      // isExternal controls whether target/_blank is added.
      const isExternal = safeHref && isExternalLinkHref(safeHref)
      // attrs is the flattened HTML attribute string.
      const attrs = [
        `href="${escapeHtml(safeHref)}"`,
        title ? `title="${escapeHtml(title)}"` : '',
        isExternal ? 'target="_blank" rel="noopener noreferrer"' : '',
      ].filter(Boolean).join(' ')

      return `<a ${attrs}>${text}</a>`
    },

    image({ href, title, text }: Tokens.Image): string {
      // safeSrc prevents dangerous image protocols.
      const safeSrc = sanitizeImageSrc(href)
      // attrs is the flattened HTML attribute string.
      const attrs = [
        `src="${escapeHtml(safeSrc)}"`,
        `alt="${escapeHtml(text || '')}"`,
        title ? `title="${escapeHtml(title)}"` : '',
        'loading="lazy"',
        'class="hai-md-img"',
      ].filter(Boolean).join(' ')

      return `<img ${attrs} />`
    },

    table(token: Tokens.Table): string {
      // headerHtml accumulates the header row content.
      let headerHtml = ''
      for (const cell of token.header) {
        // align adds text alignment for each header cell.
        const align = cell.align ? ` style="text-align:${cell.align}"` : ''
        headerHtml += `<th${align}>${this.parser.parseInline(cell.tokens)}</th>`
      }

      // bodyHtml accumulates all body rows.
      let bodyHtml = ''
      for (const row of token.rows) {
        // rowHtml accumulates cells for a single row.
        let rowHtml = ''
        for (const cell of row) {
          // align adds text alignment for each body cell.
          const align = cell.align ? ` style="text-align:${cell.align}"` : ''
          rowHtml += `<td${align}>${this.parser.parseInline(cell.tokens)}</td>`
        }
        bodyHtml += `<tr>${rowHtml}</tr>`
      }

      return `<div class="hai-md-table-wrap">`
        + `<table>`
        + `<thead><tr>${headerHtml}</tr></thead>`
        + `<tbody>${bodyHtml}</tbody>`
        + `</table>`
        + `</div>`
    },
  }
}

/**
 * Create a marked instance tied to a specific render state.
 */
function createMarkedInstance(
  options: Required<MarkdownDocumentParseOptions>,
  state: MarkdownRenderState,
): Marked {
  return new Marked({
    renderer: createRendererObject(options, state),
    extensions: createEditorMarkdownExtensions(),
    gfm: true,
    breaks: options.breaks,
  })
}

/**
 * Render markdown into HTML and extract outline + code block metadata.
 */
export function renderMarkdownDocument(
  content: string,
  options?: MarkdownDocumentParseOptions,
): MarkdownRenderResult {
  if (!content) {
    return {
      html: '',
      outline: [],
      codeBlocks: [],
    }
  }

  // mergedOptions ensures defaults are always applied.
  const mergedOptions: Required<MarkdownDocumentParseOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  }
  // state captures outline, code blocks, and heading ids per render call.
  const state: MarkdownRenderState = {
    outline: [],
    codeBlocks: [],
    headingIds: new Map(),
  }
  // marked instance is scoped to this render call.
  const marked = createMarkedInstance(mergedOptions, state)
  // result can be sync string or async promise; only sync string is used.
  const result = marked.parse(content)

  return {
    html: typeof result === 'string' ? result : '',
    outline: createNumberedOutline(state.outline),
    codeBlocks: state.codeBlocks,
  }
}
