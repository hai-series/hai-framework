/**
 * =============================================================================
 * H5 App - 文件上传 API — 使用 @h-ai/storage
 * =============================================================================
 */

import { Buffer } from 'node:buffer'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'

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
  if (file.size > 5 * 1024 * 1024) {
    return kit.response.badRequest('File size exceeds 5MB limit')
  }

  const ext = file.name.split('.').pop() ?? 'bin'
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
