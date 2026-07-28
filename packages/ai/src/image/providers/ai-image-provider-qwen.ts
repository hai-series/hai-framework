/** @h-ai/ai — Qwen-Image 2.0 / 3.0 Provider */

import type { ImageProvider } from './ai-image-provider.js'
import { downloadImage, imageProtocolError, imageProviderFailure, readJson, referenceImageDataUrl } from './ai-image-provider.js'

interface QwenImageResponse {
  output?: {
    choices?: Array<{
      message?: { content?: Array<{ image?: string }> }
    }>
  }
}

/** 创建 Qwen-Image Provider */
export function createQwenImageProvider(): ImageProvider {
  return {
    async generate(request) {
      try {
        const response = await fetch(`${request.model.baseUrl}/services/aigc/multimodal-generation/generation`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${request.model.apiKey}`,
            'Content-Type': 'application/json',
            ...(request.model.workspaceId ? { 'X-DashScope-WorkSpace': request.model.workspaceId } : {}),
          },
          body: JSON.stringify({
            model: request.model.model,
            input: {
              messages: [{
                role: 'user',
                content: [
                  ...request.referenceImages.map(image => ({ image: referenceImageDataUrl(image) })),
                  { text: request.prompt },
                ],
              }],
            },
            parameters: {
              n: 1,
              ...(request.size ? { size: `${request.size.width}*${request.size.height}` } : {}),
              watermark: false,
            },
          }),
          signal: request.signal,
        })
        const parsed = await readJson(response)
        if (!parsed.success)
          return parsed
        const body = parsed.data as QwenImageResponse
        const urls = body.output?.choices
          ?.flatMap(choice => choice.message?.content ?? [])
          .flatMap(item => item.image ? [item.image] : []) ?? []
        if (!urls.length)
          return imageProtocolError()
        const downloaded = await Promise.all(urls.map(url => downloadImage(url, request.signal, request.size)))
        const failure = downloaded.find(result => !result.success)
        if (failure && !failure.success)
          return failure
        return { success: true, data: downloaded.flatMap(result => result.success ? [result.data] : []) }
      }
      catch (error) {
        return imageProviderFailure(error)
      }
    },
  }
}
