/**
 * 记忆提取端点：从一轮 user + assistant 对话中提取长期记忆。
 *
 * 与 `/api/chat` 解耦：客户端先展示对话回复，再后台调用本端点提取记忆，避免记忆提取的
 * 二次 LLM 调用阻塞对话响应。
 * @module routes/api/chat/remember/+server
 */

import { RememberRequestSchema } from '$lib/ai-lab-types.js'
import { rememberExchange } from '$lib/server/ai-lab.js'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request }) => {
  const input = await kit.validate.body(request, RememberRequestSchema)
  const result = await rememberExchange(input, request.signal)
  return result.success ? kit.response.ok(result.data) : kit.response.fromError(result.error)
})
