/**
 * =============================================================================
 * Admin Console - 认证 API: 登录
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, sessionService, userService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  try {
    const body = await request.json()
    const { identifier, password } = body as { identifier: string, password: string }

    // 验证必填字段
    if (!identifier || !password) {
      return json({ success: false, error: '请输入用户名/邮箱和密码' }, { status: 400 })
    }

    // 查找用户
    const user = await userService.getByIdentifier(identifier)
    if (!user) {
      return json({ success: false, error: '用户名或密码错误' }, { status: 401 })
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return json({ success: false, error: '账户已被禁用' }, { status: 403 })
    }

    // 验证密码
    const valid = await userService.verifyPassword(user, password)
    if (!valid) {
      return json({ success: false, error: '用户名或密码错误' }, { status: 401 })
    }

    // 创建会话
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    const token = await sessionService.create(user.id, ip, ua)

    // 设置 Cookie
    cookies.set('session_token', token, {
      path: '/',
      httpOnly: true,
      // eslint-disable-next-line node/prefer-global/process
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 天
    })

    // 记录审计日志
    await audit.login(user.id, ip, ua)

    // 获取用户的角色和权限
    const { roles, permissions } = await userService.getUserRolesAndPermissions(user.id)

    return json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar: user.avatar,
        roles,
        permissions,
      },
    })
  }
  catch (error) {
    console.error('登录失败:', error)
    return json({ success: false, error: '登录失败，请稍后重试' }, { status: 500 })
  }
}
