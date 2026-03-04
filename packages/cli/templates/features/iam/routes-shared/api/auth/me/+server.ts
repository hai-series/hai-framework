/**
 * 当前用户信息
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.session) {
    return kit.response.unauthorized('Not authenticated')
  }
  return kit.response.ok({ user: locals.session }, locals.requestId)
}
