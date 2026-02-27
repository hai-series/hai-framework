/**
 * =============================================================================
 * Admin Console - 认证 API: 重置密码
 * =============================================================================
 */

import type { RequestHandler } from '@sveltejs/kit'
import * as m from '$lib/paraglide/messages.js'
import { createResetPasswordSchema } from '$lib/server/schemas/index.js'
import { audit } from '$lib/server/services/index.js'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    const { valid, data, errors } = await kit.validate.form(request, createResetPasswordSchema())
    if (!valid) {
      return kit.response.badRequest(errors[0]?.message ?? 'Validation failed')
    }
    const { token, password } = data

    // 使用 IAM 模块确认密码重置
    const resetResult = await iam.user.confirmPasswordReset(token, password)
    if (!resetResult.success) {
      // 根据错误码返回不同响应
      if (resetResult.error.code === 5105) {
        return kit.response.badRequest(m.api_auth_reset_link_invalid())
      }
      return kit.response.badRequest(resetResult.error.message)
    }

    // 记录审计日志
    const ip = getClientAddress()
    const ua = request.headers.get('user-agent') ?? undefined
    // 因为 token 已用，无法获取 userId，记录 token 信息
    await audit.passwordResetComplete(token, ip, ua)

    return kit.response.ok({ message: m.api_auth_password_reset_success() })
  }
  catch (error) {
    core.logger.error('Password reset failed:', { error })
    return kit.response.internalError(m.api_auth_reset_password_failed())
  }
}
