/**
 * =============================================================================
 * Admin Console - 认证 API: 忘记密码
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { ForgotPasswordSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request, getClientAddress }) => {
  const { email } = await kit.validate.formOrFail(request, ForgotPasswordSchema)

  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined

  // 记录审计日志
  await audit.passwordResetRequest(email, ip, ua)

  // 使用 IAM 模块发起密码重置请求
  // 该方法内部会处理用户是否存在的逻辑
  await iam.user.requestPasswordReset(email)

  // 无论用户是否存在，都返回成功（防止邮箱枚举攻击）
  return kit.response.ok({ message: m.api_auth_password_reset_email_sent() })
})
