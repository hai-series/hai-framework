/**
 * 登出 API
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = async ({ cookies, locals }) => {
  cookies.delete('session_token', { path: '/' })
  return kit.response.ok({ message: 'Logout successful' }, locals.requestId)
}
