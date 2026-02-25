/**
 * =============================================================================
 * Admin Console - 认证 API: 忘记密码
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { ForgotPasswordSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@hai/core'
import { iam } from '@hai/iam'
import { validateForm } from '@hai/kit'
import { json } from '@sveltejs/kit'

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    const { valid, data, errors } = await validateForm(request, ForgotPasswordSchema)
    if (!valid) {
      return json({ success: false, error: errors[0]?.message }, { status: 400 })
    }
    const { email } = data

    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined

    // 记录审计日志
    await audit.passwordResetRequest(email, ip, ua)

    // 使用 IAM 模块发起密码重置请求
    // 该方法内部会处理用户是否存在的逻辑
    await iam.user.requestPasswordReset(email)

    // 无论用户是否存在，都返回成功（防止邮箱枚举攻击）
    return json({ success: true, message: m.api_auth_password_reset_email_sent() })
  }
  catch (error) {
    core.logger.error('Forgot password request failed:', { error })
    return json({ success: false, error: m.api_auth_request_failed() }, { status: 500 })
  }
}
