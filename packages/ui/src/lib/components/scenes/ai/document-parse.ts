/**
 * @h-ai/ui — Markdown document parsing helpers
 *
 * Extracts HTML, outline, and code block metadata for document-mode rendering.
 */

import type { RendererObject, Tokens } from 'marked'
import type { MarkdownCodeBlockItem, MarkdownOutlineItem } from './document-types.js'
import hljs from 'highlight.js/lib/common'
import { Marked } from 'marked'

export interface MarkdownDocumentParseOptions {
  /** Whether to enable syntax highlighting for code blocks. */
  enableHighlight?: boolean
  /** Whether to render the copy button in code blocks. */
  showCopyButton?: boolean
  /** Whether to render the run button and preview slot. */
  showRunButton?: boolean
  /** Whether soft line breaks are converted to <br>. */
  breaks?: boolean
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
  breaks: true,
}

/**
 * Escape HTML entities to prevent raw HTML injection.
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
      // text is the plain heading text used for outline labels.
      const text = token.text.trim()
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

    code({ text, lang }: Tokens.Code): string {
      // rawLanguage is the original info string from the fence.
      const rawLanguage = lang?.trim() || ''
      // highlightLanguage is validated against highlight.js languages.
      const highlightLanguage = rawLanguage && hljs.getLanguage(rawLanguage)
        ? rawLanguage
        : ''

      // highlighted is the final HTML for the code content.
      const highlighted = options.enableHighlight
        ? highlightLanguage
          ? hljs.highlight(text, { language: highlightLanguage }).value
          : hljs.highlightAuto(text).value
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

      // runBtn exposes the run action when enabled.
      const runBtn = options.showRunButton
        ? `<button type="button" class="hai-md-code-action hai-md-run-btn" data-run-code data-code-block-id="${escapeHtml(codeBlockId)}" aria-label="Run code"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7z"/></svg></button>`
        : ''

      // previewHost reserves the DOM slot for run previews.
      const previewHost = options.showRunButton
        ? `<div class="hai-md-code-preview-slot" data-code-preview-host="${escapeHtml(codeBlockId)}"></div>`
        : ''

      return `<div class="hai-md-code-block" data-code-block-id="${escapeHtml(codeBlockId)}">`
        + `<div class="hai-md-code-header">`
        + `<div class="hai-md-code-header-main">${langLabel}</div>`
        + `<div class="hai-md-code-actions">${runBtn}${copyBtn}</div>`
        + `</div>`
        + `<pre><code class="hljs${highlightLanguage ? ` language-${escapeHtml(highlightLanguage)}` : ''}">${highlighted}</code></pre>`
        + `${previewHost}`
        + `</div>`
    },

    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml('text' in token ? token.text : '')
    },

    link({ href, title, tokens }: Tokens.Link): string {
      // text preserves inline markdown within the link label.
      const text = this.parser.parseInline(tokens)
      // safeHref strips potentially unsafe protocols.
      const safeHref = href && /^(?:https?:\/\/|\/|#|mailto:)/i.test(href) ? href : ''
      // isExternal controls whether target/_blank is added.
      const isExternal = safeHref
        && (safeHref.startsWith('http://') || safeHref.startsWith('https://'))
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
      const safeSrc = href && /^(?:https?:\/\/|\/|data:image\/)/i.test(href) ? href : ''
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
