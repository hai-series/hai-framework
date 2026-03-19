/**
 * AI Chat API — ai 功能示例
 */
import type { RequestHandler } from './$types'
import { ai } from '@h-ai/ai'
import { kit } from '@h-ai/kit'

export const POST: RequestHandler = async ({ request, locals }) => {
  const { message } = await request.json()

  if (!message) {
    return kit.response.badRequest('message is required')
  }

  const result = await ai.llm.ask(message, {
    systemPrompt: 'You are a helpful assistant.',
  })

  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.ok({
    reply: result.data,
  }, locals.requestId)
}
