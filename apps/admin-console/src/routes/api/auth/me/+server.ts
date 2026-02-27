/**
 * =============================================================================
 * Admin Console - 认证 API: 获取当前用户
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const token = cookies.get('session_token')

    if (!token) {
      return kit.response.unauthorized()
    }

    // 验证令牌获取用户
    const userResult = await iam.user.getCurrentUser(token)
    if (!userResult.success) {
      cookies.delete('session_token', { path: '/' })
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
  }
  catch (error) {
    core.logger.error('Failed to get user info:', { error })
    return kit.response.internalError()
  }
}
