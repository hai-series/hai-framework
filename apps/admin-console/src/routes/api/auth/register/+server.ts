/**
 * =============================================================================
 * Admin Console - 认证 API: 注册
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { createRegisterSchema } from '$lib/server/schemas/index.js'
import { audit } from '@h-ai/audit'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request, cookies, getClientAddress }) => {
  // 检查注册是否启用
  if (iam.config?.register?.enabled === false) {
    return kit.response.forbidden(m.api_auth_register_disabled?.() ?? 'Registration is disabled')
  }

  const { username, email, password } = await kit.validate.formOrFail(request, createRegisterSchema())

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

  // 设置会话 Cookie
  kit.session.setCookie(cookies, accessToken, {
    maxAge: iam.config?.session?.maxAge,
  })

  // 审计日志 + 角色并行获取
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  const [, rolesResult] = await Promise.all([
    audit.helper.register(user.id, ip, ua),
    iam.authz.getUserRoles(user.id),
  ])
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
})
