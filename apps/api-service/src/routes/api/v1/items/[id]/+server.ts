/**
 * =============================================================================
 * Items API — 单个 Item 操作
 * =============================================================================
 */

import { cache } from '@h-ai/cache'
import { db } from '@h-ai/db'
import { kit } from '@h-ai/kit'
import { z } from 'zod'

const UpdateItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'archived']).optional(),
})

const CACHE_PREFIX = 'api:items'

/**
 * GET /api/v1/items/:id — 获取单个 item
 */
export const GET = kit.handler(async ({ params }) => {
  const { id } = params

  // 尝试缓存
  const cacheKey = `${CACHE_PREFIX}:${id}`
  const cached = await cache.kv.get<string>(cacheKey)
  if (cached.success && cached.data) {
    return kit.response.ok(JSON.parse(cached.data))
  }

  const result = await db.sql.get<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', [id])
  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }
  if (!result.data) {
    return kit.response.notFound('Item not found')
  }

  await cache.kv.set(cacheKey, JSON.stringify(result.data), { ex: 60 })
  return kit.response.ok(result.data)
})

/**
 * PUT /api/v1/items/:id — 更新 item
 */
export const PUT = kit.handler(async ({ params, request }) => {
  const { id } = params
  const updates = await kit.validate.formOrFail(request, UpdateItemSchema)

  const existing = await db.sql.get<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', [id])
  if (!existing.success) {
    return kit.response.internalError(existing.error.message)
  }
  if (!existing.data) {
    return kit.response.notFound('Item not found')
  }

  const now = new Date().toISOString()
  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (updates.name !== undefined) {
    sets.push('name = ?')
    values.push(updates.name)
  }
  if (updates.description !== undefined) {
    sets.push('description = ?')
    values.push(updates.description)
  }
  if (updates.status !== undefined) {
    sets.push('status = ?')
    values.push(updates.status)
  }

  values.push(id)
  await db.sql.execute(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`, values)

  // 清除缓存
  await cache.kv.del(`${CACHE_PREFIX}:${id}`)
  await cache.kv.del(`${CACHE_PREFIX}:list:1:20`)

  const updated = await db.sql.get<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', [id])
  if (!updated.success || !updated.data) {
    return kit.response.internalError('Failed to retrieve updated item')
  }

  return kit.response.ok(updated.data)
})

/**
 * DELETE /api/v1/items/:id — 删除 item
 */
export const DELETE = kit.handler(async ({ params }) => {
  const { id } = params

  const existing = await db.sql.get<Record<string, unknown>>('SELECT * FROM items WHERE id = ?', [id])
  if (!existing.success) {
    return kit.response.internalError(existing.error.message)
  }
  if (!existing.data) {
    return kit.response.notFound('Item not found')
  }

  await db.sql.execute('DELETE FROM items WHERE id = ?', [id])

  // 清除缓存
  await cache.kv.del(`${CACHE_PREFIX}:${id}`)
  await cache.kv.del(`${CACHE_PREFIX}:list:1:20`)

  return kit.response.ok({ id, deleted: true })
})
