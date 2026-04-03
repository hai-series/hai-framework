import type {
  MarkdownSourceKind,
  MarkdownToolbarDownloadAction,
} from './document-types.js'
import { uiM } from '../../../messages.js'
import { renderMarkdownDocument } from './document-parse.js'

/**
 * 组件内置支持的文档导出格式。
 */
export type AiDocumentDownloadFormat = 'word' | 'markdown' | 'pdf'

export interface AiDocumentResolvedDownloadAction {
  /** 菜单项稳定 id；内置格式直接复用格式名，自定义动作沿用上游传入值。 */
  id: string
  /** 用户可见菜单文案。 */
  label: string
  /** 可选短标签；保留给外层定制菜单使用。 */
  badgeLabel?: string
}

export interface AiDocumentDownloadRequest {
  /** 用户当前选中的下载动作 id。 */
  actionId: string
  /** 需要导出的原始 Markdown 或代码正文。 */
  content: string
  /** 用于导出元信息和默认文件名的标题。 */
  title?: string
  /** 显式文件名；传入时优先级高于 title。 */
  filename?: string
  /** 内容来源类型；`code` 会先包装成 fenced markdown 再走统一导出链路。 */
  sourceKind?: MarkdownSourceKind
  /** `sourceKind=code` 时补充 fenced block 的语言标记。 */
  codeLanguage?: string
}

/**
 * code 类型产物通常只有裸代码正文。
 * 下载和预览都通过同一份规范化逻辑包装成 fenced markdown，避免两边导出的结构不一致。
 */
export function resolveDocumentMarkdownContent(
  value: string,
  kind: MarkdownSourceKind = 'markdown',
  language?: string,
): string {
  if (kind !== 'code') {
    return value
  }

  const fenceLength = Math.max(
    3,
    ...Array.from(value.matchAll(/`{3,}/g), match => match[0].length + 1),
  )
  const fence = '`'.repeat(fenceLength)
  const normalizedLanguage = language?.trim() ?? ''
  const suffix = value.endsWith('\n') ? '' : '\n'
  return `${fence}${normalizedLanguage}\n${value}${suffix}${fence}`
}

/**
 * 把自定义动作和内置动作统一归一成统一的菜单项，保证左右两侧下载菜单展示一致。
 */
export function resolveDocumentDownloadActions(
  actions: MarkdownToolbarDownloadAction[] = [],
): AiDocumentResolvedDownloadAction[] {
  if (actions.length === 0) {
    return [
      createBuiltInDownloadAction('word'),
      createBuiltInDownloadAction('pdf'),
      createBuiltInDownloadAction('markdown'),
    ]
  }

  return actions.map((action) => {
    const builtIn = tryResolveBuiltInDownloadAction(action.id)
    return {
      id: action.id,
      label: action.label || builtIn?.label || action.id,
      badgeLabel:
        action.badgeLabel
        || builtIn?.badgeLabel
        || action.id.slice(0, 4).toUpperCase(),
    }
  })
}

/**
 * 执行内置下载动作；未知动作直接跳过，方便外层保留自定义回调扩展口。
 */
export async function downloadAiDocument(
  request: AiDocumentDownloadRequest,
): Promise<void> {
  if (typeof document === 'undefined') {
    return
  }

  const builtIn = tryResolveBuiltInDownloadAction(request.actionId)
  if (!builtIn) {
    return
  }

  const markdownContent = resolveDocumentMarkdownContent(
    request.content,
    request.sourceKind ?? 'markdown',
    request.codeLanguage,
  )
  const baseName = resolveDocumentBaseName(request.title, request.filename)

  if (builtIn.id === 'markdown') {
    downloadBlob(
      new Blob([markdownContent], {
        type: 'text/markdown;charset=utf-8',
      }),
      `${baseName}.md`,
    )
    return
  }

  const exportTitle = request.title?.trim() || baseName
  const rendered = renderMarkdownDocument(markdownContent, {
    enableHighlight: false,
    showCopyButton: false,
    showRunButton: false,
    breaks: true,
  })
  const exportHtml = buildDocumentExportHtml(exportTitle, rendered.html)

  if (builtIn.id === 'word') {
    downloadBlob(
      new Blob([`\uFEFF${exportHtml}`], {
        type: 'application/msword;charset=utf-8',
      }),
      `${baseName}.doc`,
    )
    return
  }

  await printDocumentAsPdf(htmlToPdfTitle(exportTitle), exportHtml)
}

function createBuiltInDownloadAction(
  format: AiDocumentDownloadFormat,
): AiDocumentResolvedDownloadAction {
  switch (format) {
    case 'word':
      return {
        id: 'word',
        label: uiM('markdown_download_word_menu'),
        badgeLabel: 'DOC',
      }
    case 'markdown':
      return {
        id: 'markdown',
        label: uiM('markdown_download_markdown_menu'),
        badgeLabel: 'MD',
      }
    case 'pdf':
      return {
        id: 'pdf',
        label: uiM('markdown_download_pdf_menu'),
        badgeLabel: 'PDF',
      }
  }
}

function tryResolveBuiltInDownloadAction(
  value: string,
): AiDocumentResolvedDownloadAction | undefined {
  if (value === 'word' || value === 'markdown' || value === 'pdf') {
    return createBuiltInDownloadAction(value)
  }

  return undefined
}

function stripControlCharacters(value: string): string {
  return Array.from(value).filter(char => char >= ' ').join('')
}

function resolveDocumentBaseName(title?: string, filename?: string): string {
  const preferredName = filename?.trim() || title?.trim() || 'ai-document'
  const sanitizedName = stripControlCharacters(preferredName)
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()

  return sanitizedName || 'ai-document'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.click()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildDocumentExportHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
      }

      body {
        margin: 0;
        padding: 0;
        font-family:
          "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
          "Segoe UI", sans-serif;
        color: #18212f;
        background: #ffffff;
      }

      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 40px 32px 72px;
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      h6 {
        margin: 1.5em 0 0.7em;
        line-height: 1.28;
        color: #101827;
      }

      h1 {
        font-size: 30px;
        padding-bottom: 0.42em;
        border-bottom: 1px solid #dbe4f0;
      }

      h2 {
        font-size: 24px;
      }

      h3 {
        font-size: 20px;
      }

      p,
      li,
      blockquote,
      td,
      th {
        font-size: 15px;
        line-height: 1.82;
      }

      a {
        color: #2259d1;
        text-decoration: none;
      }

      code,
      pre,
      kbd {
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", monospace;
      }

      pre {
        padding: 16px;
        border-radius: 18px;
        overflow: auto;
        background: #111827;
        color: #f8fafc;
      }

      code {
        white-space: pre-wrap;
      }

      :not(pre) > code {
        padding: 0.18em 0.42em;
        border-radius: 7px;
        background: #eef2f8;
        color: #132238;
      }

      blockquote {
        margin: 1.1em 0;
        padding: 0.9em 1.1em;
        border-left: 4px solid #7fa4ff;
        background: #f6f8fd;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 12px 14px;
        border: 1px solid #dbe4f0;
      }

      thead {
        background: #f5f7fb;
      }

      img {
        max-width: 100%;
        height: auto;
      }

      @page {
        size: auto;
        margin: 14mm 12mm;
      }
    </style>
  </head>
  <body>
    <main>
      ${bodyHtml}
    </main>
  </body>
</html>`
}

function htmlToPdfTitle(title: string): string {
  return title.endsWith('.pdf') ? title : `${title}.pdf`
}

async function printDocumentAsPdf(
  pdfTitle: string,
  html: string,
): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.append(iframe)

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve()
    iframe.srcdoc = html
  })

  const previewWindow = iframe.contentWindow
  if (!previewWindow) {
    iframe.remove()
    return
  }

  previewWindow.document.title = pdfTitle
  previewWindow.focus()

  // PDF 导出当前走浏览器打印能力，让用户在不额外引入 PDF 库的前提下使用系统“另存为 PDF”。
  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove()
    }, 240)
  }

  previewWindow.addEventListener('afterprint', cleanup, { once: true })
  previewWindow.print()
  window.setTimeout(cleanup, 1200)
}
