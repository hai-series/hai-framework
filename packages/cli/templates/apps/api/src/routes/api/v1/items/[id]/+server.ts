/**
 * Items API — 单项操作
 */
import type { RequestHandler } from './$types'
import { kit } from '@h-ai/kit'

/**
 * GET /api/v1/items/:id — 获取详情
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const { id } = params
  return kit.response.ok({ id, name: 'Example Item' }, locals.requestId)
}

/**
 * PUT /api/v1/items/:id — 更新
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const { id } = params
  const body = await request.json()
  return kit.response.ok({ id, ...body, updatedAt: new Date().toISOString() }, locals.requestId)
}

/**
 * DELETE /api/v1/items/:id — 删除
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const { id } = params
  return kit.response.ok({ id, deleted: true }, locals.requestId)
}
