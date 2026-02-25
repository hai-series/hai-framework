/**
 * =============================================================================
 * @h-ai/kit - Storage Handle
 * =============================================================================
 * 集成 @h-ai/storage 的 SvelteKit 封装
 *
 * 功能：
 * - 文件上传 API 端点
 * - 预签名 URL 生成
 * - 文件列表/删除操作
 *
 * @example
 * ```ts
 * // src/routes/api/storage/[...path]/+server.ts
 * import { kit } from '@h-ai/kit'
 * import { storage } from '$lib/server/storage'
 *
 * const endpoint = kit.storage.createEndpoint({
 *     storage,
 *     bucket: 'uploads',
 *     allowedTypes: ['image/*', 'application/pdf'],
 *     maxFileSize: 10 * 1024 * 1024, // 10MB
 *     requireAuth: true,
 * })
 *
 * export const GET = endpoint.get
 * export const POST = endpoint.post
 * export const DELETE = endpoint.delete
 * ```
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { PresignResult, StorageEndpointConfig, StorageUploadResult } from './storage-types.js'
import { Buffer } from 'node:buffer'
import { getKitMessage } from '../../kit-i18n.js'

/**
 * 检查 MIME 类型是否匹配
 */
function matchMimeType(mimeType: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // 完全通配符
    if (pattern === '*/*') {
      return true
    }
    if (pattern.endsWith('/*')) {
      // 通配符匹配 (image/*, video/*, etc.)
      const category = pattern.slice(0, -2)
      return mimeType.startsWith(`${category}/`)
    }
    return mimeType === pattern
  })
}

/**
 * 创建存储 API 端点
 */
export function createStorageEndpoint(config: StorageEndpointConfig) {
  const {
    storage,
    bucket,
    allowedTypes = ['*/*'],
    maxFileSize = 50 * 1024 * 1024, // 50MB default
    requireAuth = false,
    generateKey,
    onUploadComplete,
    onUploadError,
  } = config

  /**
   * 检查认证
   */
  const checkAuth = (event: RequestEvent) => {
    if (!requireAuth)
      return true

    const locals = event.locals as { user?: { id: string } }
    return !!locals.user
  }

  /**
   * GET - 获取文件列表或生成预签名 URL
   */
  const get = async (event: RequestEvent): Promise<Response> => {
    if (!checkAuth(event)) {
      return new Response(JSON.stringify({ error: getKitMessage('kit_unauthorized') }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const url = event.url
    const action = url.searchParams.get('action')

    // 生成预签名上传 URL
    if (action === 'presign') {
      const filename = url.searchParams.get('filename')
      const contentType = url.searchParams.get('contentType')

      if (!filename) {
        return new Response(JSON.stringify({ error: getKitMessage('kit_missingFilename') }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // 生成文件 key
      const key = generateKey
        ? generateKey(filename, event)
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`

      try {
        const result = await storage.getPresignedUploadUrl(bucket, key, {
          contentType: contentType || undefined,
          expiresIn: 3600, // 1 小时
        })

        if (!result.success) {
          return new Response(JSON.stringify({ error: result.error?.message || getKitMessage('kit_presignUrlFailed') }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const response: PresignResult = {
          url: result.data!.url,
          key,
          bucket,
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      catch {
        return new Response(JSON.stringify({ error: getKitMessage('kit_presignUrlFailed') }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 获取文件列表
    if (action === 'list') {
      const prefix = url.searchParams.get('prefix') || ''
      const maxKeys = Number.parseInt(url.searchParams.get('maxKeys') || '100', 10)

      try {
        const result = await storage.list(bucket, { prefix, maxKeys })

        if (!result.success) {
          return new Response(JSON.stringify({ error: result.error?.message || getKitMessage('kit_listFailed') }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify({ files: result.data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      catch {
        return new Response(JSON.stringify({ error: getKitMessage('kit_listFailed') }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // 获取文件下载 URL
    const key = url.searchParams.get('key')
    if (key) {
      try {
        const result = await storage.getPresignedDownloadUrl(bucket, key, {
          expiresIn: 3600,
        })

        if (!result.success) {
          return new Response(JSON.stringify({ error: result.error?.message || getKitMessage('kit_downloadUrlFailed') }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify({ url: result.data!.url }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      catch {
        return new Response(JSON.stringify({ error: getKitMessage('kit_downloadUrlFailed') }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ error: getKitMessage('kit_invalidRequest') }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * POST - 直接上传文件
   */
  const post = async (event: RequestEvent): Promise<Response> => {
    if (!checkAuth(event)) {
      return new Response(JSON.stringify({ error: getKitMessage('kit_unauthorized') }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const formData = await event.request.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return new Response(JSON.stringify({ error: getKitMessage('kit_missingFile') }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // 检查文件类型
      if (!matchMimeType(file.type, allowedTypes)) {
        return new Response(JSON.stringify({ error: getKitMessage('kit_unsupportedFileType') }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // 检查文件大小
      if (file.size > maxFileSize) {
        return new Response(
          JSON.stringify({
            error: getKitMessage('kit_fileSizeExceeded', {
              params: { maxSize: Math.round(maxFileSize / 1024 / 1024) },
            }),
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      // 生成文件 key
      const key = generateKey
        ? generateKey(file.name, event)
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`

      // 上传文件
      const buffer = await file.arrayBuffer()
      const result = await storage.put(bucket, key, Buffer.from(buffer), {
        contentType: file.type,
        metadata: {
          originalName: file.name,
          uploadedBy: (event.locals as { user?: { id: string } }).user?.id || 'anonymous',
        },
      })

      if (!result.success) {
        await onUploadError?.({ error: result.error!, file, event })
        return new Response(JSON.stringify({ error: result.error?.message || getKitMessage('kit_uploadFailed') }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const uploadResult: StorageUploadResult = {
        key,
        bucket,
        size: file.size,
        contentType: file.type,
        url: result.data?.url,
      }

      await onUploadComplete?.({ result: uploadResult, file, event })

      return new Response(JSON.stringify(uploadResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    catch {
      return new Response(JSON.stringify({ error: getKitMessage('kit_uploadFailed') }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  /**
   * DELETE - 删除文件
   */
  const del = async (event: RequestEvent): Promise<Response> => {
    if (!checkAuth(event)) {
      return new Response(JSON.stringify({ error: getKitMessage('kit_unauthorized') }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const key = event.url.searchParams.get('key')

    if (!key) {
      return new Response(JSON.stringify({ error: getKitMessage('kit_missingKey') }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const result = await storage.delete(bucket, key)

      if (!result.success) {
        return new Response(JSON.stringify({ error: result.error?.message || getKitMessage('kit_deleteFailed') }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    catch {
      return new Response(JSON.stringify({ error: getKitMessage('kit_deleteFailed') }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return {
    get,
    post,
    delete: del,
  }
}
