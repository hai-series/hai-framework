/**
 * =============================================================================
 * Admin Console - 认证 API: 登出
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit } from '$lib/server/services/index.js'
import { iam } from '@hai/iam'
import { json } from '@sveltejs/kit'

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
        await audit.logout(verifyResult.data.sub, ip, ua)
      }

      // 登出（使会话失效）
      await iam.auth.logout(token)
    }

    // 清除 Cookie
    cookies.delete('session_token', { path: '/' })

    return json({ success: true })
  }
  catch (error) {
    console.error('登出失败:', error)
    // 即使出错也清除 Cookie
    cookies.delete('session_token', { path: '/' })
    return json({ success: true })
  }
}
