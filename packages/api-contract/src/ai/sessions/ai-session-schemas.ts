/** 会话列表的输入及结果 schema。 */

import { z } from 'zod'

/**
 * 会话信息 Schema。
 * @example
 * ```ts
 * import { AiSessionInfoSchema } from '@h-ai/api-contract'
 *
 * const value = AiSessionInfoSchema.parse({
 *   objectId: 'example',
 *   sessionId: 'example',
 *   createdAt: 0,
 *   updatedAt: 0
 * })
 * void value
 * ```
 */
export const AiSessionInfoSchema = z.object({
  objectId: z.string(),
  sessionId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * 会话列表入参 Schema。
 * @example
 * ```ts
 * import { AiSessionListInputSchema } from '@h-ai/api-contract'
 *
 * const value = AiSessionListInputSchema.parse({})
 * void value
 * ```
 */
export const AiSessionListInputSchema = z.object({
  /** 省略时由服务端绑定认证用户，不能据客户端参数推断身份。 */
  objectId: z.string().min(1).optional(),
})

/**
 * 会话列表业务数据 Schema。
 * @example
 * ```ts
 * import { AiSessionListDataSchema } from '@h-ai/api-contract'
 *
 * const value = AiSessionListDataSchema.parse({
 *   items: [
 *     {
 *       objectId: 'example',
 *       sessionId: 'example',
 *       createdAt: 0,
 *       updatedAt: 0
 *     }
 *   ]
 * })
 * void value
 * ```
 */
export const AiSessionListDataSchema = z.object({
  items: z.array(AiSessionInfoSchema),
})

/**
 * 按主体列出会话的分页请求。
 * @example
 * ```ts
 * import type { AiSessionListInput } from '@h-ai/api-contract'
 * import { AiSessionListInputSchema } from '@h-ai/api-contract'
 *
 * const value: AiSessionListInput = AiSessionListInputSchema.parse({})
 * void value
 * ```
 */
export type AiSessionListInput = z.infer<typeof AiSessionListInputSchema>
