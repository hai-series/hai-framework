/**
 * @h-ai/api-contract — 分页 Schema
 *
 * 提供通用分页查询参数与分页结果封装，供各领域 contract 扩展复用。
 * @module pagination-schemas
 */

import { z } from 'zod'

/**
 * 通用分页查询参数 Schema。
 *
 * 页码和页大小均为可选，由服务端提供合理默认值（page=1, pageSize=20）。
 * 支持字符串 coerce，适配 GET 请求 query string 场景。
 * @example
 * ```ts
 * import { PaginationQuerySchema } from '@h-ai/api-contract'
 *
 * const value = PaginationQuerySchema.parse({})
 * void value
 * ```
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

/**
 * 创建分页结果 Schema。
 *
 * 生成标准分页响应结构 `{ items, total, page, pageSize }`，
 * 与 `@h-ai/reldb` 的 `PageResult<T>` 保持对齐。
 *
 * @param itemSchema - 分页项的 Zod Schema
 * @returns 包含 items/total/page/pageSize 的对象 Schema
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * import { z } from 'zod'
 *
 * const page = apiContract.paginatedSchema(z.object({ id: z.string() }))
 *   .parse({ items: [{ id: 'order_1' }], total: 1, page: 1, pageSize: 20 })
 * void page
 * ```
 */
export function paginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  })
}
