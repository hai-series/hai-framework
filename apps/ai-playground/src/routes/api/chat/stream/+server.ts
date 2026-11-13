/**
 * 流式对话端点：以 NDJSON 发送新增文本，首个 token 到达即可显示。
 * @module routes/api/chat/stream/+server
 */

import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { ChatRequestSchema } from '#lib/ai-lab-types.js'
import { streamChatWithMemory } from '#lib/server/ai-lab.js'
import { scopeProfile } from '#lib/server/browser-scope.js'

export const POST = kit.handler(async ({ request, locals }) => {
  const input = await kit.validate.body(request, ChatRequestSchema)
  const abortController = new AbortController()
  const signal = AbortSignal.any([request.signal, abortController.signal])

  const result = await streamChatWithMemory({
    ...input,
    profileId: scopeProfile(locals.playgroundOwner, input.profileId),
  }, signal)
  if (!result.success)
    return kit.response.fromError(result.error)

  const encoder = new TextEncoder()
  const processor = ai.stream.createProcessor()
  const iterator = result.data[Symbol.asyncIterator]()
  const encode = (event: object) => encoder.encode(`${JSON.stringify(event)}\n`)
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!signal.aborted) {
          const { value, done } = await iterator.next()
          if (signal.aborted)
            break
          if (done) {
            controller.enqueue(encode({ final: true }))
            controller.close()
            return
          }
          const delta = processor.process(value)
          if (typeof delta?.content === 'string' && delta.content.length > 0) {
            controller.enqueue(encode({ delta: delta.content }))
            return
          }
        }
      }
      catch {
        if (!signal.aborted) {
          core.logger.warn('LLM chat stream failed', { requestId: locals.requestId })
          controller.enqueue(encode({ error: true }))
        }
      }
      if (!abortController.signal.aborted)
        controller.close()
      await iterator.return?.().catch(() => undefined)
    },
    async cancel() {
      abortController.abort()
      await iterator.return?.().catch(() => undefined)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
