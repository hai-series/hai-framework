/**
 * =============================================================================
 * Admin Console - 认证 API: 注册
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { createRegisterSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  try {
    // 检查注册是否启用
    if (iam.config?.register?.enabled === false) {
      return kit.response.forbidden(m.api_auth_register_disabled?.() ?? 'Registration is disabled')
    }

    const { valid, data, errors } = await kit.validate.form(request, createRegisterSchema())
    if (!valid || !data) {
      return kit.response.badRequest(errors[0]?.message ?? 'Validation failed')
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
        return kit.response.conflict(m.api_auth_username_or_email_taken())
      }
      return kit.response.badRequest(registerResult.error.message)
    }

    const { user } = registerResult.data

    // 登录获取 token
    const loginResult = await iam.auth.login({ identifier: username, password })
    if (!loginResult.success) {
      // 注册成功但登录失败，返回成功但不设置 cookie
      return kit.response.ok({
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

    // 设置 Cookie（从 IAM 配置读取会话有效期，回退到 7 天）
    const sessionMaxAge = iam.config?.session?.maxAge ?? 60 * 60 * 24 * 7
    cookies.set('session_token', accessToken, {
      path: '/',
      httpOnly: true,
      // eslint-disable-next-line node/prefer-global/process
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sessionMaxAge,
    })

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.register(user.id, ip, ua)

    // 获取用户角色
    const rolesResult = await iam.authz.getUserRoles(user.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : ['user']

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
    core.logger.error('Registration failed:', { error })
    return kit.response.internalError(m.api_auth_register_failed())
  }
}
