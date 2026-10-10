/**
 * 登出 API
 */
import type { RequestHandler } from './$types'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = kit.handler(async ({ cookies, locals }) => {
  const token = cookies.get('session_token')
  if (token) {
    const result = await iam.auth.logout(token)
    if (!result.success)
      return kit.response.fromError(result.error, locals.requestId)
  }
  cookies.delete('session_token', { path: '/' })
  return kit.response.ok({ authenticated: false }, locals.requestId)
})
