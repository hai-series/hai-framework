/**
 * @h-ai/ui — Markdown 文档解析工具
 *
 * 为文档模式提取安全 HTML、目录和代码块元信息。
 */

import type { RendererObject, Token, Tokens } from 'marked'
import type { MarkdownCodeBlockItem, MarkdownOutlineItem } from './document-types.js'
import { Marked } from 'marked'
import { uiM } from '../../../messages.js'
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

/**
 * 安全 Markdown 文档解析选项；运行按钮不等于允许执行代码。
 *
 * @example
 * ```ts
 * import type { MarkdownDocumentParseOptions } from '@h-ai/ui'
 * const example: MarkdownDocumentParseOptions = { enableHighlight: true, allowHtmlTags: false, showRunButton: false, breaks: true }
 * ```
 */
export interface MarkdownDocumentParseOptions {
  /** 是否启用代码块语法高亮。 */
  enableHighlight?: boolean
  /** 是否渲染代码块复制按钮。 */
  showCopyButton?: boolean
  /** 是否渲染运行按钮和预览槽；实际运行由宿主授权。 */
  showRunButton?: boolean
  /** 是否渲染代码块头部的代码/预览切换。 */
  showCodePreviewToggle?: boolean
  /** 启用预览切换时的代码页签文案。 */
  codeViewCodeLabel?: string
  /** 启用预览切换时的预览页签文案。 */
  codeViewPreviewLabel?: string
  /** 代码块头部语言标签旁的提示文案。 */
  codePreviewHint?: string
  /** 是否将普通换行转换成 br。 */
  breaks?: boolean
  /** 是否按安全白名单解析原始 HTML 标签。 */
  allowHtmlTags?: boolean
}

/**
 * 一次文档解析生成的安全渲染块、目录和原始代码块信息。
 *
 * @example
 * ```ts
 * import { renderMarkdownDocument } from '@h-ai/ui'
 * import type { MarkdownRenderResult } from '@h-ai/ui'
 * const result: MarkdownRenderResult = renderMarkdownDocument('# 简介\n正文')
 * const headings = result.outline
 * ```
 */
export interface MarkdownRenderResult {
  /** 供目录导航使用的标题条目。 */
  outline: MarkdownOutlineItem[]
  /** 供运行/复制功能使用的代码块元信息。 */
  codeBlocks: MarkdownCodeBlockItem[]
  /** 阅读态使用的稳定块列表，避免流式更新销毁重型块 DOM。 */
  blocks: MarkdownDocumentBlock[]
}

/**
 * 文档渲染块的可辨识联合；HTML 块和 Mermaid 源码块分开更新。
 *
 * @example
 * ```ts
 * import type { MarkdownDocumentBlock } from '@h-ai/ui'
 * const example: MarkdownDocumentBlock = { kind: 'html', id: 'paragraph-1', html: '<p>正文</p>' }
 * ```
 */
export type MarkdownDocumentBlock
  = | MarkdownDocumentHtmlBlock
    | MarkdownDocumentMermaidBlock

/**
 * 已经过安全策略处理的 Markdown HTML 块；不要填入未消毒输入。
 *
 * @example
 * ```ts
 * import type { MarkdownDocumentHtmlBlock } from '@h-ai/ui'
 * const example: MarkdownDocumentHtmlBlock = { kind: 'html', id: 'paragraph-1', html: '<p>正文</p>' }
 * ```
 */
export interface MarkdownDocumentHtmlBlock {
  /** 普通 Markdown HTML 块。 */
  kind: 'html'
  /** 稳定块 id，用于 Svelte keyed each。 */
  id: string
  /** 已按现有安全策略渲染后的 HTML。 */
  html: string
}

/**
 * 完整 Mermaid 块的源码与签名，等待异步严格模式渲染。
 *
 * @example
 * ```ts
 * import type { MarkdownDocumentMermaidBlock } from '@h-ai/ui'
 * const example: MarkdownDocumentMermaidBlock = { kind: 'mermaid', id: 'diagram-1', codeBlockId: 'code-1', code: 'graph TD; A-->B', language: 'mermaid', signature: JSON.stringify(['diagram-1', 'graph TD; A-->B']) }
 * ```
 */
export interface MarkdownDocumentMermaidBlock {
  /** 已闭合 Mermaid fence 块。 */
  kind: 'mermaid'
  /** 稳定块 id，用于 Svelte keyed each。 */
  id: string
  /** 对应 codeBlocks 中的代码块 id。 */
  codeBlockId: string
  /** Mermaid 源码。 */
  code: string
  /** 原始 fence info string。 */
  language: string
  /** Mermaid 源码签名，源码变化时才需要重渲染。 */
  signature: string
}

/**
 * 一次文档解析的临时累计状态；标题计数用于稳定去重。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: MarkdownRenderState = { outline: [], codeBlocks: [], headingIds: new Map([['intro', 1]]) }
 * ```
 */
interface MarkdownRenderState {
  /** 添加目录编号前的标题数据。 */
  outline: Array<Omit<MarkdownOutlineItem, 'numberedTitle'>>
  /** 渲染过程收集的代码块。 */
  codeBlocks: MarkdownCodeBlockItem[]
  /** 标题 ID 计数表，用于稳定去重。 */
  headingIds: Map<string, number>
}

/**
 * 单个已消毒 HTML 块和其中可复制的代码元信息。
 *
 * @example 模块内部上下文
 * ```ts
 * const example: MarkdownHtmlChunkRenderResult = { html: '<p>正文</p>', codeBlocks: [] }
 * ```
 */
interface MarkdownHtmlChunkRenderResult {
  /** 已按现有安全策略渲染后的 HTML。 */
  html: string
  /** HTML chunk 内收集到的代码块。 */
  codeBlocks: MarkdownCodeBlockItem[]
}

/** 文档模式的默认解析选项。 */
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
 * 生成保留字母和数字的 URL 安全标题 slug。
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
 * 为标题生成稳定 ID，并对重复标题去重。
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
 * 为目录条目添加 1、1.1 等层级编号。
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
 * 构建同时提取目录与代码元信息的 Marked renderer。
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
        ? `<button type="button" class="hai-md-code-action hai-md-copy-btn" data-copy-code aria-label="${escapeHtml(uiM('markdown_copy_code'))}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`
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
 * 创建绑定本次临时解析状态的 Marked 实例。
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

function createMermaidSourceSignature(blockId: string, code: string): string {
  return JSON.stringify([blockId, code])
}

function createEmptyRenderResult(): MarkdownRenderResult {
  return {
    outline: [],
    codeBlocks: [],
    blocks: [],
  }
}

function createHtmlBlock(id: string, html: string): MarkdownDocumentHtmlBlock | null {
  return html
    ? {
        kind: 'html',
        id,
        html,
      }
    : null
}

function renderMarkdownDocumentHtmlChunk(
  content: string,
  options: Required<MarkdownDocumentParseOptions>,
  state: MarkdownRenderState,
): MarkdownHtmlChunkRenderResult {
  const marked = createMarkedInstance(options, state)
  const result = marked.parse(content)

  return {
    html: typeof result === 'string' ? result : '',
    codeBlocks: state.codeBlocks,
  }
}

function isClosedMermaidToken(
  token: Token,
  options: Required<MarkdownDocumentParseOptions>,
): token is Tokens.Code {
  if (
    token.type !== 'code'
    || !('text' in token)
    || typeof token.text !== 'string'
  ) {
    return false
  }

  const codeToken = token as Tokens.Code
  const rawLanguage = codeToken.lang?.trim() || ''
  return isMermaidLanguage(rawLanguage)
    && !options.showCodePreviewToggle
    && isClosedFencedCodeBlock(codeToken)
}

function renderMarkdownDocumentBlocks(
  content: string,
  options: Required<MarkdownDocumentParseOptions>,
): MarkdownDocumentBlock[] {
  const marked = new Marked({
    extensions: createEditorMarkdownExtensions(),
    gfm: true,
    breaks: options.breaks,
  })
  const tokens = marked.lexer(content)
  const blocks: MarkdownDocumentBlock[] = []
  let htmlTokens: Token[] = []
  const state: MarkdownRenderState = {
    outline: [],
    codeBlocks: [],
    headingIds: new Map(),
  }
  let nextBlockIndex = 1

  function flushHtmlTokens(): void {
    if (htmlTokens.length === 0) {
      return
    }

    const chunk = htmlTokens.map(token => token.raw).join('')
    const result = renderMarkdownDocumentHtmlChunk(chunk, options, state)
    const block = createHtmlBlock(`hai-md-block-${nextBlockIndex}`, result.html)
    if (block) {
      blocks.push(block)
      nextBlockIndex += 1
    }
    htmlTokens = []
  }

  for (const token of tokens) {
    if (!isClosedMermaidToken(token, options)) {
      htmlTokens.push(token)
      continue
    }

    flushHtmlTokens()

    const codeBlockId = `hai-md-code-${state.codeBlocks.length + 1}`
    const rawLanguage = token.lang?.trim() || ''
    state.codeBlocks.push({
      id: codeBlockId,
      code: token.text,
      language: rawLanguage,
    })
    blocks.push({
      kind: 'mermaid',
      id: `hai-md-block-${nextBlockIndex}`,
      codeBlockId,
      code: token.text,
      language: rawLanguage,
      signature: createMermaidSourceSignature(codeBlockId, token.text),
    })
    nextBlockIndex += 1
  }

  flushHtmlTokens()
  return blocks
}

/**
 * 安全渲染 Markdown，同时提取目录和代码块元信息。
 * @param content - Markdown 或文档正文。
 * @param options - 本次操作的行为与显示选项。
 * @returns 已消毒渲染块、目录和代码元信息。
 *
 * @example
 * ```ts
 * import { renderMarkdownDocument } from '@h-ai/ui'
 * const result = renderMarkdownDocument('# 简介\n正文', { allowHtmlTags: false, enableHighlight: true })
 * const firstHeading = result.outline[0]?.text
 * ```
 */
export function renderMarkdownDocument(
  content: string,
  options?: MarkdownDocumentParseOptions,
): MarkdownRenderResult {
  if (!content) {
    return createEmptyRenderResult()
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
  marked.parse(content)

  return {
    outline: createNumberedOutline(state.outline),
    codeBlocks: state.codeBlocks,
    blocks: renderMarkdownDocumentBlocks(content, mergedOptions),
  }
}
