/**
 * =============================================================================
 * Admin Console - 存储文件服务路由
 * =============================================================================
 *
 * 为本地存储提供文件访问能力。
 * S3 存储场景下应通过 publicUrl / presign URL 直接访问，不经此路由。
 *
 * GET /api/storage/{key} — 读取并返回存储文件
 * =============================================================================
 */

import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'

/**
 * 文件内容类型映射（按扩展名）
 */
const CONTENT_TYPE_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
}

export const GET = kit.handler(async ({ params }) => {
  const key = params.key
  if (!key) {
    return kit.response.badRequest('Missing file key')
  }

  // 安全校验：禁止路径穿越
  if (key.includes('..') || key.startsWith('/')) {
    return kit.response.badRequest('Invalid file key')
  }

  const headResult = await storage.file.head(key)
  if (!headResult.success) {
    return kit.response.notFound('File not found')
  }

  const getResult = await storage.file.get(key)
  if (!getResult.success) {
    return kit.response.notFound('File not found')
  }

  // 从 head 元数据或扩展名推断 Content-Type
  let contentType = headResult.data.contentType
  if (!contentType || contentType === 'application/octet-stream') {
    const ext = key.substring(key.lastIndexOf('.')).toLowerCase()
    contentType = CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream'
  }

  return new Response(getResult.data, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(headResult.data.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})
