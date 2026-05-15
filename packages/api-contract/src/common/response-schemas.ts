/**
 * @h-ai/api-contract — 通用响应 Schema
 *
 * 跨领域共用的基础请求 / 响应结构，如 ID 路径参数。
 * @module response-schemas
 */

import { z } from 'zod'

/** 通用 ID 路径参数 Schema。用于 `GET /resource/{id}` 等 RESTful 路由的输入校验。 */
export const IdParamSchema = z.object({
  id: z.string().min(1),
})
