/**
 * =============================================================================
 * Admin Console - 认证 API: 登录
 * =============================================================================
 */

import { LoginSchema } from '$lib/server/schemas/index.js'
import { audit } from '@h-ai/audit'
import { iam, IamErrorCode } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request, cookies, getClientAddress }) => {
  const { identifier, password } = await kit.validate.formOrFail(request, LoginSchema)

  // 使用 IAM 模块登录
  const loginResult = await iam.auth.login({ identifier, password })
  if (!loginResult.success) {
    const errorCode = loginResult.error.code
    // 根据错误码决定 HTTP 状态码
    let status = 400
    if (errorCode === IamErrorCode.INVALID_CREDENTIALS || errorCode === IamErrorCode.USER_NOT_FOUND) {
      status = 401
    }
    else if (errorCode === IamErrorCode.USER_DISABLED || errorCode === IamErrorCode.USER_LOCKED) {
      status = 403
    }
    return kit.response.error('AUTH_FAILED', loginResult.error.message, status)
  }

  const { user, accessToken } = loginResult.data

  // 设置会话 Cookie
  kit.session.setCookie(cookies, accessToken, {
    maxAge: iam.config?.session?.maxAge,
  })

  // 审计日志 + 角色权限并行获取
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  const [, rolesResult, permissionsResult] = await Promise.all([
    audit.helper.login(user.id, ip, ua),
    iam.authz.getUserRoles(user.id),
    iam.authz.getUserPermissions(user.id),
  ])
  const roles = rolesResult.success ? rolesResult.data.map(r => r.code) : []
  const permissions = permissionsResult.success ? permissionsResult.data.map(p => p.code) : []

  return kit.response.ok({
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
})
