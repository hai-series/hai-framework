/**
 * =============================================================================
 * Admin Console - 健康检查 API（需认证）
 * =============================================================================
 */

import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async ({ locals }) => {
  if (!locals.accessToken) {
    return kit.response.unauthorized()
  }

  const userResult = await iam.user.getCurrentUser(locals.accessToken)
  if (!userResult.success) {
    return kit.response.unauthorized()
  }

  return kit.response.ok({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.0.1',
  })
})
