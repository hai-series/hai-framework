/**
 * =============================================================================
 * H5 App - 文件上传 API — 使用 @h-ai/storage
 * =============================================================================
 */

import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const POST = kit.handler(async ({ request }) => {
  if (!storage.isInitialized) {
    return kit.response.error('STORAGE_UNAVAILABLE', 'File storage is not configured', 503)
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return kit.response.badRequest('No file provided')
  }

  // 限制文件大小 (5MB)
  if (file.size > MAX_UPLOAD_SIZE) {
    return kit.response.badRequest('File size exceeds 5MB limit')
  }

  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return kit.response.badRequest('Only JPG, PNG, WEBP are supported')
  }

  const ext = EXT_MAP[file.type]
  const key = `uploads/${core.id.generate()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await storage.file.put(key, buffer, {
    contentType: file.type,
  })

  if (!result.success) {
    core.logger.error('File upload failed', { error: result.error.message })
    return kit.response.internalError('Upload failed')
  }

  return kit.response.ok({ key, name: file.name, size: file.size, type: file.type })
})
