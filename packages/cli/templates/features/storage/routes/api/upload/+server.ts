/**
 * 文件上传 API — storage 功能示例
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'

export const POST: RequestHandler = async ({ request, locals }) => {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return kit.response.badRequest('No file provided')
  }

  const { Buffer } = await import('node:buffer')
  const buffer = Buffer.from(await file.arrayBuffer())
  const key = `uploads/${Date.now()}-${file.name}`

  const result = await storage.put(key, buffer, {
    contentType: file.type,
    metadata: { originalName: file.name },
  })

  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.ok({
    key,
    name: file.name,
    size: file.size,
    type: file.type,
  }, locals.requestId)
}
