/**
 * =============================================================================
 * H5 App - 登录 API
 * =============================================================================
 */

import process from 'node:process'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
})

export const POST = kit.handler(async ({ request, cookies }) => {
  const { identifier, password } = await kit.validate.formOrFail(request, LoginSchema)

  const loginResult = await iam.auth.login({ identifier, password })
  if (!loginResult.success) {
    const code = loginResult.error.code
    const status = (code === 5001 || code === 5002)
      ? 401
      : (code === 5003 || code === 5004)
          ? 403
          : 400
    return kit.response.error('AUTH_FAILED', loginResult.error.message, status)
  }

  const { user, tokens } = loginResult.data

  cookies.set('h5_access_token', tokens.accessToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: iam.config?.session?.maxAge,
  })

  return kit.response.ok({
    accessToken: tokens.accessToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  })
})
