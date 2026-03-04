/**
 * 健康检查端点
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'

export const GET: RequestHandler = async ({ locals }) => {
  return kit.response.ok({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }, locals.requestId)
}
