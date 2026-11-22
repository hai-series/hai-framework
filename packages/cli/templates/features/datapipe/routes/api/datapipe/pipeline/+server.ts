/**
 * DataPipe Pipeline API — datapipe 功能示例
 */
import type { RequestEvent } from '@sveltejs/kit'
import { core } from '@h-ai/core'
import { datapipe } from '@h-ai/datapipe'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const PipelineInputSchema = z.object({
  content: z.string().trim().min(1),
})

export async function POST({ request, locals }: RequestEvent) {
  const parsed = PipelineInputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return kit.response.badRequest(core.i18n.coreM('core_validationRequired', {
      params: { field: 'content' },
    }), locals.requestId)
  }

  const result = await datapipe.pipeline()
    .clean({ removeHtml: true, removeUrls: false, normalizeWhitespace: true })
    .chunk({ mode: 'paragraph', maxSize: 500, overlap: 50 })
    .run(parsed.data.content)
  if (!result.success) {
    return kit.response.fromError(result.error, locals.requestId)
  }

  const { text, chunks } = result.data

  return kit.response.ok({
    cleaned: text,
    chunkCount: chunks.length,
    chunks: chunks.slice(0, 5),
  }, locals.requestId)
}
