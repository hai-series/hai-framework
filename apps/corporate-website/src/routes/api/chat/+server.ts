import * as m from '$lib/paraglide/messages.js'
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

export const POST = kit.handler(async ({ request, locals }) => {
  const locale = locals.locale === 'en-US' ? 'en-US' : locals.locale === 'ja-JP' ? 'ja-JP' : 'zh-CN'
  const { message } = await kit.validate.body(request, ChatSchema)

  if (!ai.isInitialized) {
    return kit.response.ok({
      reply: m.api_chat_unavailable({}, { locale }),
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
      reply: m.api_chat_failed({}, { locale }),
    })
  }

  return kit.response.ok({ reply: result.data.choices[0]?.message.content ?? '' })
})
