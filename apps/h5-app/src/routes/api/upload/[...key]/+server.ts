/**
 * =============================================================================
 * H5 App - 本地上传文件读取 API
 * =============================================================================
 *
 * 为 local storage 上传结果提供只读访问地址，避免头像上传后无法展示。
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'

function isSafeStorageKey(key: string): boolean {
  return key.length > 0
    && !key.startsWith('/')
    && !key.includes('\\')
    && !key.split('/').some(segment => segment === '..' || segment.length === 0)
}

export const GET = kit.handler(async ({ params }) => {
  const key = params.key

  if (!isSafeStorageKey(key)) {
    return kit.response.badRequest(m.api_upload_invalid_path())
  }

  if (!storage.isInitialized) {
    return kit.response.error('STORAGE_UNAVAILABLE', m.api_upload_storage_unavailable(), 503)
  }

  const [headResult, fileResult] = await Promise.all([
    storage.file.head(key),
    storage.file.get(key),
  ])

  if (!headResult.success || !fileResult.success) {
    return kit.response.notFound(m.api_upload_file_not_found())
  }

  const bytes = new Uint8Array(fileResult.data.byteLength)
  bytes.set(fileResult.data)

  return new Response(bytes, {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-length': String(headResult.data.size),
      'content-type': headResult.data.contentType || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      ...(headResult.data.etag ? { etag: headResult.data.etag } : {}),
    },
    status: 200,
  })
})
