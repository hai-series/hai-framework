/** @h-ai/ai — 火山方舟 Seedream 4.x / 5.x Provider */

import type { ImageProvider } from './ai-image-provider.js'
import { downloadImages, imageFromBase64, imageProtocolError, imageProviderFailure, readJson, referenceImageDataUrl } from './ai-image-provider.js'

/**
 * Seedream 生成响应中的 Base64 或受限远端图片地址。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const response: SeedreamImageResponse = { data: [{ b64_json: 'iVBORw0KGgo=' }] }
 * const encoded = response.data?.[0]?.b64_json
 * ```
 */
interface SeedreamImageResponse {
  data?: Array<{ b64_json?: string, url?: string }>
}

/**
 * 创建 Seedream Provider
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function generate(request: Parameters<ImageProvider['generate']>[0]) {
 *   const provider = createSeedreamImageProvider()
 *   const result = await provider.generate(request)
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
export function createSeedreamImageProvider(): ImageProvider {
  return {
    async generate(request) {
      try {
        const response = await fetch(`${request.model.baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${request.model.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model.model,
            prompt: request.prompt,
            ...(request.referenceImages.length
              ? { image: request.referenceImages.map(image => referenceImageDataUrl(image)) }
              : {}),
            ...(request.size ? { size: `${request.size.width}x${request.size.height}` } : {}),
            response_format: 'b64_json',
            sequential_image_generation: 'disabled',
            watermark: false,
          }),
          signal: request.signal,
          redirect: 'error',
        })
        const parsed = await readJson(response, request)
        if (!parsed.success)
          return parsed
        const body = parsed.data as SeedreamImageResponse
        if ((body.data?.length ?? 0) > request.maxImages)
          throw new RangeError('Image count exceeds limit')
        const base64Images = body.data?.flatMap(item => item.b64_json
          ? [imageFromBase64(item.b64_json, 'image/png', request)]
          : []) ?? []
        const urls = body.data?.flatMap(item => item.url ? [item.url] : []) ?? []
        if (base64Images.length + urls.length > request.maxImages)
          throw new RangeError('Image count exceeds limit')
        const downloaded = await downloadImages(urls, request)
        if (!downloaded.success)
          return downloaded
        const images = [...base64Images, ...downloaded.data]
        return images.length ? { success: true, data: images } : imageProtocolError()
      }
      catch (error) {
        return imageProviderFailure(error)
      }
    },
  }
}
