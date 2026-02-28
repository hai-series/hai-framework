/**
 * =============================================================================
 * H5 App - 用户资料 API（需登录）
 * =============================================================================
 */

import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

/**
 * GET /api/user/profile — 获取当前用户资料
 */
export const GET = kit.handler(async ({ locals }) => {
  const userId = locals.session?.userId
  if (!userId) {
    return kit.response.unauthorized()
  }

  const result = await iam.user.getUser(userId)
  if (!result.success || !result.data) {
    return kit.response.notFound('User not found')
  }

  const u = result.data
  return kit.response.ok({
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
  })
})
