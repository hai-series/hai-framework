/**
 * =============================================================================
 * AI Assistant API — 使用 @h-ai/ai 提供智能问答
 * =============================================================================
 */

import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const ChatSchema = z.object({
  message: z.string().min(1).max(1000),
})

const SYSTEM_PROMPT = `You are a helpful assistant for a technology company website. 
Answer questions about the company's services, solutions, and general inquiries. 
Keep responses concise, professional, and in the same language as the user's question.
If you don't know something specific about the company, provide a helpful general response.`

export const POST = kit.handler(async ({ request }) => {
  const { message } = await kit.validate.formOrFail(request, ChatSchema)

  if (!ai.isInitialized) {
    return kit.response.ok({
      reply: '智能助手暂未开启，请通过联系表单与我们取得联系。',
    })
  }

  const result = await ai.llm.chat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message },
    ],
  })

  if (!result.success) {
    core.logger.error('AI chat failed', { error: result.error.message })
    return kit.response.ok({
      reply: '抱歉，智能助手暂时无法回复，请稍后再试或通过联系表单联系我们。',
    })
  }

  return kit.response.ok({ reply: result.data.choices[0]?.message.content ?? '' })
})
