/**
 * 截图与标注都在浏览器侧执行，不把原始 DOM 上传到受理服务。
 * 标注默认使用原图像素；UI 可直接传 coordinateSpace: 'ratio'，由 SDK 换算实际图片尺寸。
 * @example
 * ```ts
 * import type { FeedbackImageAnnotation } from '@h-ai/feedback/client'
 * const mask: FeedbackImageAnnotation = { x: 0, y: 0, width: 100, height: 40, mode: 'mask' }
 * ```
 */
export interface FeedbackImageAnnotation {
  /** ratio 由 SDK 按解码后的原图换算，宿主无需处理缩放或 JPEG 方向。 */
  coordinateSpace?: 'pixel' | 'ratio'
  x: number
  y: number
  width: number
  height: number
  mode: 'mask' | 'outline'
}

const PRIVATE_SELECTOR = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-feedback-private],.rr-block,.rr-mask'

/**
 * 捕获当前可见页面；反馈 UI 必须由调用方在本操作完成之后打开。
 * @example 模块内部上下文
 * ```ts
 * const bytes = await captureFeedbackScreenshot()
 * const length = bytes.byteLength
 * ```
 */
export async function captureFeedbackScreenshot(): Promise<Uint8Array> {
  // 网络字体未就绪时最多等待半秒；采集总超时仍由客户端统一控制。
  if (document.fonts) {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([document.fonts.ready, new Promise<void>(resolve => timeout = setTimeout(resolve, 500))])
    }
    finally {
      clearTimeout(timeout)
    }
  }
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(document.body, {
    width: window.innerWidth,
    height: window.innerHeight,
    scale: Math.min(1, 1920 / window.innerWidth, 1200 / window.innerHeight),
    // 原生 SVG foreignObject 保留 CSS mask 图标与字体基线，避免 CanvasRenderer 裁切文本。
    foreignObjectRendering: true,
    x: window.scrollX,
    y: window.scrollY,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    useCORS: false,
    allowTaint: false,
    logging: false,
    imageTimeout: 1000,
    ignoreElements: element => element.matches('[data-feedback-ignore],iframe,video'),
    onclone: (clone) => {
      // html2canvas 仍会预解析根背景；现代颜色先转为浏览器实际像素色，原页面不变。
      const colorCanvas = clone.createElement('canvas')
      colorCanvas.width = 1
      colorCanvas.height = 1
      const paint = colorCanvas.getContext('2d', { willReadFrequently: true })
      const colors = new Map<string, string>()
      if (paint && clone.defaultView) {
        for (const element of clone.querySelectorAll<HTMLElement>('*')) {
          const computed = clone.defaultView.getComputedStyle(element)
          for (const property of ['color', 'background-color', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'outline-color', 'text-decoration-color', '-webkit-text-stroke-color']) {
            const raw = computed.getPropertyValue(property)
            if (!/oklch|oklab|color\(|lab\(|lch\(/i.test(raw))
              continue
            let normalized = colors.get(raw)
            if (!normalized) {
              paint.clearRect(0, 0, 1, 1)
              paint.fillStyle = raw
              paint.fillRect(0, 0, 1, 1)
              const pixel = paint.getImageData(0, 0, 1, 1).data
              normalized = `rgba(${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]! / 255})`
              colors.set(raw, normalized)
            }
            element.style.setProperty(property, normalized, 'important')
          }
        }
      }
      for (const element of clone.querySelectorAll<HTMLElement>(PRIVATE_SELECTOR)) {
        const bounds = element.getBoundingClientRect()
        const replacement = clone.createElement('div')
        replacement.style.cssText = `width:${bounds.width}px;height:${bounds.height}px;background:#111;color:transparent;overflow:hidden`
        replacement.setAttribute('aria-hidden', 'true')
        element.replaceWith(replacement)
      }
    },
  })
  try {
    return await canvasBytes(canvas)
  }
  finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/**
 * 将遮挡实际烧录进图片，导出时不携带可恢复的原图。
 * @example 模块内部上下文
 * ```ts
 * const input = await captureFeedbackScreenshot()
 * const output = await annotateFeedbackImage(input, { x: 10, y: 10, width: 40, height: 20, mode: 'mask' })
 * ```
 */
export async function annotateFeedbackImage(bytes: Uint8Array, annotation: FeedbackImageAnnotation): Promise<Uint8Array> {
  if (![annotation.x, annotation.y, annotation.width, annotation.height].every(Number.isFinite) || annotation.width <= 0 || annotation.height <= 0)
    throw new Error('Invalid annotation rectangle')
  const image = new Image()
  const imageUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
  const canvas = document.createElement('canvas')
  try {
    image.src = imageUrl
    await image.decode()
    if (annotation.coordinateSpace === 'ratio') {
      if ([annotation.x, annotation.y, annotation.width, annotation.height].some(value => value < 0 || value > 1))
        throw new Error('Invalid annotation ratio')
      annotation = { ...annotation, x: annotation.x * image.naturalWidth, y: annotation.y * image.naturalHeight, width: annotation.width * image.naturalWidth, height: annotation.height * image.naturalHeight }
    }
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Canvas is unavailable')
    context.drawImage(image, 0, 0)
    if (annotation.mode === 'mask') {
      context.fillStyle = '#111'
      // 向外覆盖完整像素，避免小数选区的抗锯齿透出敏感内容。
      const left = Math.floor(annotation.x)
      const top = Math.floor(annotation.y)
      context.fillRect(left, top, Math.ceil(annotation.x + annotation.width) - left, Math.ceil(annotation.y + annotation.height) - top)
    }
    else {
      context.strokeStyle = '#e11d48'
      context.lineWidth = 3
      context.strokeRect(annotation.x, annotation.y, annotation.width, annotation.height)
    }
    return await canvasBytes(canvas)
  }
  finally {
    URL.revokeObjectURL(imageUrl)
    canvas.width = 0
    canvas.height = 0
  }
}

async function canvasBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Screenshot encoding failed')), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}
