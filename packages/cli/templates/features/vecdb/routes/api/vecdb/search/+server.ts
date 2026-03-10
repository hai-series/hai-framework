/**
 * VecDB Search API — vecdb 功能示例
 */
import type { RequestEvent } from '@sveltejs/kit'
import { kit } from '@h-ai/kit'
import { vecdb } from '@h-ai/vecdb'

const DEMO_COLLECTION = 'documents'

export async function POST({ request, locals }: RequestEvent) {
  const body = await request.json().catch(() => null) as { vector?: number[] } | null
  const vector = body?.vector

  if (!Array.isArray(vector) || vector.length === 0) {
    return kit.response.badRequest('vector is required')
  }

  const collectionExists = await vecdb.collection.exists(DEMO_COLLECTION)
  if (!collectionExists.success) {
    return kit.response.internalError(collectionExists.error.message)
  }

  if (!collectionExists.data) {
    return kit.response.badRequest('vecdb demo collection not initialized')
  }

  const result = await vecdb.vector.search(DEMO_COLLECTION, vector, { topK: 5 })
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  return kit.response.ok({
    topK: 5,
    results: result.data,
  }, locals.requestId)
}
