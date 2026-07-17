/**
 * 流式对话端点：以 NDJSON 持续返回当前完整回复，首个 token 到达即可显示。
 * @module routes/api/chat/stream/+server
 */

import { ChatRequestSchema } from '$lib/ai-lab-types.js'
import { streamChatWithMemory } from '$lib/server/ai-lab.js'
import { ai } from '@h-ai/ai'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'

export const POST = kit.handler(async ({ request }) => {
  const input = await kit.validate.body(request, ChatRequestSchema)
  const abortController = new AbortController()

  const result = await streamChatWithMemory(input, abortController.signal)
  if (!result.success)
    return kit.response.fromError(result.error)

  const encoder = new TextEncoder()
  const processor = ai.stream.createProcessor()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.data) {
          const delta = processor.process(chunk)
          if (typeof delta?.content === 'string' && delta.content.length > 0) {
            controller.enqueue(encoder.encode(`${JSON.stringify({ text: processor.getResult().content })}\n`))
          }
        }
        controller.enqueue(encoder.encode(`${JSON.stringify({ text: processor.getResult().content, final: true })}\n`))
      }
      catch (error) {
        if (!abortController.signal.aborted) {
          core.logger.warn('LLM chat stream failed', { error: error instanceof Error ? error.message : String(error) })
          controller.enqueue(encoder.encode(`${JSON.stringify({ error: true })}\n`))
        }
      }
      finally {
        controller.close()
      }
    },
    cancel() {
      abortController.abort()
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
