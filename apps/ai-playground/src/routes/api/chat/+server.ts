/**
 * 对话端点：校验请求后调用 LLM 返回回复（记忆提取见 remember 子端点）。
 * @module routes/api/chat/+server
 */

import { ChatRequestSchema } from '$lib/ai-lab-types.js'
import { chatWithMemory } from '$lib/server/ai-lab.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request }) => {
  const input = await kit.validate.body(request, ChatRequestSchema)
  const result = await chatWithMemory(input)
  return result.success ? kit.response.ok(result.data) : kit.response.fromError(result.error)
})
