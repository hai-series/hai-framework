/** 记忆的查询输入及结果 schema。 */

import { z } from 'zod'

/**
 * 记忆类型 Schema。
 * @example
 * ```ts
 * import { AiMemoryTypeSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryTypeSchema.parse('fact')
 * void value
 * ```
 */
export const AiMemoryTypeSchema = z.enum([
  'fact',
  'preference',
  'event',
  'entity',
  'instruction',
])

/**
 * 记忆条目 Schema。
 * @example
 * ```ts
 * import { AiMemoryEntrySchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryEntrySchema.parse({
 *   id: 'example-1',
 *   content: 'Hello',
 *   type: 'fact',
 *   importance: 0,
 *   createdAt: 0,
 *   lastAccessedAt: 0,
 *   accessCount: 0
 * })
 * void value
 * ```
 */
export const AiMemoryEntrySchema = z.object({
  id: z.string(),
  content: z.string(),
  type: AiMemoryTypeSchema,
  importance: z.number(),
  objectId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
  lastAccessedAt: z.number(),
  accessCount: z.number(),
})

/**
 * 记忆检索入参 Schema。
 * @example
 * ```ts
 * import { AiMemoryRecallInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryRecallInputSchema.parse({
 *   query: 'example'
 * })
 * void value
 * ```
 */
export const AiMemoryRecallInputSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).optional(),
  types: z.array(AiMemoryTypeSchema).optional(),
  minImportance: z.number().min(0).max(1).optional(),
  objectId: z.string().min(1).optional(),
})

/**
 * 记忆检索业务数据 Schema。
 * @example
 * ```ts
 * import { AiMemoryRecallDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryRecallDataSchema.parse({
 *   items: [
 *     {
 *       id: 'example-1',
 *       content: 'Hello',
 *       type: 'fact',
 *       importance: 0,
 *       createdAt: 0,
 *       lastAccessedAt: 0,
 *       accessCount: 0
 *     }
 *   ]
 * })
 * void value
 * ```
 */
export const AiMemoryRecallDataSchema = z.object({
  items: z.array(AiMemoryEntrySchema),
})

/**
 * 记忆列表入参 Schema。
 * @example
 * ```ts
 * import { AiMemoryListInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryListInputSchema.parse({})
 * void value
 * ```
 */
export const AiMemoryListInputSchema = z.object({
  types: z.array(AiMemoryTypeSchema).optional(),
  objectId: z.string().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

/**
 * 记忆列表业务数据 Schema。
 * @example
 * ```ts
 * import { AiMemoryListDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiMemoryListDataSchema.parse({
 *   items: [
 *     {
 *       id: 'example-1',
 *       content: 'Hello',
 *       type: 'fact',
 *       importance: 0,
 *       createdAt: 0,
 *       lastAccessedAt: 0,
 *       accessCount: 0
 *     }
 *   ],
 *   total: 0
 * })
 * void value
 * ```
 */
export const AiMemoryListDataSchema = z.object({
  items: z.array(AiMemoryEntrySchema),
  total: z.number(),
})

/**
 * 按主体和条件检索记忆的请求。
 * @example
 * ```ts
 * import type { AiMemoryRecallInput } from '@h-ai/api-contract'
 * import { AiMemoryRecallInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiMemoryRecallInput = AiMemoryRecallInputSchema.parse({
 *   query: 'example'
 * })
 * void value
 * ```
 */
export type AiMemoryRecallInput = z.infer<typeof AiMemoryRecallInputSchema>
/**
 * 按主体查询记忆列表的分页请求。
 * @example
 * ```ts
 * import type { AiMemoryListInput } from '@h-ai/api-contract'
 * import { AiMemoryListInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiMemoryListInput = AiMemoryListInputSchema.parse({})
 * void value
 * ```
 */
export type AiMemoryListInput = z.infer<typeof AiMemoryListInputSchema>
