/**
 * =============================================================================
 * Admin Console - 认证 API: 重置密码
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { createResetPasswordSchema } from '$lib/server/schemas/index.js'
import { audit } from '@h-ai/audit'
import { iam, IamErrorCode } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request, getClientAddress }) => {
  const { token, password } = await kit.validate.body(request, createResetPasswordSchema())

  // 使用 IAM 模块确认密码重置
  const resetResult = await iam.user.confirmPasswordReset(token, password)
  if (!resetResult.success) {
    // 根据错误码返回不同响应
    if (resetResult.error.code === IamErrorCode.RESET_TOKEN_INVALID) {
      return kit.response.badRequest(m.api_auth_reset_link_invalid())
    }
    return kit.response.badRequest(resetResult.error.message)
  }

  // 记录审计日志（不记录原始 token，防止凭据泄露）
  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.passwordResetComplete(null, ip, ua)

  return kit.response.ok({ message: m.api_auth_password_reset_success() })
})
