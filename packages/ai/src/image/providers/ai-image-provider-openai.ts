/** @h-ai/ai — OpenAI GPT Image Provider */

import type { ImageProvider } from './ai-image-provider.js'
import { appendReferenceImages, imageFromBase64, imageProtocolError, imageProviderFailure, readJson } from './ai-image-provider.js'

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string }>
  output_format?: string
  size?: string
}

/** 创建 OpenAI GPT Image Provider */
export function createOpenAIImageProvider(): ImageProvider {
  return {
    async generate(request) {
      try {
        const hasReferences = request.referenceImages.length > 0
        const size = request.size ? `${request.size.width}x${request.size.height}` : undefined
        const form = new FormData()
        if (hasReferences) {
          form.set('model', request.model.model)
          form.set('prompt', request.prompt)
          form.set('n', '1')
          if (size)
            form.set('size', size)
          form.set('output_format', 'png')
          appendReferenceImages(form, 'image[]', request.referenceImages)
        }
        const response = await fetch(`${request.model.baseUrl}/images/${hasReferences ? 'edits' : 'generations'}`, {
          method: 'POST',
          headers: hasReferences
            ? { Authorization: `Bearer ${request.model.apiKey}` }
            : {
                'Authorization': `Bearer ${request.model.apiKey}`,
                'Content-Type': 'application/json',
              },
          body: hasReferences
            ? form
            : JSON.stringify({
                model: request.model.model,
                prompt: request.prompt,
                n: 1,
                ...(size ? { size } : {}),
                output_format: 'png',
              }),
          signal: request.signal,
        })
        const parsed = await readJson(response)
        if (!parsed.success)
          return parsed
        const body = parsed.data as OpenAIImageResponse
        const format = body.output_format ?? 'png'
        const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
        const images = body.data
          ?.filter(item => typeof item.b64_json === 'string')
          .map(item => imageFromBase64(item.b64_json!, mimeType, request.size))
          .filter(image => image.data.byteLength > 0)
        return images?.length ? { success: true, data: images } : imageProtocolError()
      }
      catch (error) {
        return imageProviderFailure(error)
      }
    },
  }
}
