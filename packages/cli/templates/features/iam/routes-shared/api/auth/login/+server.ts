import type { CoreConfig } from '@h-ai/core'
/**
 * 登录 API
 */
import type { RequestHandler } from './$types'
import { core } from '@h-ai/core'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const LoginInputSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
}).strict()

export const POST: RequestHandler = kit.handler(async ({ request, cookies, locals }) => {
  const { identifier, password } = await kit.validate.body(request, LoginInputSchema)

  const result = await iam.auth.login({ identifier, password })
  if (!result.success) {
    return kit.response.fromError(result.error, locals.requestId)
  }

  const { tokens } = result.data
  const config = core.config.getOrThrow<CoreConfig>('core')

  cookies.set('session_token', tokens.accessToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production' || config.env === 'staging',
    maxAge: tokens.expiresIn,
  })

  return kit.response.ok({ authenticated: true }, locals.requestId)
})
