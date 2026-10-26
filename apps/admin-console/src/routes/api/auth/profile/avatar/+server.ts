import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import * as m from '$lib/paraglide/messages.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'

/** 头像上传大小上限：2MB */
const MAX_AVATAR_SIZE = 2 * 1024 * 1024

/** 允许上传的头像 MIME 类型白名单 */
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
 * 上传头像文件到存储服务，返回公开可访问 URL。
 *
 * 说明：
 * - 本地 `/api/storage/[...key]` 只公开服务器生成的规范头像路径
 * - 优先使用 `storage.presign.publicUrl(key)`，本地存储回退到该头像端点
 * - 若未配置公开 URL（返回 null），接口返回内部错误
 *
 * @returns 上传处理结果，成功时返回头像 URL
 */
export const POST = kit.handler(async ({ request, locals, cookies }) => {
  await kit.guard.requireSensitive(iam, { request, cookies }, 'iam.profile.avatar')
  const locale = locals.locale === 'en-US' ? 'en-US' : locals.locale === 'ja-JP' ? 'ja-JP' : 'zh-CN'
  if (!locals.accessToken) {
    return kit.response.unauthorized(m.common_error({}, { locale }))
  }
  const userResult = await iam.user.getCurrentUser(locals.accessToken)
  if (!userResult.success) {
    return kit.response.unauthorized(m.common_error({}, { locale }))
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return kit.response.badRequest(m.api_common_required_fields({}, { locale }))
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return kit.response.badRequest(m.api_auth_avatar_invalid_type({}, { locale }))
  }

  if (file.size > MAX_AVATAR_SIZE) {
    return kit.response.badRequest(m.api_auth_avatar_size_exceeded({}, { locale }))
  }

  const userId = userResult.data.id
  const ext = EXT_MAP[file.type]
  // 使用随机后缀避免同名覆盖，路径按用户隔离
  const hash = randomBytes(8).toString('hex')
  const key = `avatars/${userId}/${hash}${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const putResult = await storage.file.put(key, buffer, { contentType: file.type })
  if (!putResult.success) {
    return kit.response.internalError(m.common_error({}, { locale }))
  }

  // 头像优先使用公开存储地址，本地存储由只开放规范头像键的端点读取。
  const origin = new URL(request.url).origin
  const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/')
  const avatarUrl = storage.presign.publicUrl(key) ?? `${origin}/api/storage/${encodedKey}`
  if (!avatarUrl) {
    return kit.response.internalError(m.common_error({}, { locale }))
  }

  return kit.response.ok({ avatar: avatarUrl })
})
