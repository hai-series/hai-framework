/**
 * @h-ai/api-contract — 认证公共 Schema
 *
 * Bearer Token 和 Refresh Token 请求体的基础 Schema，
 * 供 IAM 领域的登录 / 刷新 / 登出 procedure 复用。
 * @module auth-schemas
 */

import { z } from 'zod'

/** Bearer Token 输入 Schema。用于需要随请求体传入 access token 的场景（如显式登出）。 */
export const BearerTokenInputSchema = z.object({
  accessToken: z.string().min(1),
})

/** Refresh Token 请求体 Schema。用于换取新 Token 对。 */
export const RefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1),
})
