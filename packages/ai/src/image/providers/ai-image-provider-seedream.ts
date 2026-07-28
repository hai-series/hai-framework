/** @h-ai/ai — 火山方舟 Seedream 4.x / 5.x Provider */

import type { ImageProvider } from './ai-image-provider.js'
import { downloadImage, imageFromBase64, imageProtocolError, imageProviderFailure, readJson, referenceImageDataUrl } from './ai-image-provider.js'

interface SeedreamImageResponse {
  data?: Array<{ b64_json?: string, url?: string }>
}

/** 创建 Seedream Provider */
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
        })
        const parsed = await readJson(response)
        if (!parsed.success)
          return parsed
        const body = parsed.data as SeedreamImageResponse
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
      catch (error) {
        return imageProviderFailure(error)
      }
    },
  }
}
