import { Buffer } from 'node:buffer'
import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/**
 * 校验头像文件并转为 data URL，供资料接口持久化保存。
 *
 * @returns 上传处理结果，成功时返回可持久化的头像 data URL
 */
export const POST = kit.handler(async ({ cookies, request }) => {
  const token = cookies.get('hai_session')
  if (!token) {
    return kit.response.unauthorized(m.common_error())
  }
  const userResult = await iam.user.getCurrentUser(token)
  if (!userResult.success) {
    return kit.response.unauthorized(m.common_error())
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return kit.response.badRequest(m.api_common_required_fields())
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return kit.response.badRequest(m.api_auth_avatar_invalid_type())
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return kit.response.badRequest(m.api_auth_avatar_size_exceeded())
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')
  const avatarDataUrl = `data:${file.type};base64,${base64}`

  return kit.response.ok({ avatar: avatarDataUrl })
})
