/**
 * 登出 API
 */
import type { RequestHandler } from './$types'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = async ({ cookies, locals }) => {
  const token = cookies.get('session_token')
  if (token) {
    await iam.auth.logout(token)
  }
  cookies.delete('session_token', { path: '/' })
  return kit.response.ok({ message: 'Logout successful' }, locals.requestId)
}
