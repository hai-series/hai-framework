/**
 * =============================================================================
 * Admin Console - 认证 API: 登出
 * =============================================================================
 */

import { audit } from '@h-ai/audit'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ getClientAddress, request, cookies, locals }) => {
  const token = locals.accessToken

  if (token) {
    // 记录审计日志（session 已由 guard 注入）
    if (locals.session) {
      const ip = getClientAddress()
      const ua = request.headers.get('user-agent') ?? undefined
      await audit.helper.logout(locals.session.userId, ip, ua)
    }
  }

  await kit.auth.logout(cookies, token)

  return kit.response.ok(null)
})
