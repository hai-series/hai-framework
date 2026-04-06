/**
 * =============================================================================
 * Admin Console - 本地存储公开读取端点
 * =============================================================================
 *
 * 仅用于本地开发 / E2E 下为 local storage 提供公开可访问 URL。
 * 若上游已提供 `storage.presign.publicUrl()`，业务优先使用上游公开地址。
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
    return kit.response.badRequest(m.common_error())
  }

  const [headResult, fileResult] = await Promise.all([
    storage.file.head(key),
    storage.file.get(key),
  ])

  if (!headResult.success || !fileResult.success) {
    return kit.response.notFound(m.common_error())
  }

  return new Response(fileResult.data, {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-length': String(headResult.data.size),
      'content-type': headResult.data.contentType || 'application/octet-stream',
      ...(headResult.data.etag ? { etag: headResult.data.etag } : {}),
    },
    status: 200,
  })
})
