const BROWSER_PDF_PAGE_HEIGHT_MM = 297
/**
 * PDF 页边距按上、右、下、左排列，单位为毫米。
 * @example 模块内部上下文
 * ```ts
 * const topMargin = BROWSER_PDF_MARGIN_MM[0]
 * ```
 */
export const BROWSER_PDF_MARGIN_MM = [14, 12, 14, 12] as const
/**
 * PDF 正文宽度，单位为毫米。
 * @example 模块内部上下文
 * ```ts
 * const pdfWidth = BROWSER_PDF_CONTENT_WIDTH_MM
 * ```
 */
export const BROWSER_PDF_CONTENT_WIDTH_MM = 210 - BROWSER_PDF_MARGIN_MM[1] - BROWSER_PDF_MARGIN_MM[3]
const BROWSER_PDF_CONTENT_HEIGHT_MM
  = BROWSER_PDF_PAGE_HEIGHT_MM - BROWSER_PDF_MARGIN_MM[0] - BROWSER_PDF_MARGIN_MM[2]
const BROWSER_PDF_PAGE_BREAK_SEARCH_RATIO = 0.12
const BROWSER_PDF_PAGE_BREAK_SEARCH_MAX_PX = 160
const BROWSER_PDF_PAGE_BREAK_SEARCH_MIN_PX = 24
const BROWSER_PDF_PAGE_BREAK_SAMPLE_STEP_PX = 4
const BROWSER_PDF_PAGE_BREAK_WHITE_THRESHOLD = 246
const BROWSER_PDF_PAGE_BREAK_ALPHA_THRESHOLD = 12
const BROWSER_PDF_PAGE_BREAK_EMPTY_ROW_MAX_INK = 1

function canvas2d(canvas: HTMLCanvasElement | OffscreenCanvas, options?: CanvasRenderingContext2DSettings) {
  // 两种画布都提供 2D 重载，公共签名避免联合重载回退到其他渲染上下文。
  const surface: {
    getContext: (type: '2d', options?: CanvasRenderingContext2DSettings) => CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  } = canvas
  return surface.getContext('2d', options)
}

/**
 * 按每页可用高度及接近页底的空白行选择断点。页面画布由调用者按顺序复用。
 * @example 模块内部上下文
 * ```ts
 * const source = new OffscreenCanvas(794, 1123)
 * const page = new OffscreenCanvas(1, 1)
 * const pages = sliceCanvasPages(source, page)
 * ```
 */
export function* sliceCanvasPages(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  pageCanvas: HTMLCanvasElement | OffscreenCanvas,
): Generator<number> {
  const pageContext = canvas2d(pageCanvas)
  if (!pageContext) {
    throw new Error('Failed to prepare PDF page canvas')
  }

  const pixelsPerMillimeter = canvas.width / BROWSER_PDF_CONTENT_WIDTH_MM
  const pageHeightPx = Math.max(
    1,
    Math.floor(BROWSER_PDF_CONTENT_HEIGHT_MM * pixelsPerMillimeter),
  )
  const sourceContext = canvas2d(canvas, { willReadFrequently: true })

  for (let sourceY = 0; sourceY < canvas.height;) {
    const remainingHeightPx = canvas.height - sourceY
    const sliceHeightPx = remainingHeightPx > pageHeightPx && sourceContext
      ? resolveCanvasPageSliceHeight(sourceContext, canvas, sourceY, pageHeightPx)
      : Math.min(pageHeightPx, remainingHeightPx)

    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeightPx
    pageContext.fillStyle = '#ffffff'
    pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    pageContext.drawImage(canvas, 0, sourceY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)
    yield sliceHeightPx / pixelsPerMillimeter
    sourceY += sliceHeightPx
  }
}

function resolveCanvasPageSliceHeight(
  sourceContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
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
