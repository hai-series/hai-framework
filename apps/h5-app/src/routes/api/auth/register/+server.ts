/**
 * =============================================================================
 * H5 App - 注册 API
 * =============================================================================
 */

import { IamErrorCode, IamErrorHttpStatus } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const RegisterSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6).max(128),
})

export const POST = kit.handler(async ({ request, cookies }) => {
  const { username, email, password } = await kit.validate.body(request, RegisterSchema)

  const result = await kit.auth.registerAndLogin(cookies, { username, email, password })
  if (!result.success) {
    if (result.error.code === IamErrorCode.USER_ALREADY_EXISTS) {
      return kit.response.conflict('Username or email already taken')
    }
    return kit.response.fromError(result.error, IamErrorHttpStatus)
  }

  const { user } = result.data

  return kit.response.ok({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    },
  })
})
