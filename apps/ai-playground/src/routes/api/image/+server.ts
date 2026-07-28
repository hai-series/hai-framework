/**
 * 文生图端点：校验提示词与尺寸后返回图片二进制。
 * @module routes/api/image/+server
 */

import { ImageRequestSchema, MAX_REFERENCE_IMAGE_BYTES } from '$lib/ai-lab-types.js'
import * as m from '$lib/paraglide/messages.js'
import { generateImage } from '$lib/server/ai-lab.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request }) => {
  const formData = await request.formData()
  const parsed = ImageRequestSchema.safeParse({
    prompt: formData.get('prompt'),
    width: Number(formData.get('width')),
    height: Number(formData.get('height')),
  })
  if (!parsed.success)
    return kit.response.badRequest(m.image_error_invalid_request())

  const files = formData.getAll('referenceImages')
  if (files.some(file => !(file instanceof File) || file.size === 0 || file.size > MAX_REFERENCE_IMAGE_BYTES || !file.type.startsWith('image/')))
    return kit.response.badRequest(m.image_error_invalid_reference())

  const referenceImages = await Promise.all((files as File[]).map(async file => ({
    data: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type,
  })))
  const result = await generateImage({ ...parsed.data, referenceImages })
  if (!result.success)
    return kit.response.fromError(result.error)
  const image = result.data.images[0]!

  return new Response(image.data.slice().buffer, {
    headers: {
      'Content-Type': image.mimeType,
      ...(image.width ? { 'X-Image-Width': String(image.width) } : {}),
      ...(image.height ? { 'X-Image-Height': String(image.height) } : {}),
    },
  })
})
