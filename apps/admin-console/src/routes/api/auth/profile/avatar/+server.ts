import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { extname } from 'node:path'
import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/** MIME → 扩展名映射 */
const EXT_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

/**
 * 上传头像文件到存储服务，返回可访问的 URL。
 *
 * @returns 上传处理结果，成功时返回头像 URL
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

  const userId = userResult.data.id
  const ext = EXT_MAP[file.type] ?? extname(file.name) ?? '.bin'
  const hash = randomBytes(8).toString('hex')
  const key = `avatars/${userId}/${hash}${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const putResult = await storage.file.put(key, buffer, { contentType: file.type })
  if (!putResult.success) {
    return kit.response.internalError(m.common_error())
  }

  // 优先使用 storage publicUrl（S3 场景），本地存储回退到内部服务路由
  const avatarUrl = storage.presign.publicUrl(key) ?? `/api/storage/${key}`

  return kit.response.ok({ avatar: avatarUrl })
})
