/**
 * =============================================================================
 * Items API — 列表与创建
 * =============================================================================
 */

import { cache } from '@h-ai/cache'
import { core } from '@h-ai/core'
import { kit } from '@h-ai/kit'
import { reldb } from '@h-ai/reldb'
import { z } from 'zod'

const CreateItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
})

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
})

const CACHE_KEY = 'api:items:list'

async function clearListCache(): Promise<void> {
  const keysResult = await cache.kv.keys(`${CACHE_KEY}:*`)
  if (!keysResult.success || keysResult.data.length === 0) {
    return
  }

  await cache.kv.del(...keysResult.data)
}

/**
 * GET /api/v1/items — 分页查询 items
 */
export const GET = kit.handler(async ({ url }) => {
  const { page, pageSize, search } = kit.validate.queryOrFail(url, ListQuerySchema)

  // 无搜索条件时尝试缓存
  if (!search) {
    const cacheKey = `${CACHE_KEY}:${page}:${pageSize}`
    const cached = await cache.kv.get<string>(cacheKey)
    if (cached.success && cached.data) {
      return kit.response.ok(JSON.parse(cached.data))
    }
  }

  let sql = 'SELECT * FROM items'
  const params: unknown[] = []

  if (search) {
    sql += ' WHERE name LIKE ?'
    params.push(`%${search}%`)
  }

  sql += ' ORDER BY created_at DESC'

  const result = await reldb.sql.queryPage<Record<string, unknown>>({
    sql,
    params,
    pagination: { page, pageSize },
  })

  if (!result.success) {
    return kit.response.internalError(result.error.message)
  }

  const data = { items: result.data.items, total: result.data.total, page, pageSize }

  // 缓存无搜索条件的结果
  if (!search) {
    const cacheKey = `${CACHE_KEY}:${page}:${pageSize}`
    await cache.kv.set(cacheKey, JSON.stringify(data), { ex: 30 })
  }

  return kit.response.ok(data)
})

/**
 * POST /api/v1/items — 创建 item
 */
export const POST = kit.handler(async ({ request }) => {
  const { name, description } = await kit.validate.formOrFail(request, CreateItemSchema)

  const id = core.id.generate()
  const now = new Date().toISOString()

  const execResult = await reldb.sql.execute(
    'INSERT INTO items (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, description, 'active', now, now],
  )

  if (!execResult.success) {
    return kit.response.internalError(execResult.error.message)
  }

  // 清除列表缓存
  await clearListCache()

  return kit.response.created({ id, name, description, status: 'active', createdAt: now, updatedAt: now })
})
