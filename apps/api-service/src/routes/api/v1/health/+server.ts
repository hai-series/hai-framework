import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'

/**
 * 健康检查接口
 */
export const GET: RequestHandler = async () => {
  return json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.0.1'
  })
}
