/**
 * 注册 API
 */
import type { RequestHandler } from './$types'
import { iam } from '@h-ai/iam'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json()
  const { username, email, password, confirmPassword } = body

  if (!username || !password) {
    return kit.response.badRequest('Username and password are required')
  }

  if (password !== confirmPassword) {
    return kit.response.badRequest('Passwords do not match')
  }

  const result = await iam.user.register({ username, email, password })
  if (!result.success) {
    return kit.response.badRequest(result.error.message)
  }

  return kit.response.ok({ message: 'Registration successful' }, locals.requestId)
}
