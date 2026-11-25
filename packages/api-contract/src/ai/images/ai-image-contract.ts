import { z } from 'zod'
import { route } from '../../common/route.js'

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024
const image = z.file().min(1).mime([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])
// oRPC 的 multipart 编码将数值字段写为十进制字符串。
const imageDimension = z.union([
  z.number(),
  z.string().regex(/^\d{1,4}$/).transform(Number),
])
  .pipe(z.number().int().positive().max(2048))
  .optional()
const model = z.string().trim().min(1).max(128).optional()

/**
 * 按提示词和可选参考图生成图片的端点。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const operation = apiContract.extensions.ai.images.generate
 * void operation
 * ```
 */
export const aiImageContract = {
  generate: route({
    method: 'POST',
    path: '/ai/images/generations',
    operationId: 'ai.images.generate',
    summary: 'Generate an image with optional reference images',
    tags: ['ai', 'images'],
  })
    .input(z.object({
      prompt: z.string().trim().min(1).max(5000),
      model,
      width: imageDimension,
      height: imageDimension,
      referenceImages: z.array(image.max(MAX_REFERENCE_IMAGE_BYTES)).max(4).optional(),
    }).strict()
      .refine(input => (input.width === undefined) === (input.height === undefined))
      .refine(input => (input.referenceImages ?? []).reduce((size, file) => size + file.size, 0) <= MAX_REFERENCE_IMAGE_BYTES))
    .output(image),
}
