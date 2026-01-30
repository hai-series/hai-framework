/**
 * =============================================================================
 * Admin Console - 认证 API: 忘记密码
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import { audit, passwordResetService, userService } from '$lib/server/services/index.js'
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

    // 查找用户
    const user = await userService.getByIdentifier(email)

    // 无论用户是否存在，都返回成功（防止邮箱枚举攻击）
    if (!user) {
      // 记录审计日志（可疑操作）
      await audit.passwordResetRequest(email, ip, ua)
      return json({ success: true, message: '如果该邮箱已注册，您将收到密码重置邮件' })
    }

    // 创建密码重置令牌
    const resetToken = await passwordResetService.create(user.id)

    // 记录审计日志
    await audit.passwordResetRequest(email, ip, ua)

    // TODO: 发送邮件
    // 在开发环境下，输出重置链接到控制台
    // eslint-disable-next-line node/prefer-global/process
    if (process.env.NODE_ENV !== 'production') {
      /* eslint-disable no-console */
      console.log('========================================')
      console.log('密码重置链接（仅开发环境显示）:')
      console.log(`/auth/reset-password?token=${resetToken}`)
      console.log('========================================')
      /* eslint-enable no-console */
    }

    return json({ success: true, message: '如果该邮箱已注册，您将收到密码重置邮件' })
  }
  catch (error) {
    console.error('忘记密码请求失败:', error)
    return json({ success: false, error: '请求失败，请稍后重试' }, { status: 500 })
  }
}
