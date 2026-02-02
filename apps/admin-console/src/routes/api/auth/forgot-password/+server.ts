/**
 * =============================================================================
 * Admin Console - 认证 API: 忘记密码
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit } from '$lib/server/services/index.js'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    const body = await request.json()
    const { email } = body as { email: string }

    // 验证邮箱
    if (!email) {
      return json({ success: false, error: '请输入邮箱地址' }, { status: 400 })
    }

    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined

    // 记录审计日志
    await audit.passwordResetRequest(email, ip, ua)

    // 使用 IAM 模块发起密码重置请求
    // 该方法内部会处理用户是否存在的逻辑
    await iam.user.requestPasswordReset(email)

    // 无论用户是否存在，都返回成功（防止邮箱枚举攻击）
    return json({ success: true, message: '如果该邮箱已注册，您将收到密码重置邮件' })
  }
  catch (error) {
    core.logger.error('忘记密码请求失败:', { error })
    return json({ success: false, error: '请求失败，请稍后重试' }, { status: 500 })
  }
}
