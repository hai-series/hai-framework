/**
 * DataPipe Pipeline API — datapipe 功能示例
 */
import type { RequestEvent } from '@sveltejs/kit'
import { datapipe } from '@h-ai/datapipe'
import { kit } from '@h-ai/kit'

export async function POST({ request, locals }: RequestEvent) {
  const body = await request.json().catch(() => null) as { content?: string } | null
  const content = body?.content?.trim()

  if (!content) {
    return kit.response.badRequest('content is required')
  }

  const result = await datapipe.pipeline()
    .clean({ removeHtml: true, removeUrls: false, normalizeWhitespace: true })
    .chunk({ mode: 'paragraph', maxSize: 500, overlap: 50 })
    .run(content)
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  const { text, chunks } = result.data

  return kit.response.ok({
    cleaned: text,
    chunkCount: chunks.length,
    chunks: chunks.slice(0, 5),
  }, locals.requestId)
}
