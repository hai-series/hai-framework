/**
 * =============================================================================
 * Admin Console - 认证 API: 获取当前用户
 * =============================================================================
 */

import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const GET = kit.handler(async ({ cookies }) => {
  const token = cookies.get('hai_session')

  if (!token) {
    return kit.response.unauthorized()
  }

  // 验证令牌获取用户
  const userResult = await iam.user.getCurrentUser(token)
  if (!userResult.success) {
    kit.session.clearCookie(cookies)
    return kit.response.unauthorized()
  }

  const user = userResult.data

  // 获取用户角色
  const rolesResult = await iam.authz.getUserRoles(user.id)
  const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

  return kit.response.ok({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.displayName,
      avatar: user.avatarUrl,
      roles,
    },
  })
})
