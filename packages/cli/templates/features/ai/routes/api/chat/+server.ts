/**
 * AI Chat API — ai 功能示例
 */
import type { RequestHandler } from './$types'
import { ai } from '@h-ai/ai'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const ChatInputSchema = z.object({ message: z.string().trim().min(1).max(4000) }).strict()

export const POST: RequestHandler = kit.handler(async ({ request, locals }) => {
  const { message } = await kit.validate.body(request, ChatInputSchema)

  const result = await ai.llm.ask(message, {
    systemPrompt: 'You are a helpful assistant.',
  })

  if (!result.success) {
    return kit.response.fromError(result.error, locals.requestId)
  }

  return kit.response.ok({
    reply: result.data,
  }, locals.requestId)
})
