/** @h-ai/ai — Pollinations 免费额度图片 Provider */

import type { ImageProvider } from './ai-image-provider.js'
import { appendReferenceImages, downloadImages, imageFromBase64, imageProtocolError, imageProviderFailure, readImageResponse, readJson } from './ai-image-provider.js'

/**
 * Pollinations 编辑接口返回的 Base64 或受限远端图片地址。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const response: PollinationsImageResponse = { data: [{ url: 'https://images.example.com/generated.png' }] }
 * const urls = response.data?.flatMap(item => item.url ? [item.url] : []) ?? []
 * ```
 */
interface PollinationsImageResponse {
  data?: Array<{ b64_json?: string, url?: string }>
}

/**
 * 创建 Pollinations Provider
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function generate(request: Parameters<ImageProvider['generate']>[0]) {
 *   const provider = createPollinationsImageProvider()
 *   const result = await provider.generate(request)
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
export function createPollinationsImageProvider(): ImageProvider {
  return {
    async generate(request) {
      try {
        if (request.referenceImages.length) {
          const form = new FormData()
          form.set('prompt', request.prompt)
          form.set('model', request.model.model)
          form.set('response_format', 'b64_json')
          if (request.size)
            form.set('size', `${request.size.width}x${request.size.height}`)
          appendReferenceImages(form, 'image', request.referenceImages)
          const response = await fetch(`${request.model.baseUrl}/v1/images/edits`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${request.model.apiKey}` },
            body: form,
            signal: request.signal,
            redirect: 'error',
          })
          const parsed = await readJson(response, request)
          if (!parsed.success)
            return parsed
          const body = parsed.data as PollinationsImageResponse
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

        const url = new URL(`${request.model.baseUrl}/image/${encodeURIComponent(request.prompt)}`)
        url.searchParams.set('model', request.model.model)
        if (request.size) {
          url.searchParams.set('width', String(request.size.width))
          url.searchParams.set('height', String(request.size.height))
        }
        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${request.model.apiKey}` },
          signal: request.signal,
          redirect: 'error',
        })
        const image = await readImageResponse(response, request)
        return image.success ? { success: true, data: [image.data] } : image
      }
      catch (error) {
        return imageProviderFailure(error)
      }
    },
  }
}
