/**
 * =============================================================================
 * Admin Console - 认证 API: 注册
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit } from '$lib/server/services/index.js'
import { iam } from '@hai/iam'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  try {
    const body = await request.json()
    const { username, email, password, confirmPassword } = body as {
      username: string
      email: string
      password: string
      confirmPassword: string
    }

    // 验证必填字段
    if (!username || !email || !password) {
      return json({ success: false, error: '请填写所有必填字段' }, { status: 400 })
    }

    // 验证密码确认
    if (password !== confirmPassword) {
      return json({ success: false, error: '两次输入的密码不一致' }, { status: 400 })
    }

    // 验证用户名格式（3-20位字母数字下划线）
    if (!/^\w{3,20}$/.test(username)) {
      return json({ success: false, error: '用户名需为3-20位字母、数字或下划线' }, { status: 400 })
    }

    // 验证邮箱格式
    if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
      return json({ success: false, error: '请输入有效的邮箱地址' }, { status: 400 })
    }

    // 使用 IAM 模块注册用户
    const registerResult = await iam.user.register({
      username,
      email,
      password,
    })

    if (!registerResult.success) {
      // 根据错误码返回不同响应
      if (registerResult.error.code === 5002 || registerResult.error.code === 5502) {
        return json({ success: false, error: '用户名或邮箱已被使用' }, { status: 409 })
      }
      return json({ success: false, error: registerResult.error.message }, { status: 400 })
    }

    const user = registerResult.data

    // 分配默认角色 (user)
    await iam.authz.assignRole(user.id, 'role_user')

    // 登录获取 token
    const loginResult = await iam.auth.login({ identifier: username, password })
    if (!loginResult.success) {
      // 注册成功但登录失败，返回成功但不设置 cookie
      return json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          display_name: user.displayName,
          avatar: user.avatarUrl,
          roles: ['user'],
        },
      })
    }

    const { accessToken } = loginResult.data

    // 设置 Cookie
    cookies.set('session_token', accessToken, {
      path: '/',
      httpOnly: true,
      // eslint-disable-next-line node/prefer-global/process
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 天
    })

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.register(user.id, ip, ua)

    // 获取用户角色
    const rolesResult = await iam.authz.getUserRoles(user.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : ['user']

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
    console.error('注册失败:', error)
    return json({ success: false, error: '注册失败，请稍后重试' }, { status: 500 })
  }
}
