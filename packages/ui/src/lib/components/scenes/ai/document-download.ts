import type {
  MarkdownSourceKind,
  MarkdownToolbarDownloadAction,
} from './document-types.js'
import { uiM } from '../../../messages.js'
import { renderMarkdownDocument } from './document-parse.js'

const DOCUMENT_EXPORT_ROOT_CLASS = 'hai-ai-document-export'
const BROWSER_PDF_PAGE_HEIGHT_MM = 297
const BROWSER_PDF_VIEWPORT_WIDTH_PX = 794
const BROWSER_PDF_MARGIN_MM = [14, 12, 14, 12] as const
const BROWSER_PDF_CONTENT_WIDTH_MM = 210 - BROWSER_PDF_MARGIN_MM[1] - BROWSER_PDF_MARGIN_MM[3]
const BROWSER_PDF_CONTENT_HEIGHT_MM =
  BROWSER_PDF_PAGE_HEIGHT_MM - BROWSER_PDF_MARGIN_MM[0] - BROWSER_PDF_MARGIN_MM[2]
const BROWSER_PDF_PAGE_BREAK_SEARCH_RATIO = 0.12
const BROWSER_PDF_PAGE_BREAK_SEARCH_MAX_PX = 160
const BROWSER_PDF_PAGE_BREAK_SEARCH_MIN_PX = 24
const BROWSER_PDF_PAGE_BREAK_SAMPLE_STEP_PX = 4
const BROWSER_PDF_PAGE_BREAK_WHITE_THRESHOLD = 246
const BROWSER_PDF_PAGE_BREAK_ALPHA_THRESHOLD = 12
const BROWSER_PDF_PAGE_BREAK_EMPTY_ROW_MAX_INK = 1

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

  await downloadDocumentAsPdf(
    htmlToPdfFilename(exportTitle),
    rendered.html,
  )
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

function buildDocumentExportStyles(): string {
  return `
      .${DOCUMENT_EXPORT_ROOT_CLASS} {
        color-scheme: light;
        margin: 0;
        padding: 0;
        font-family:
          "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
          "Segoe UI", sans-serif;
        color: #18212f;
        background: #ffffff;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} main {
        max-width: 860px;
        margin: 0 auto;
        padding: 40px 32px 72px;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} h1,
      .${DOCUMENT_EXPORT_ROOT_CLASS} h2,
      .${DOCUMENT_EXPORT_ROOT_CLASS} h3,
      .${DOCUMENT_EXPORT_ROOT_CLASS} h4,
      .${DOCUMENT_EXPORT_ROOT_CLASS} h5,
      .${DOCUMENT_EXPORT_ROOT_CLASS} h6 {
        margin: 1.5em 0 0.7em;
        line-height: 1.28;
        color: #101827;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} h1 {
        font-size: 30px;
        padding-bottom: 0.42em;
        border-bottom: 1px solid #dbe4f0;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} h2 {
        font-size: 24px;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} h3 {
        font-size: 20px;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} p,
      .${DOCUMENT_EXPORT_ROOT_CLASS} li,
      .${DOCUMENT_EXPORT_ROOT_CLASS} blockquote,
      .${DOCUMENT_EXPORT_ROOT_CLASS} td,
      .${DOCUMENT_EXPORT_ROOT_CLASS} th {
        font-size: 15px;
        line-height: 1.82;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} a {
        color: #2259d1;
        text-decoration: none;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} code,
      .${DOCUMENT_EXPORT_ROOT_CLASS} pre,
      .${DOCUMENT_EXPORT_ROOT_CLASS} kbd {
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", monospace;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} pre {
        padding: 16px;
        border-radius: 18px;
        overflow: auto;
        background: #111827;
        color: #f8fafc;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} code {
        white-space: pre-wrap;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} :not(pre) > code {
        padding: 0.18em 0.42em;
        border-radius: 7px;
        background: #eef2f8;
        color: #132238;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} blockquote {
        margin: 1.1em 0;
        padding: 0.9em 1.1em;
        border-left: 4px solid #7fa4ff;
        background: #f6f8fd;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} table {
        width: 100%;
        border-collapse: collapse;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} th,
      .${DOCUMENT_EXPORT_ROOT_CLASS} td {
        padding: 12px 14px;
        border: 1px solid #dbe4f0;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} thead {
        background: #f5f7fb;
      }

      .${DOCUMENT_EXPORT_ROOT_CLASS} img {
        max-width: 100%;
        height: auto;
      }

      @page {
        size: auto;
        margin: 14mm 12mm;
      }
  `
}

function buildDocumentExportBody(bodyHtml: string): string {
  return `<main>
      ${bodyHtml}
    </main>`
}

function buildDocumentExportHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>${buildDocumentExportStyles()}</style>
  </head>
  <body class="${DOCUMENT_EXPORT_ROOT_CLASS}">
    ${buildDocumentExportBody(bodyHtml)}
  </body>
</html>`
}

function htmlToPdfFilename(title: string): string {
  return title.endsWith('.pdf') ? title : `${title}.pdf`
}

interface BrowserPdfRenderHost {
  cleanup: () => void
  frameElement: HTMLIFrameElement
  frameDocument: Document
  frameWindow: Window
  renderRoot: HTMLElement
}

function createBrowserPdfRenderHost(bodyHtml: string): BrowserPdfRenderHost {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.position = 'fixed'
  frame.style.left = '-10000px'
  frame.style.top = '0'
  frame.style.width = `${BROWSER_PDF_VIEWPORT_WIDTH_PX}px`
  frame.style.height = '1px'
  frame.style.border = '0'
  frame.style.opacity = '0'
  frame.style.pointerEvents = 'none'
  frame.style.background = '#ffffff'
  document.body.append(frame)

  const frameDocument = frame.contentDocument
  const frameWindow = frame.contentWindow
  if (!frameDocument || !frameWindow) {
    frame.remove()
    throw new Error('Failed to create PDF export iframe')
  }

  frameDocument.open()
  frameDocument.write(buildDocumentExportHtml('PDF Export', bodyHtml))
  frameDocument.close()

  const renderRoot = frameDocument.querySelector<HTMLElement>(
    `.${DOCUMENT_EXPORT_ROOT_CLASS}`,
  )
  if (!renderRoot) {
    frame.remove()
    throw new Error('Failed to prepare PDF export document')
  }

  for (const image of Array.from(frameDocument.images)) {
    image.loading = 'eager'
    image.decoding = 'sync'
  }

  return {
    cleanup: () => frame.remove(),
    frameElement: frame,
    frameDocument,
    frameWindow,
    renderRoot,
  }
}

function syncBrowserPdfRenderHostSize(
  frameElement: HTMLIFrameElement,
  renderRoot: HTMLElement,
): void {
  const renderHeight = Math.max(
    renderRoot.scrollHeight,
    renderRoot.offsetHeight,
    renderRoot.clientHeight,
    1,
  )
  frameElement.style.height = `${Math.ceil(renderHeight)}px`
}

function waitForNextPaint(
  view?: Pick<Window, 'requestAnimationFrame'> | null,
): Promise<void> {
  return new Promise((resolve) => {
    const requestAnimationFrame =
      view?.requestAnimationFrame?.bind(view) ?? window.requestAnimationFrame

    if (typeof requestAnimationFrame !== 'function') {
      resolve()
      return
    }

    requestAnimationFrame(() => resolve())
  })
}

async function waitForBrowserPdfRenderReady(
  frameElement: HTMLIFrameElement,
  frameDocument: Document,
  frameWindow: Window,
  renderRoot: HTMLElement,
): Promise<void> {
  await waitForNextPaint(frameWindow)
  await waitForNextPaint(frameWindow)

  const imageElements = Array.from(frameDocument.querySelectorAll('img'))
  await Promise.all(imageElements.map((image) => {
    if (image.complete) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => resolve(), { once: true })
    })
  }))

  if (typeof frameDocument.fonts?.ready?.then === 'function') {
    await frameDocument.fonts.ready
  }

  syncBrowserPdfRenderHostSize(frameElement, renderRoot)
  await waitForNextPaint(frameWindow)
}

function createPagedPdfFromCanvas(
  JsPdfConstructor: typeof import('jspdf').jsPDF,
  canvas: HTMLCanvasElement,
): Blob {
  const pdfDocument = new JsPdfConstructor({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  })
  const pageCanvas = document.createElement('canvas')
  const pageContext = pageCanvas.getContext('2d')
  if (!pageContext) {
    throw new Error('Failed to prepare PDF page canvas')
  }

  const pixelsPerMillimeter = canvas.width / BROWSER_PDF_CONTENT_WIDTH_MM
  const pageHeightPx = Math.max(
    1,
    Math.floor(BROWSER_PDF_CONTENT_HEIGHT_MM * pixelsPerMillimeter),
  )
  const sourceContext = canvas.getContext('2d', { willReadFrequently: true })

  for (let pageIndex = 0, sourceY = 0; sourceY < canvas.height; pageIndex += 1) {
    const remainingHeightPx = canvas.height - sourceY
    const sliceHeightPx = remainingHeightPx > pageHeightPx && sourceContext
      ? resolveCanvasPageSliceHeight(
        sourceContext,
        canvas,
        sourceY,
        pageHeightPx,
      )
      : Math.min(pageHeightPx, remainingHeightPx)

    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeightPx
    pageContext.fillStyle = '#ffffff'
    pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    pageContext.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeightPx,
      0,
      0,
      canvas.width,
      sliceHeightPx,
    )

    if (pageIndex > 0) {
      pdfDocument.addPage()
    }

    pdfDocument.addImage(
      pageCanvas.toDataURL('image/png'),
      'PNG',
      BROWSER_PDF_MARGIN_MM[3],
      BROWSER_PDF_MARGIN_MM[0],
      BROWSER_PDF_CONTENT_WIDTH_MM,
      sliceHeightPx / pixelsPerMillimeter,
      undefined,
      'FAST',
    )

    sourceY += sliceHeightPx
  }

  return pdfDocument.output('blob')
}

function resolveCanvasPageSliceHeight(
  sourceContext: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sourceY: number,
  pageHeightPx: number,
): number {
  const searchRadiusPx = Math.max(
    BROWSER_PDF_PAGE_BREAK_SEARCH_MIN_PX,
    Math.min(
      BROWSER_PDF_PAGE_BREAK_SEARCH_MAX_PX,
      Math.floor(pageHeightPx * BROWSER_PDF_PAGE_BREAK_SEARCH_RATIO),
    ),
  )
  const scanStartY = Math.max(
    sourceY + 1,
    sourceY + pageHeightPx - searchRadiusPx,
  )
  const scanEndY = Math.min(sourceY + pageHeightPx, canvas.height)
  const scanHeight = scanEndY - scanStartY

  if (scanHeight <= 0) {
    return Math.min(pageHeightPx, canvas.height - sourceY)
  }

  const imageData = sourceContext.getImageData(
    0,
    scanStartY,
    canvas.width,
    scanHeight,
  )
  const bestBreakY = findCanvasPageBreakY(imageData, scanStartY)
  return Math.max(
    1,
    Math.min(bestBreakY - sourceY, canvas.height - sourceY),
  )
}

function findCanvasPageBreakY(
  imageData: ImageData,
  scanStartY: number,
): number {
  const rowWidth = imageData.width
  const rowHeight = imageData.height
  const rowStride = rowWidth * 4
  let bestEmptyRowY = 0
  let bestInkRowY = 0
  let lowestInkScore = Number.POSITIVE_INFINITY

  for (let rowIndex = 0; rowIndex < rowHeight; rowIndex += 1) {
    const rowInkScore = measureCanvasRowInk(
      imageData.data,
      rowIndex * rowStride,
      rowWidth,
    )

    if (rowInkScore <= BROWSER_PDF_PAGE_BREAK_EMPTY_ROW_MAX_INK) {
      bestEmptyRowY = scanStartY + rowIndex + 1
    }

    if (rowInkScore <= lowestInkScore) {
      lowestInkScore = rowInkScore
      bestInkRowY = scanStartY + rowIndex + 1
    }
  }

  return bestEmptyRowY || bestInkRowY || (scanStartY + rowHeight)
}

function measureCanvasRowInk(
  pixels: Uint8ClampedArray,
  rowOffset: number,
  rowWidth: number,
): number {
  let inkScore = 0

  for (let column = 0; column < rowWidth; column += BROWSER_PDF_PAGE_BREAK_SAMPLE_STEP_PX) {
    const pixelOffset = rowOffset + (column * 4)
    const alpha = pixels[pixelOffset + 3]
    if (alpha < BROWSER_PDF_PAGE_BREAK_ALPHA_THRESHOLD) {
      continue
    }

    const red = pixels[pixelOffset]
    const green = pixels[pixelOffset + 1]
    const blue = pixels[pixelOffset + 2]
    if (
      red < BROWSER_PDF_PAGE_BREAK_WHITE_THRESHOLD
      || green < BROWSER_PDF_PAGE_BREAK_WHITE_THRESHOLD
      || blue < BROWSER_PDF_PAGE_BREAK_WHITE_THRESHOLD
    ) {
      inkScore += 1
    }
  }

  return inkScore
}

async function renderBrowserPdfCanvas(
  renderHost: BrowserPdfRenderHost,
): Promise<HTMLCanvasElement> {
  syncBrowserPdfRenderHostSize(
    renderHost.frameElement,
    renderHost.renderRoot,
  )

  const { default: html2canvas } = await import('html2canvas')
  return html2canvas(renderHost.renderRoot, {
    backgroundColor: '#ffffff',
    useCORS: true,
    scale: 2,
    logging: false,
    width: Math.max(
      renderHost.renderRoot.scrollWidth,
      renderHost.renderRoot.clientWidth,
      BROWSER_PDF_VIEWPORT_WIDTH_PX,
    ),
    height: Math.max(
      renderHost.renderRoot.scrollHeight,
      renderHost.renderRoot.clientHeight,
      1,
    ),
    windowWidth: Math.max(
      renderHost.renderRoot.scrollWidth,
      renderHost.renderRoot.clientWidth,
      BROWSER_PDF_VIEWPORT_WIDTH_PX,
    ),
    windowHeight: Math.max(
      renderHost.renderRoot.scrollHeight,
      renderHost.renderRoot.clientHeight,
      1,
    ),
  })
}

let jsPdfModulePromise: Promise<typeof import('jspdf')> | undefined

async function loadJsPdf(): Promise<typeof import('jspdf')> {
  jsPdfModulePromise ??= import('jspdf')
  return jsPdfModulePromise
}

async function downloadDocumentAsPdf(
  filename: string,
  bodyHtml: string,
): Promise<void> {
  const renderHost = createBrowserPdfRenderHost(bodyHtml)

  try {
    await waitForBrowserPdfRenderReady(
      renderHost.frameElement,
      renderHost.frameDocument,
      renderHost.frameWindow,
      renderHost.renderRoot,
    )

    const [{ jsPDF }, canvas] = await Promise.all([
      loadJsPdf(),
      renderBrowserPdfCanvas(renderHost),
    ])
    downloadBlob(createPagedPdfFromCanvas(jsPDF, canvas), filename)
  }
  finally {
    renderHost.cleanup()
  }
}
