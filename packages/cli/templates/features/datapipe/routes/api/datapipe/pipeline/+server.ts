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

  const cleanedResult = datapipe.clean(content, {
    removeHtml: true,
    removeUrls: false,
    normalizeWhitespace: true,
  })
  if (!cleanedResult.success) {
    return kit.response.internalError(cleanedResult.error.message)
  }

  const chunksResult = datapipe.chunk(cleanedResult.data, {
    mode: 'paragraph',
    maxSize: 500,
    overlap: 50,
  })
  if (!chunksResult.success) {
    return kit.response.internalError(chunksResult.error.message)
  }

  const chunks = chunksResult.data

  return kit.response.ok({
    cleaned: cleanedResult.data,
    chunkCount: chunks.length,
    chunks: chunks.slice(0, 5),
  }, locals.requestId)
}
