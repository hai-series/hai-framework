/**
 * =============================================================================
 * Admin Console - 认证 API: 登出
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, sessionService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ cookies, getClientAddress, request }) => {
  try {
    const token = cookies.get('session_token')

    if (token) {
      // 验证会话获取用户 ID
      const session = await sessionService.validate(token)
      if (session) {
        // 记录审计日志
        const ip = getClientAddress()
        const ua = request.headers.get('user-agent') ?? undefined
        await audit.logout(session.userId, ip, ua)
      }

      // 销毁会话
      await sessionService.destroy(token)
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
