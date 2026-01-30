/**
 * =============================================================================
 * Admin Console - 认证 API: 重置密码
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit } from '$lib/server/services/index.js'
import { iam } from '@hai/iam'
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

    // 使用 IAM 模块确认密码重置
    const resetResult = await iam.user.confirmPasswordReset(token, password)
    if (!resetResult.success) {
      // 根据错误码返回不同响应
      if (resetResult.error.code === 5105) {
        return json({ success: false, error: '重置链接无效或已过期' }, { status: 400 })
      }
      return json({ success: false, error: resetResult.error.message }, { status: 400 })
    }

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    // 因为 token 已用，无法获取 userId，记录 token 信息
    await audit.passwordResetComplete(token, ip, ua)

    return json({ success: true, message: '密码重置成功，请使用新密码登录' })
  }
  catch (error) {
    console.error('重置密码失败:', error)
    return json({ success: false, error: '重置密码失败，请稍后重试' }, { status: 500 })
  }
}
