/**
 * =============================================================================
 * H5 App - 登录 API
 * =============================================================================
 */

import { IamErrorHttpStatus } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
})

export const POST = kit.handler(async ({ request, cookies }) => {
  const { identifier, password } = await kit.validate.body(request, LoginSchema)

  const loginResult = await kit.auth.login(cookies, { identifier, password })
  if (!loginResult.success) {
    return kit.response.fromError(loginResult.error, IamErrorHttpStatus)
  }

  const { user, tokens } = loginResult.data

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
