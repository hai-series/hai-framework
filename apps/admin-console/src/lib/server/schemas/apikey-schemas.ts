/**
 * =============================================================================
 * Admin Console - API Key Zod 验证 Schema
 * =============================================================================
 */

import { IamListApiKeysInputSchema } from '@h-ai/api-contract'
import { PaginationQuerySchema } from '@h-ai/kit'
import { z } from 'zod'

/** 创建 API Key 请求 Schema */
export const CreateApiKeySchema = z.object({
  /** 所属用户 ID */
  userId: z.string().min(1),
  /** API Key 名称 */
  name: z.string().min(1).max(100),
  /** 有效期天数（0 表示永不过期） */
  expirationDays: z.number().int().min(0).optional(),
  /** 权限范围 */
  scopes: z.array(z.string()).optional(),
})

/** API Key 列表查询参数 Schema（扩展通用分页参数 page/pageSize/search） */
export const ListApiKeysQuerySchema = PaginationQuerySchema.extend({
  ...IamListApiKeysInputSchema.pick({ enabled: true, sortBy: true, sortDirection: true }).shape,
  /** 用户 ID（必须） */
  userId: z.string().min(1),
})
