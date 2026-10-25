/**
 * @h-ai/api-contract — HaiResult Schema
 *
 * 提供与 `@h-ai/core` HaiResult<T> 结构一致的 Zod Schema 工厂，
 * 用于 oRPC contract 的 output 定义和客户端响应校验。
 * @module result-schemas
 */

import { z } from 'zod'

/**
 * HaiError 的跨端 JSON Schema。
 *
 * 仅描述公共错误字段，不暴露内部异常对象结构。
 * @example
 * ```ts
 * import { HaiErrorSchema } from '@h-ai/api-contract'
 *
 * const value = HaiErrorSchema.parse({
 *   code: 'app:orders:001',
 *   message: 'Order not found',
 *   httpStatus: 404
 * })
 * void value
 * ```
 */
export const HaiErrorSchema = z.object({
  code: z.union([z.string(), z.number()]),
  message: z.string(),
  traceId: z.string().max(128).optional(),
  httpStatus: z.number().optional(),
  system: z.string().optional(),
  module: z.string().optional(),
  cause: z.unknown().optional(),
  suggestion: z.string().optional(),
  ext: z.record(z.string(), z.unknown()).optional(),
})

/**
 * 创建与 @h-ai/core HaiResult<T> 一致的响应 Schema。
 *
 * @param dataSchema - 成功分支 data 字段 Schema
 * @returns HaiResult<T> 的 Zod Schema
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * import { z } from 'zod'
 *
 * const result = apiContract.haiResultSchema(z.object({ id: z.string() }))
 *   .parse({ success: true, data: { id: 'order_1' } })
 * if (result.success) void result.data.id
 * ```
 */
export function haiResultSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: dataSchema,
    }),
    z.object({
      success: z.literal(false),
      error: HaiErrorSchema,
    }),
  ])
}

/**
 * 无内容成功响应 Schema。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 *
 * const result = apiContract.voidResultSchema.parse({ success: true, data: undefined })
 * if (!result.success) throw new Error(result.error.message)
 * ```
 */
export const HaiVoidResultSchema = haiResultSchema(z.void())
