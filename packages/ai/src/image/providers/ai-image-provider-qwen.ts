/** @h-ai/ai — Qwen-Image 2.0 / 3.0 Provider */

import type { ImageProvider } from './ai-image-provider.js'
import { downloadImages, imageProtocolError, imageProviderFailure, readJson, referenceImageDataUrl } from './ai-image-provider.js'

/**
 * Qwen 多模态生成响应中的图片信源；地址仍须经过公共 HTTPS 下载校验。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const response: QwenImageResponse = { output: { choices: [{ message: { content: [{ image: 'https://images.example.com/generated.png' }] } }] } }
 * const choices = response.output?.choices ?? []
 * ```
 */
interface QwenImageResponse {
  output?: {
    choices?: Array<{
      message?: { content?: Array<{ image?: string }> }
    }>
  }
}

/**
 * 创建 Qwen-Image Provider
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * async function generate(request: Parameters<ImageProvider['generate']>[0]) {
 *   const provider = createQwenImageProvider()
 *   const result = await provider.generate(request)
 *   if (!result.success) return result
 *   return result.data
 * }
 * ```
 */
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
          redirect: 'error',
        })
        const parsed = await readJson(response, request)
        if (!parsed.success)
          return parsed
        const body = parsed.data as QwenImageResponse
        const urls = body.output?.choices
          ?.flatMap(choice => choice.message?.content ?? [])
          .flatMap(item => item.image ? [item.image] : []) ?? []
        if (!urls.length)
          return imageProtocolError()
        return await downloadImages(urls, request)
      }
      catch (error) {
        return imageProviderFailure(error)
      }
    },
  }
}
