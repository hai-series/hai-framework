/**
 * =============================================================================
 * Admin Console - 认证 API: 获取当前用户
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { sessionService, userService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const token = cookies.get('session_token')

    if (!token) {
      return json({ success: false, user: null })
    }

    // 验证会话
    const session = await sessionService.validate(token)
    if (!session) {
      cookies.delete('session_token', { path: '/' })
      return json({ success: false, user: null })
    }

    // 获取用户信息
    const user = await userService.getById(session.userId)
    if (!user) {
      cookies.delete('session_token', { path: '/' })
      return json({ success: false, user: null })
    }

    return json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar: user.avatar,
        roles: user.roles,
      },
    })
  }
  catch (error) {
    console.error('获取用户信息失败:', error)
    return json({ success: false, user: null }, { status: 500 })
  }
}
