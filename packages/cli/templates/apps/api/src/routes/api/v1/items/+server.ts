/**
 * Items API — 列表与创建
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'

/**
 * GET /api/v1/items — 获取列表
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Number(url.searchParams.get('pageSize') || '20')

  return kit.response.ok({
    items: [],
    total: 0,
    page,
    pageSize,
  }, locals.requestId)
}

/**
 * POST /api/v1/items — 创建
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json()

  if (!body.name) {
    return kit.response.badRequest('name is required')
  }

  return kit.response.ok({
    id: '1',
    ...body,
    createdAt: new Date().toISOString(),
  }, locals.requestId)
}
