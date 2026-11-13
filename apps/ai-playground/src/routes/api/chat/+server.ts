/**
 * 对话端点：校验请求后调用 LLM 返回回复（记忆提取见 remember 子端点）。
 * @module routes/api/chat/+server
 */

import { kit } from '@h-ai/kit'
import { ChatRequestSchema } from '#lib/ai-lab-types.js'
import { chatWithMemory } from '#lib/server/ai-lab.js'
import { scopeProfile } from '#lib/server/browser-scope.js'

export const POST = kit.handler(async ({ request, locals }) => {
  const input = await kit.validate.body(request, ChatRequestSchema)
  const result = await chatWithMemory({
    ...input,
    profileId: scopeProfile(locals.playgroundOwner, input.profileId),
  }, request.signal)
  return result.success
    ? kit.response.ok(result.data)
    : kit.response.fromError(result.error)
})
