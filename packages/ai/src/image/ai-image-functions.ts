/**
 * @h-ai/ai — 文生图子功能工厂
 *
 * 负责公共参数校验、模型解析与 Provider 路由。
 * @module image/ai-image-functions
 */

import type { AIConfig, ImageConfig, ImageProviderName } from '../ai-config.js'
import type { ImageOperations } from './ai-image-types.js'
import type { ImageProvider } from './providers/ai-image-provider.js'
import { core, err } from '@h-ai/core'
import { ImageConfigSchema, resolveImageModel } from '../ai-config.js'
import { aiM } from '../ai-i18n.js'
import { HaiAIError } from '../ai-types.js'
import { createGoogleImageProvider } from './providers/ai-image-provider-google.js'
import { createOpenAIImageProvider } from './providers/ai-image-provider-openai.js'
import { createPollinationsImageProvider } from './providers/ai-image-provider-pollinations.js'
import { createQwenImageProvider } from './providers/ai-image-provider-qwen.js'
import { createSeedreamImageProvider } from './providers/ai-image-provider-seedream.js'

const logger = core.logger.child({ module: 'ai', scope: 'image' })

/** 创建文生图操作接口 */
export function createImageOperations(config: AIConfig): ImageOperations {
  const imageConfig: ImageConfig = ImageConfigSchema.parse(config.image ?? {})
  const providers = new Map<ImageProviderName, ImageProvider>()

  function provider(name: ImageProviderName): ImageProvider {
    const cached = providers.get(name)
    if (cached)
      return cached
    const created = createProvider(name)
    providers.set(name, created)
    return created
  }

  return {
    async generate(request) {
      if (!request.prompt?.trim())
        return err(HaiAIError.IMAGE_INVALID_REQUEST, aiM('ai_imageInvalidRequest'))
      if (request.size && (!Number.isInteger(request.size.width) || !Number.isInteger(request.size.height) || request.size.width <= 0 || request.size.height <= 0))
        return err(HaiAIError.IMAGE_INVALID_REQUEST, aiM('ai_imageInvalidSize'))
      if (request.referenceImages?.some(image => image.data.byteLength === 0 || !image.mimeType.toLowerCase().startsWith('image/')))
        return err(HaiAIError.IMAGE_INVALID_REQUEST, aiM('ai_imageInvalidReferenceImage'))
      if (request.signal?.aborted)
        return err(HaiAIError.IMAGE_CANCELLED, aiM('ai_imageCancelled'))

      const resolved = resolveImageModel(imageConfig, request.model)
      if (!resolved.success) {
        logger.warn('Image model resolution failed', {
          code: resolved.error.code,
          error: resolved.error.message,
          requestedModel: request.model,
        })
        return resolved
      }
      const startedAt = Date.now()
      const logContext = {
        provider: resolved.data.provider,
        model: resolved.data.model,
        referenceImageCount: request.referenceImages?.length ?? 0,
        width: request.size?.width,
        height: request.size?.height,
      }
      logger.debug('Image generation started', logContext)
      const generated = await provider(resolved.data.provider).generate({
        model: resolved.data,
        prompt: request.prompt.trim(),
        size: request.size,
        referenceImages: request.referenceImages ?? [],
        signal: request.signal,
      })
      if (!generated.success) {
        logger.warn('Image generation failed', {
          ...logContext,
          durationMs: Date.now() - startedAt,
          code: generated.error.code,
          error: generated.error.message,
          upstream: generated.error.cause,
        })
        return generated
      }
      logger.info('Image generation completed', {
        ...logContext,
        durationMs: Date.now() - startedAt,
        imageCount: generated.data.length,
        mimeTypes: [...new Set(generated.data.map(image => image.mimeType))],
      })
      return { success: true, data: { images: generated.data } }
    },
  }
}

function createProvider(name: ImageProviderName): ImageProvider {
  switch (name) {
    case 'openai':
      return createOpenAIImageProvider()
    case 'google':
      return createGoogleImageProvider()
    case 'qwen':
      return createQwenImageProvider()
    case 'seedream':
      return createSeedreamImageProvider()
    case 'pollinations':
      return createPollinationsImageProvider()
  }
}
