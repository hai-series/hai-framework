/**
 * =============================================================================
 * Admin Console - 认证 API: 重置密码
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, passwordResetService, sessionService, userService } from '$lib/server/services/index.js'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    const body = await request.json()
    const { token, password, confirmPassword } = body as {
      token: string
      password: string
      confirmPassword: string
    }

    // 验证必填字段
    if (!token || !password) {
      return json({ success: false, error: '请填写所有必填字段' }, { status: 400 })
    }

    // 验证密码确认
    if (password !== confirmPassword) {
      return json({ success: false, error: '两次输入的密码不一致' }, { status: 400 })
    }

    // 验证密码强度
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      return json({ success: false, error: '密码需至少8位，包含字母和数字' }, { status: 400 })
    }

    // 验证令牌
    const userId = await passwordResetService.validate(token)
    if (!userId) {
      return json({ success: false, error: '重置链接无效或已过期' }, { status: 400 })
    }

    // 重置密码
    await userService.resetPassword(userId, password)

    // 标记令牌已使用
    await passwordResetService.markUsed(token)

    // 销毁该用户的所有会话（强制重新登录）
    await sessionService.destroyAllForUser(userId)

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    await audit.passwordResetComplete(userId, ip, ua)

    return json({ success: true, message: '密码重置成功，请使用新密码登录' })
  }
  catch (error) {
    console.error('重置密码失败:', error)
    return json({ success: false, error: '重置密码失败，请稍后重试' }, { status: 500 })
  }
}
