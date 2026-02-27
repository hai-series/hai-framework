/**
 * =============================================================================
 * hai Admin Console - API 健康检查
 * =============================================================================
 */

import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.session) {
    return kit.response.unauthorized()
  }

  return kit.response.ok({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.0.1',
  })
}
