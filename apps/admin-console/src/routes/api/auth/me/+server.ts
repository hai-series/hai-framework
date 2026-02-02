/**
 * =============================================================================
 * Admin Console - 认证 API: 获取当前用户
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { json } from '@sveltejs/kit'

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const token = cookies.get('session_token')

    if (!token) {
      return json({ success: false, user: null })
    }

    // 验证令牌获取用户
    const userResult = await iam.user.getCurrentUser(token)
    if (!userResult.success) {
      cookies.delete('session_token', { path: '/' })
      return json({ success: false, user: null })
    }

    const user = userResult.data

    // 获取用户角色
    const rolesResult = await iam.authz.getUserRoles(user.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    return json({
      success: true,
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
    core.logger.error('获取用户信息失败:', { error })
    return json({ success: false, user: null }, { status: 500 })
  }
}
