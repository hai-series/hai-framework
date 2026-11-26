import { feedbackLimits } from '@h-ai/api-contract/feedback'

const PRIVATE_SELECTOR = 'input[type="password"],[data-feedback-private],.rr-block,.rr-mask'
const CONTROL_SELECTOR = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])'

/**
 * 捕获当前可见页面，在克隆中遮挡私密内容。
 * @param signal - 取消等待或克隆；底层渲染不可中断时由调用方保留实际任务的单飞约束。
 * @example 模块内部上下文
 * ```ts
 * const file = await captureFeedbackScreenshot()
 * const length = file.size
 * ```
 */
export async function captureFeedbackScreenshot(signal?: AbortSignal): Promise<File> {
  signal?.throwIfAborted()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
  let nodes = 0
  while (walker.nextNode()) {
    if (++nodes > 10000)
      throw new RangeError('Screenshot document budget exceeded')
  }
  // 网络字体未就绪时最多等待半秒；采集总超时仍由客户端统一控制。
  if (document.fonts) {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise<void>(resolve => timeout = setTimeout(resolve, 500)),
      ])
    }
    finally {
      clearTimeout(timeout)
    }
  }
  const { default: html2canvas } = await import('html2canvas')
  signal?.throwIfAborted()
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
    ignoreElements: element => element.matches('[data-feedback-ignore],iframe,video,object,embed'),
    onclone: (clone) => {
      signal?.throwIfAborted()
      // html2canvas 仍会预解析根背景；现代颜色先转为浏览器实际像素色，原页面不变。
      const colorCanvas = clone.createElement('canvas')
      colorCanvas.width = 1
      colorCanvas.height = 1
      const paint = colorCanvas.getContext('2d', { willReadFrequently: true })
      const colors = new Map<string, string>()
      if (paint && clone.defaultView) {
        for (const element of clone.querySelectorAll<HTMLElement>('*')) {
          const computed = clone.defaultView.getComputedStyle(element)
          for (const property of [
            'color',
            'background-color',
            'border-top-color',
            'border-bottom-color',
            'border-left-color',
            'border-right-color',
            'outline-color',
            'text-decoration-color',
            '-webkit-text-stroke-color',
          ]) {
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
      for (const element of clone.querySelectorAll<HTMLElement>(`${PRIVATE_SELECTOR},${CONTROL_SELECTOR}`)) {
        if (!clone.documentElement.contains(element))
          continue
        const bounds = element.getBoundingClientRect()
        const replacement = clone.createElement('div')
        // 普通输入控件保留边框、底色和布局，只替换内容；显式私密区域继续不可逆遮挡。
        const computed = clone.defaultView?.getComputedStyle(element)
        if (computed) {
          for (const property of Array.from(computed))
            replacement.style.setProperty(property, computed.getPropertyValue(property), 'important')
        }
        replacement.style.setProperty('width', `${bounds.width}px`, 'important')
        replacement.style.setProperty('height', `${bounds.height}px`, 'important')
        replacement.style.setProperty('box-sizing', 'border-box', 'important')
        replacement.style.setProperty('overflow', 'hidden', 'important')
        if (element.matches(PRIVATE_SELECTOR)) {
          replacement.style.setProperty('background', '#111', 'important')
          replacement.style.setProperty('color', 'transparent', 'important')
        }
        else {
          const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          const value = 'value' in control
            ? control.value
            : element.textContent
          replacement.textContent = value
            ? '••••'
            : element.getAttribute('placeholder') ?? ''
        }
        replacement.setAttribute('aria-hidden', 'true')
        element.replaceWith(replacement)
      }
    },
  })
  try {
    signal?.throwIfAborted()
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value
      ? resolve(value)
      : reject(new Error('Screenshot encoding failed')), 'image/png'))
    signal?.throwIfAborted()
    if (!blob.size || blob.size > feedbackLimits.maxFileBytes)
      throw new RangeError('Screenshot exceeds the file limit')
    return new File([blob], 'screenshot.png', { type: 'image/png' })
  }
  finally {
    canvas.width = 0
    canvas.height = 0
  }
}
