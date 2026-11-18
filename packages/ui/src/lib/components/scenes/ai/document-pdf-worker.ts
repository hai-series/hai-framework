import { sliceCanvasPages } from './document-pdf-pages.js'

/**
 * 页面 PNG 和其在 PDF 中的正文高度，单位为毫米。
 * @example 模块内部上下文
 * ```ts
 * const page: PdfPage = { bytes: new Uint8Array(1), height: 100 }
 * ```
 */
export interface PdfPage {
  bytes: Uint8Array<ArrayBuffer>
  height: number
}

globalThis.addEventListener('message', async ({ data: bitmap }: MessageEvent<ImageBitmap>) => {
  try {
    const source = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = source.getContext('2d', { willReadFrequently: true })
    if (!context)
      throw new Error('Failed to prepare PDF source canvas')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()

    const page = new OffscreenCanvas(1, 1)
    const pages: PdfPage[] = []
    for (const height of sliceCanvasPages(source, page)) {
      const image = await page.convertToBlob({ type: 'image/png' })
      pages.push({
        bytes: new Uint8Array(await image.arrayBuffer()),
        height,
      })
    }
    globalThis.postMessage(pages, {
      transfer: pages.map(item => item.bytes.buffer),
    })
  }
  catch {
    globalThis.postMessage(undefined)
  }
  finally { bitmap.close() }
})
