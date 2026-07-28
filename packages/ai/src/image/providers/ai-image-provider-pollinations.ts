/** @h-ai/ai — Pollinations 免费额度图片 Provider */

import type { ImageProvider } from './ai-image-provider.js'
import { appendReferenceImages, downloadImage, imageFromBase64, imageProtocolError, imageProviderFailure, readImageResponse, readJson } from './ai-image-provider.js'

interface PollinationsImageResponse {
  data?: Array<{ b64_json?: string, url?: string }>
}

/** 创建 Pollinations Provider */
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
          })
          const parsed = await readJson(response)
          if (!parsed.success)
            return parsed
          const body = parsed.data as PollinationsImageResponse
          const base64Images = body.data?.flatMap(item => item.b64_json
            ? [imageFromBase64(item.b64_json, 'image/png', request.size)]
            : []) ?? []
          const urls = body.data?.flatMap(item => item.url ? [item.url] : []) ?? []
          const downloaded = await Promise.all(urls.map(url => downloadImage(url, request.signal, request.size)))
          const failure = downloaded.find(result => !result.success)
          if (failure && !failure.success)
            return failure
          const images = [...base64Images, ...downloaded.flatMap(result => result.success ? [result.data] : [])]
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
        })
        const image = await readImageResponse(response, request.size, 'image/jpeg')
        return image.success ? { success: true, data: [image.data] } : image
      }
      catch (error) {
        return imageProviderFailure(error)
      }
    },
  }
}
