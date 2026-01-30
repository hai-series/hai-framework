/**
 * =============================================================================
 * hai Admin Console - API 健康检查
 * =============================================================================
 */

import type { RequestHandler } from './$types'
import { json } from '@sveltejs/kit'

export const GET: RequestHandler = async () => {
  return json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    },
  })
}
