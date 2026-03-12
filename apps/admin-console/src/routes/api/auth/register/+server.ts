/**
 * =============================================================================
 * Admin Console - 认证 API: 注册
 * =============================================================================
 */

import * as m from '$lib/paraglide/messages.js'
import { createRegisterSchema } from '$lib/server/schemas/index.js'
import { audit } from '@h-ai/audit'
import { iam, IamErrorCode, IamErrorHttpStatus } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request, cookies, getClientAddress }) => {
  if (!iam.isRegisterEnabled) {
    return kit.response.forbidden(m.common_error())
  }

  const { username, email, password } = await kit.validate.body(request, createRegisterSchema())

  const result = await kit.auth.registerAndLogin(cookies, { username, email, password })
  if (!result.success) {
    if (result.error.code === IamErrorCode.USER_NOT_FOUND || result.error.code === IamErrorCode.USER_ALREADY_EXISTS) {
      return kit.response.conflict(m.api_auth_username_or_email_taken())
    }
    return kit.response.fromError(result.error, IamErrorHttpStatus)
  }

  const { user, tokens, roles } = result.data

  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.register(user.id, ip, ua)

  return kit.response.ok({
    accessToken: tokens.accessToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.displayName,
      avatar: user.avatarUrl,
      roles,
    },
  })
})
