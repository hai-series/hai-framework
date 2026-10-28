/**
 * 健康检查端点
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'

// 仅供SSR运行期检查；静态产物不发布健康API或固定时间戳。
export const prerender = false

export const GET: RequestHandler = async ({ locals }) => {
  return kit.response.ok({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }, locals.requestId)
}
