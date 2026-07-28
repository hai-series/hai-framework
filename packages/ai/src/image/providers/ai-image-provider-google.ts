/** @h-ai/ai — Google Gemini Image / Nano Banana Provider */

import type { ImageSize } from '../ai-image-types.js'
import type { ImageProvider } from './ai-image-provider.js'
import { imageFromBase64, imageProtocolError, imageProviderFailure, readJson, referenceImageBase64 } from './ai-image-provider.js'

interface GoogleImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { mimeType?: string, data?: string }
        inline_data?: { mime_type?: string, data?: string }
      }>
    }
  }>
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0)
    [a, b] = [b, a % b]
  return a
}

function googleImageFormat(size: ImageSize): { aspectRatio: string, imageSize: string } {
  const divisor = greatestCommonDivisor(size.width, size.height)
  const edge = Math.max(size.width, size.height)
  return {
    aspectRatio: `${size.width / divisor}:${size.height / divisor}`,
    imageSize: edge <= 1024 ? '1K' : edge <= 2048 ? '2K' : '4K',
  }
}

/** 创建 Google Gemini Image Provider */
export function createGoogleImageProvider(): ImageProvider {
  return {
    async generate(request) {
      try {
        const generationConfig = request.size
          ? {
              responseModalities: ['IMAGE'],
              responseFormat: { image: googleImageFormat(request.size) },
            }
          : { responseModalities: ['IMAGE'] }
        const response = await fetch(`${request.model.baseUrl}/v1/models/${encodeURIComponent(request.model.model)}:generateContent`, {
          method: 'POST',
          headers: {
            'x-goog-api-key': request.model.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                ...request.referenceImages.map(image => ({
                  inlineData: {
                    mimeType: image.mimeType,
                    data: referenceImageBase64(image),
                  },
                })),
                { text: request.prompt },
              ],
            }],
            generationConfig,
          }),
          signal: request.signal,
        })
        const parsed = await readJson(response)
        if (!parsed.success)
          return parsed
        const body = parsed.data as GoogleImageResponse
        const parts = body.candidates?.flatMap(candidate => candidate.content?.parts ?? []) ?? []
        const images = parts.flatMap((part) => {
          if (part.inlineData?.data)
            return [imageFromBase64(part.inlineData.data, part.inlineData.mimeType ?? 'image/png', request.size)]
          if (part.inline_data?.data)
            return [imageFromBase64(part.inline_data.data, part.inline_data.mime_type ?? 'image/png', request.size)]
          return []
        })
        return images.length ? { success: true, data: images } : imageProtocolError()
      }
      catch (error) {
        return imageProviderFailure(error)
      }
    },
  }
}
