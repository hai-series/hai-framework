/**
 * =============================================================================
 * Admin Console - 认证 API: 登出
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = async ({ cookies, getClientAddress, request }) => {
  try {
    const token = cookies.get('session_token')

    if (token) {
      // 验证 token 获取用户 ID
      const verifyResult = await iam.auth.verifyToken(token)
      if (verifyResult.success) {
        // 记录审计日志
        const ip = getClientAddress()
        const ua = request.headers.get('user-agent') ?? undefined
        await audit.logout(verifyResult.data.userId, ip, ua)
      }

      // 登出（使会话失效）
      await iam.auth.logout(token)
    }

    // 清除 Cookie
    cookies.delete('session_token', { path: '/' })

    return kit.response.ok(null)
  }
  catch (error) {
    core.logger.error('Logout failed:', { error })
    // 即使出错也清除 Cookie
    cookies.delete('session_token', { path: '/' })
    return kit.response.ok(null)
  }
}
