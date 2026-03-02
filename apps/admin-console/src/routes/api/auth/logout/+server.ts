/**
 * =============================================================================
 * Admin Console - 认证 API: 登出
 * =============================================================================
 */

import { audit } from '@h-ai/audit'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ cookies, getClientAddress, request }) => {
  const token = cookies.get('hai_session')

  if (token) {
    // 验证 token 获取用户 ID
    const verifyResult = await iam.auth.verifyToken(token)
    if (verifyResult.success) {
      // 记录审计日志
      const ip = getClientAddress()
      const ua = request.headers.get('user-agent') ?? undefined
      await audit.helper.logout(verifyResult.data.userId, ip, ua)
    }

    // 登出（使会话失效）—— iam.auth.logout 返回 Result，永不 throw
    await iam.auth.logout(token)
  }

  // 清除 Cookie（无论是否出错都执行）
  kit.session.clearCookie(cookies)

  return kit.response.ok(null)
})
