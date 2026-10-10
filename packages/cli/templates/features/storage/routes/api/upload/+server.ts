/**
 * 文件上传 API — storage 功能示例
 */
import type { RequestHandler } from './$types'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { storage } from '@h-ai/storage'

export const POST: RequestHandler = kit.handler(async ({ request, locals }) => {
  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0 || file.size > 10 * 1024 * 1024) {
    return kit.response.badRequest(core.i18n.coreM('core_errorValidation'), locals.requestId)
  }

  const { Buffer } = await import('node:buffer')
  const buffer = Buffer.from(await file.arrayBuffer())
  // 路径由服务端生成，用户文件名仅作为元数据保存。
  const key = `uploads/${core.id.uuid()}`

  const result = await storage.file.put(key, buffer, {
    contentType: file.type,
    metadata: { originalName: file.name },
  })

  if (!result.success) {
    return kit.response.fromError(result.error, locals.requestId)
  }

  return kit.response.ok({
    key,
    name: file.name,
    size: file.size,
    type: file.type,
  }, locals.requestId)
})
