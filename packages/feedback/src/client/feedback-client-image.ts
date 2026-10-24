/**
 * 截图与标注都在浏览器侧执行，不把原始 DOM 上传到受理服务。
 * 标注坐标使用浏览器解码后原图的像素；UI 的 0–1 坐标需将 x/width 乘 naturalWidth、y/height 乘 naturalHeight。
 * @example
 * ```ts
 * import type { FeedbackImageAnnotation } from '@h-ai/feedback/client'
 * const mask: FeedbackImageAnnotation = { x: 0, y: 0, width: 100, height: 40, mode: 'mask' }
 * ```
 */
export interface FeedbackImageAnnotation {
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
    width: Math.min(window.innerWidth, 1920),
    height: Math.min(window.innerHeight, 1200),
    scale: 1,
    // 原生 SVG foreignObject 保留 CSS mask 图标与字体基线，避免 CanvasRenderer 裁切文本。
    foreignObjectRendering: true,
    scrollX: -window.scrollX,
    scrollY: -window.scrollY,
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
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('Canvas is unavailable')
    context.drawImage(image, 0, 0)
    if (annotation.mode === 'mask') {
      context.fillStyle = '#111'
      context.fillRect(annotation.x, annotation.y, annotation.width, annotation.height)
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
