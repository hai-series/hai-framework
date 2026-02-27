/**
 * =============================================================================
 * Admin Console - 认证 API: 登录
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { LoginSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  try {
    const { valid, data, errors } = await kit.validate.form(request, LoginSchema)
    if (!valid) {
      return json({ success: false, error: errors[0]?.message }, { status: 400 })
    }
    const { identifier, password } = data

    // 使用 IAM 模块登录
    const loginResult = await iam.auth.login({ identifier, password })
    if (!loginResult.success) {
      // 直接使用 iam 模块返回的错误消息（已经过 i18n 处理）
      const errorCode = loginResult.error.code
      // 根据错误码决定 HTTP 状态码
      let status = 400
      // 5001 = INVALID_CREDENTIALS, 5002 = USER_NOT_FOUND
      if (errorCode === 5001 || errorCode === 5002) {
        status = 401
      }
      // 5003 = USER_DISABLED, 5004 = USER_LOCKED
      else if (errorCode === 5003 || errorCode === 5004) {
        status = 403
      }
      return json({ success: false, error: loginResult.error.message }, { status })
    }

    const { user, accessToken } = loginResult.data

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
    await audit.login(user.id, ip, ua)

    // 获取用户角色
    const rolesResult = await iam.authz.getUserRoles(user.id)
    const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []

    // 获取用户权限
    const permissionsResult = await iam.authz.getUserPermissions(user.id)
    const permissions = permissionsResult.success ? permissionsResult.data.map(p => p.code) : []

    return json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.displayName,
        avatar: user.avatarUrl,
        roles,
        permissions,
      },
    })
  }
  catch (error) {
    core.logger.error('Login failed:', { error })
    return json({ success: false, error: m.api_auth_login_failed() }, { status: 500 })
  }
}
