/**
 * =============================================================================
 * hai Admin Console - API 健康检查
 * =============================================================================
 */

import type { RequestHandler } from './$types'
import { ok } from '@hai/kit'

export const GET: RequestHandler = async ({ locals }) => {
  return ok(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    },
    locals.requestId,
  )
}
