/**
 * =============================================================================
 * H5 App - 注册 API
 * =============================================================================
 */

import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const RegisterSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6).max(128),
})

export const POST = kit.handler(async ({ request, cookies }) => {
  const { username, email, password } = await kit.validate.formOrFail(request, RegisterSchema)

  const registerResult = await iam.user.register({ username, email, password })
  if (!registerResult.success) {
    if (registerResult.error.code === 5002 || registerResult.error.code === 5502) {
      return kit.response.conflict('Username or email already taken')
    }
    return kit.response.badRequest(registerResult.error.message)
  }

  const { user } = registerResult.data

  // 注册成功后自动登录获取 token
  const loginResult = await iam.auth.login({ identifier: username, password })
  if (!loginResult.success) {
    return kit.response.ok({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    })
  }

  kit.session.setCookie(cookies, loginResult.data.accessToken, {
    cookieName: 'h5_session',
    maxAge: iam.config?.session?.maxAge,
  })

  return kit.response.ok({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    },
  })
})
