/**
 * =============================================================================
 * Admin Console - 认证 API: 注册
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { RegisterSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { kit } from '@hai/kit'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  try {
    const { valid, data, errors } = await kit.validate.form(request, RegisterSchema)
    if (!valid) {
      return json({ success: false, error: errors[0]?.message }, { status: 400 })
    }
    const { username, email, password } = data

    // 使用 IAM 模块注册用户
    const registerResult = await iam.user.register({
      username,
      email,
      password,
    })

    if (!registerResult.success) {
      // 根据错误码返回不同响应
      if (registerResult.error.code === 5002 || registerResult.error.code === 5502) {
        return json({ success: false, error: m.api_auth_username_or_email_taken() }, { status: 409 })
      }
      return json({ success: false, error: registerResult.error.message }, { status: 400 })
    }

    const { user } = registerResult.data

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
    core.logger.error('Registration failed:', { error })
    return json({ success: false, error: m.api_auth_register_failed() }, { status: 500 })
  }
}
