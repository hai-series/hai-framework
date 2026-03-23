/**
 * 登录 API
 */
import type { RequestHandler } from './$types'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const body = await request.json()
  const { identifier, password } = body

  if (!identifier || !password) {
    return kit.response.badRequest('identifier and password are required')
  }

  const result = await iam.auth.login({ identifier, password })
  if (!result.success) {
    return kit.response.unauthorized(result.error.message)
  }

  const { tokens } = result.data

  cookies.set('session_token', tokens.accessToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: tokens.expiresIn,
  })

  return kit.response.ok({ message: 'Login successful' }, locals.requestId)
}
