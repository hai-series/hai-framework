import type { RequestHandler } from '@sveltejs/kit'
import { Buffer } from 'node:buffer'
import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'
import { json } from '@sveltejs/kit'

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
export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const token = cookies.get('session_token')
    if (!token) {
      return json({ success: false, error: m.common_error() }, { status: 401 })
    }
    const userResult = await iam.user.getCurrentUser(token)
    if (!userResult.success) {
      return json({ success: false, error: m.common_error() }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return json({ success: false, error: m.api_common_required_fields() }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return json({ success: false, error: m.api_auth_avatar_invalid_type() }, { status: 400 })
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return json({ success: false, error: m.api_auth_avatar_size_exceeded() }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const avatarDataUrl = `data:${file.type};base64,${base64}`

    return json({
      success: true,
      avatar: avatarDataUrl,
    })
  }
  catch {
    return json({ success: false, error: m.common_error() }, { status: 500 })
  }
}
