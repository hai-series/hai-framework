import type {
  Token,
  TokenizerAndRendererExtension,
  Tokens,
} from 'marked'

/**
 * 编辑器扩展里只接受固定格式的十六进制颜色，避免把任意 style 串透传到渲染结果。
 */
const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * 对齐扩展只开放编辑器工具条里的四种模式。
 */
const ALIGN_VALUE_REGEX = /^(left|center|right|justify)$/i

type EditorSpanToken = Tokens.Generic & {
  type: 'haiSpan'
  raw: string
  color?: string
  background?: string
  tokens: Token[]
}

type EditorAlignToken = Tokens.Generic & {
  type: 'haiAlign'
  raw: string
  align: 'left' | 'center' | 'right' | 'justify'
  tokens: Token[]
}

type EditorInlineFormatToken = Tokens.Generic & {
  type: 'haiUnderline' | 'haiHighlight'
  raw: string
  tokens: Token[]
}

/**
 * Markdown heading 提取目录时需要一个“纯文本标题”。
 * 这里显式递归常见 inline token，保证 `<hai-span>`、链接、强调等都能回落成纯文本。
 */
export function extractPlainTextFromTokens(tokens: Token[] | undefined): string {
  if (!tokens || tokens.length === 0) {
    return ''
  }

  return tokens.map((token) => {
    if ('tokens' in token && Array.isArray(token.tokens)) {
      return extractPlainTextFromTokens(token.tokens as Token[])
    }

    if ('text' in token && typeof token.text === 'string') {
      return token.text
    }

    if ('raw' in token && typeof token.raw === 'string') {
      return token.raw
    }

    return ''
  }).join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  return HEX_COLOR_REGEX.test(normalized) ? normalized : undefined
}

function sanitizeAlign(value: string | undefined): EditorAlignToken['align'] | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  return ALIGN_VALUE_REGEX.test(normalized)
    ? (normalized as EditorAlignToken['align'])
    : undefined
}

/**
 * ChatWorkspace 编辑器会把“非标准 Markdown”能力写成自定义标签，
 * 这里把它们注册为 marked 扩展，保证普通 Markdown 和编辑器增强能力共享同一条渲染链路。
 */
export function createEditorMarkdownExtensions(): TokenizerAndRendererExtension[] {
  return [
    {
      name: 'haiAlign',
      level: 'block',
      start(src) {
        return src.indexOf('<hai-align')
      },
      tokenizer(src) {
        const match = src.match(
          /^<hai-align\s+value="(left|center|right|justify)">\n?([\s\S]+?)\n?<\/hai-align>(?:\n{0,2}|$)/i,
        )
        if (!match) {
          return undefined
        }

        const align = sanitizeAlign(match[1])
        if (!align) {
          return undefined
        }

        const body = match[2].trim()
        return {
          type: 'haiAlign',
          raw: match[0],
          align,
          tokens: this.lexer.blockTokens(body),
        } satisfies EditorAlignToken
      },
      renderer(token) {
        const alignToken = token as EditorAlignToken
        return `<div class="hai-md-align-block" data-hai-align="${escapeHtml(alignToken.align)}" style="text-align:${escapeHtml(alignToken.align)};">${this.parser.parse(alignToken.tokens)}</div>`
      },
      childTokens: ['tokens'],
    },
    {
      name: 'haiSpan',
      level: 'inline',
      start(src) {
        return src.indexOf('<hai-span')
      },
      tokenizer(src) {
        const match = src.match(
          /^<hai-span(?:\s+color="([^"]+)")?(?:\s+bg="([^"]+)")?\s*>([\s\S]+?)<\/hai-span>/i,
        )
        if (!match) {
          return undefined
        }

        const color = sanitizeColor(match[1])
        const background = sanitizeColor(match[2])
        return {
          type: 'haiSpan',
          raw: match[0],
          color,
          background,
          tokens: this.lexer.inlineTokens(match[3]),
        } satisfies EditorSpanToken
      },
      renderer(token) {
        const spanToken = token as EditorSpanToken
        const style = [
          spanToken.color ? `color:${spanToken.color}` : '',
          spanToken.background ? `background-color:${spanToken.background}` : '',
        ].filter(Boolean).join(';')

        if (!style) {
          return this.parser.parseInline(spanToken.tokens)
        }

        return `<span class="hai-md-inline-style" style="${escapeHtml(style)};">${this.parser.parseInline(spanToken.tokens)}</span>`
      },
      childTokens: ['tokens'],
    },
    {
      name: 'haiUnderline',
      level: 'inline',
      start(src) {
        return src.indexOf('++')
      },
      tokenizer(src) {
        const match = src.match(/^\+\+((?:\\.|[\s\S])+?)\+\+/)
        if (!match) {
          return undefined
        }

        return {
          type: 'haiUnderline',
          raw: match[0],
          tokens: this.lexer.inlineTokens(match[1]),
        } satisfies EditorInlineFormatToken
      },
      renderer(token) {
        const underlineToken = token as EditorInlineFormatToken
        return `<u>${this.parser.parseInline(underlineToken.tokens)}</u>`
      },
      childTokens: ['tokens'],
    },
    {
      name: 'haiHighlight',
      level: 'inline',
      start(src) {
        return src.indexOf('==')
      },
      tokenizer(src) {
        const match = src.match(/^==((?:\\.|[\s\S])+?)==/)
        if (!match) {
          return undefined
        }

        return {
          type: 'haiHighlight',
          raw: match[0],
          tokens: this.lexer.inlineTokens(match[1]),
        } satisfies EditorInlineFormatToken
      },
      renderer(token) {
        const highlightToken = token as EditorInlineFormatToken
        return `<mark>${this.parser.parseInline(highlightToken.tokens)}</mark>`
      },
      childTokens: ['tokens'],
    },
  ]
}
