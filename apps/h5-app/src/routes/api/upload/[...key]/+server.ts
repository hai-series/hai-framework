/**
 * =============================================================================
 * H5 App - 当前用户的私有图片读取 API
 * =============================================================================
 *
 * 上传图和识图原图统一经当前会话检查后读取，不向浏览器公开整个存储空间。
 * =============================================================================
 */

import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'
import * as m from '#lib/paraglide/messages.js'
import { canReadOwnedImage } from '#lib/server/storage-access.js'

function isSafeStorageKey(key: string): boolean {
  return key.length > 0
    && !key.startsWith('/')
    && !key.includes('\\')
    && !key.split('/').some(segment => segment === '..' || segment.length === 0)
}

export const GET = kit.handler(async ({ params, locals }) => {
  const locale = locals.locale === 'en-US'
    ? 'en-US'
    : locals.locale === 'ja-JP'
      ? 'ja-JP'
      : 'zh-CN'
  const key = params.key
  const userId = locals.session?.userId
  if (!userId)
    return kit.response.unauthorized()

  if (!key || !isSafeStorageKey(key)) {
    return kit.response.badRequest(m.api_upload_invalid_path({}, { locale }))
  }
  if (!canReadOwnedImage(userId, key))
    return kit.response.notFound(m.api_upload_file_not_found({}, { locale }))

  if (!storage.isInitialized) {
    return kit.response.error('STORAGE_UNAVAILABLE', m.api_upload_storage_unavailable({}, { locale }), 503)
  }

  const [headResult, fileResult] = await Promise.all([
    storage.file.head(key),
    storage.file.get(key),
  ])

  if (!headResult.success || !fileResult.success) {
    return kit.response.notFound(m.api_upload_file_not_found({}, { locale }))
  }

  const bytes = new Uint8Array(fileResult.data.byteLength)
  bytes.set(fileResult.data)

  return new Response(bytes, {
    headers: {
      'cache-control': 'private, no-store',
      'content-length': String(headResult.data.size),
      'content-type': headResult.data.contentType || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      ...(headResult.data.etag
        ? { etag: headResult.data.etag }
        : {}),
    },
    status: 200,
  })
})
