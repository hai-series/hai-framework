/**
 * @h-ai/ui — Safe HTML helpers for Markdown rendering.
 *
 * The Markdown pipeline keeps raw HTML escaped by default.
 * When callers opt in, only a controlled allowlist of safe tags and
 * attributes is reconstructed; unsupported or dangerous markup remains escaped.
 */

const SAFE_LINK_HREF_REGEX = /^(?:https?:\/\/|\/|#|mailto:)/i
const SAFE_IMAGE_SRC_REGEX = /^(?:https?:\/\/|\/|data:image\/)/i
const SAFE_ALIGN_VALUE_REGEX = /^(?:left|center|right|justify)$/i
const SAFE_TABLE_SPAN_REGEX = /^[1-9]\d{0,2}$/
const HTML_ATTR_REGEX = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

const ALLOWED_HTML_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])

const VOID_HTML_TAGS = new Set(['br', 'hr', 'img'])
const ALIGNABLE_HTML_TAGS = new Set([
  'blockquote',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'p',
  'td',
  'th',
])

interface ParsedHtmlAttributes {
  href?: string
  src?: string
  title?: string
  alt?: string
  align?: string
  colspan?: string
  rowspan?: string
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeLinkHref(href: string | null | undefined): string {
  const normalized = href?.trim() ?? ''
  return SAFE_LINK_HREF_REGEX.test(normalized) ? normalized : ''
}

export function isExternalLinkHref(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

export function sanitizeImageSrc(src: string | null | undefined): string {
  const normalized = src?.trim() ?? ''
  return SAFE_IMAGE_SRC_REGEX.test(normalized) ? normalized : ''
}

function sanitizeAlignValue(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized && SAFE_ALIGN_VALUE_REGEX.test(normalized)
    ? normalized
    : undefined
}

function parseHtmlAttributes(rawAttributes: string): Array<[string, string]> {
  const attributes: Array<[string, string]> = []
  for (const match of rawAttributes.matchAll(HTML_ATTR_REGEX)) {
    const [, rawName, quotedDouble, quotedSingle, unquoted] = match
    const attrName = rawName?.trim().toLowerCase()
    if (!attrName) {
      continue
    }

    const attrValue = quotedDouble ?? quotedSingle ?? unquoted ?? ''
    attributes.push([attrName, attrValue])
  }

  return attributes
}

function isHtmlTagNameChar(char: string | undefined): boolean {
  return typeof char === 'string' && /^[\w:-]$/.test(char)
}

function skipWhitespace(source: string, startIndex: number): number {
  let cursor = startIndex
  while (cursor < source.length && /\s/.test(source[cursor] ?? '')) {
    cursor += 1
  }

  return cursor
}

function findHtmlTagEnd(source: string, startIndex: number): number {
  let quote: '"' | '\'' | null = null

  for (let cursor = startIndex; cursor < source.length; cursor += 1) {
    const char = source[cursor]
    if (quote) {
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === '\'') {
      quote = char
      continue
    }

    if (char === '>') {
      return cursor
    }
  }

  return -1
}

function readNextHtmlTag(
  source: string,
  startIndex: number,
): { rawTag: string, start: number, end: number } | null {
  let cursor = source.indexOf('<', startIndex)
  while (cursor >= 0) {
    const nextChar = source[cursor + 1]
    if (!nextChar || (nextChar !== '/' && !/[a-z]/i.test(nextChar))) {
      cursor = source.indexOf('<', cursor + 1)
      continue
    }

    const tagEnd = findHtmlTagEnd(source, cursor + 1)
    if (tagEnd < 0) {
      return null
    }

    return {
      rawTag: source.slice(cursor, tagEnd + 1),
      start: cursor,
      end: tagEnd + 1,
    }
  }

  return null
}

function readSanitizedAttributes(
  tagName: string,
  rawAttributes: string,
): ParsedHtmlAttributes {
  const sanitized: ParsedHtmlAttributes = {}

  for (const [attrName, attrValue] of parseHtmlAttributes(rawAttributes)) {
    if (tagName === 'a') {
      if (attrName === 'href') {
        sanitized.href = sanitizeLinkHref(attrValue)
      }

      if (attrName === 'title' && attrValue.trim()) {
        sanitized.title = attrValue.trim()
      }
      continue
    }

    if (tagName === 'img') {
      if (attrName === 'src') {
        sanitized.src = sanitizeImageSrc(attrValue)
      }

      if (attrName === 'alt') {
        sanitized.alt = attrValue
      }

      if (attrName === 'title' && attrValue.trim()) {
        sanitized.title = attrValue.trim()
      }
      continue
    }

    if (ALIGNABLE_HTML_TAGS.has(tagName) && attrName === 'align') {
      sanitized.align = sanitizeAlignValue(attrValue)
      continue
    }

    if ((tagName === 'td' || tagName === 'th') && attrName === 'colspan') {
      const normalized = attrValue.trim()
      if (SAFE_TABLE_SPAN_REGEX.test(normalized)) {
        sanitized.colspan = normalized
      }
      continue
    }

    if ((tagName === 'td' || tagName === 'th') && attrName === 'rowspan') {
      const normalized = attrValue.trim()
      if (SAFE_TABLE_SPAN_REGEX.test(normalized)) {
        sanitized.rowspan = normalized
      }
    }
  }

  return sanitized
}

function sanitizeHtmlTag(rawTag: string): string {
  if (!rawTag.startsWith('<') || !rawTag.endsWith('>')) {
    return escapeHtml(rawTag)
  }

  let cursor = 1
  cursor = skipWhitespace(rawTag, cursor)

  let isClosingTag = false
  if (rawTag[cursor] === '/') {
    isClosingTag = true
    cursor += 1
    cursor = skipWhitespace(rawTag, cursor)
  }

  const tagNameStart = cursor
  while (isHtmlTagNameChar(rawTag[cursor])) {
    cursor += 1
  }

  const tagName = rawTag.slice(tagNameStart, cursor).toLowerCase()
  if (!tagName) {
    return escapeHtml(rawTag)
  }

  let rawAttributes = rawTag.slice(cursor, -1)
  let selfClosing = false
  const trimmedAttributes = rawAttributes.trimEnd()
  if (trimmedAttributes.endsWith('/')) {
    selfClosing = true
    rawAttributes = trimmedAttributes.slice(0, -1)
  }

  if (!ALLOWED_HTML_TAGS.has(tagName)) {
    return escapeHtml(rawTag)
  }

  if (isClosingTag) {
    return VOID_HTML_TAGS.has(tagName) ? '' : `</${tagName}>`
  }

  const attributes = readSanitizedAttributes(tagName, rawAttributes)
  const renderedAttributes: string[] = []

  if (attributes.href !== undefined) {
    renderedAttributes.push(`href="${escapeHtml(attributes.href)}"`)
    if (attributes.href && isExternalLinkHref(attributes.href)) {
      renderedAttributes.push('target="_blank"')
      renderedAttributes.push('rel="noopener noreferrer"')
    }
  }

  if (attributes.title) {
    renderedAttributes.push(`title="${escapeHtml(attributes.title)}"`)
  }

  if (attributes.src !== undefined) {
    renderedAttributes.push(`src="${escapeHtml(attributes.src)}"`)
    renderedAttributes.push('loading="lazy"')
    renderedAttributes.push('class="hai-md-img"')
  }

  if (attributes.alt !== undefined) {
    renderedAttributes.push(`alt="${escapeHtml(attributes.alt)}"`)
  }

  if (attributes.align) {
    renderedAttributes.push(`style="text-align:${escapeHtml(attributes.align)}"`)
  }

  if (attributes.colspan) {
    renderedAttributes.push(`colspan="${escapeHtml(attributes.colspan)}"`)
  }

  if (attributes.rowspan) {
    renderedAttributes.push(`rowspan="${escapeHtml(attributes.rowspan)}"`)
  }

  const attributeText = renderedAttributes.length > 0
    ? ` ${renderedAttributes.join(' ')}`
    : ''

  return VOID_HTML_TAGS.has(tagName) || selfClosing
    ? `<${tagName}${attributeText} />`
    : `<${tagName}${attributeText}>`
}

/**
 * Sanitize raw HTML fragments embedded inside Markdown.
 * Safe allowlisted tags are reconstructed, everything else remains escaped.
 */
export function sanitizeMarkdownHtml(fragment: string): string {
  if (!fragment) {
    return ''
  }

  let sanitized = ''
  let lastIndex = 0

  for (let match = readNextHtmlTag(fragment, lastIndex); match; match = readNextHtmlTag(fragment, lastIndex)) {
    sanitized += escapeHtml(fragment.slice(lastIndex, match.start))
    sanitized += sanitizeHtmlTag(match.rawTag)
    lastIndex = match.end
  }

  sanitized += escapeHtml(fragment.slice(lastIndex))
  return sanitized
}
