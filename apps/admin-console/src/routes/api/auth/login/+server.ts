/**
 * =============================================================================
 * Admin Console - 认证 API: 登录
 * =============================================================================
 */

import { LoginSchema } from '$lib/server/schemas/index.js'
import { audit } from '@h-ai/audit'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request, cookies, getClientAddress }) => {
  const { identifier, password } = await kit.validate.body(request, LoginSchema)

  const loginResult = await kit.auth.login(cookies, { identifier, password })
  if (!loginResult.success) {
    return kit.response.fromError(loginResult.error)
  }

  const { user, tokens, roles, permissions } = loginResult.data

  const ip = getClientAddress()
  const ua = request.headers.get('user-agent') ?? undefined
  await audit.helper.login(user.id, ip, ua)

  return kit.response.ok({
    accessToken: tokens.accessToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.displayName,
      avatar: user.avatarUrl,
      roles,
      permissions,
    },
  })
})
