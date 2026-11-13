/**
 * 文生图端点：校验提示词与尺寸后返回图片二进制。
 * @module routes/api/image/+server
 */

import { kit } from '@h-ai/kit'
import { ImageRequestSchema, MAX_REFERENCE_IMAGE_BYTES, MAX_REFERENCE_IMAGES } from '#lib/ai-lab-types.js'
import * as m from '#lib/paraglide/messages.js'
import { generateImage } from '#lib/server/ai-lab.js'

export const POST = kit.handler(async ({ request, locals }) => {
  const locale = locals.locale === 'en-US'
    ? 'en-US'
    : locals.locale === 'ja-JP'
      ? 'ja-JP'
      : 'zh-CN'
  const formData = await request.formData()
  const parsed = ImageRequestSchema.safeParse({
    prompt: formData.get('prompt'),
    width: Number(formData.get('width')),
    height: Number(formData.get('height')),
  })
  if (!parsed.success)
    return kit.response.badRequest(m.image_error_invalid_request({}, { locale }))

  const files = formData.getAll('referenceImages')
  const images = files.filter((file): file is File => file instanceof File && file.size > 0 && file.type.startsWith('image/'))
  if (images.length !== files.length || images.length > MAX_REFERENCE_IMAGES || images.reduce((size, file) => size + file.size, 0) > MAX_REFERENCE_IMAGE_BYTES)
    return kit.response.badRequest(m.image_error_invalid_reference({}, { locale }))

  const referenceImages = await Promise.all(images.map(async file => ({
    data: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type,
  })))
  const result = await generateImage({ ...parsed.data, referenceImages })
  if (!result.success)
    return kit.response.fromError(result.error)
  const image = result.data.images[0]
  if (!image)
    return kit.response.internalError(m.demo_request_failed({}, { locale }), locals.requestId)

  return new Response(image.data.slice().buffer, {
    headers: {
      'Content-Type': image.mimeType,
      ...(image.width
        ? {
            'X-Image-Width': String(image.width),
          }
        : {}),
      ...(image.height
        ? {
            'X-Image-Height': String(image.height),
          }
        : {}),
    },
  })
})
