/**
 * api-service — App 领域 Schema
 *
 * 本服务自身的 API（与 @h-ai/api-contract 中通用契约并列）。
 * - `app.info`：公开服务元信息（无需认证）。
 * - `app.echo`：认证后回显输入，返回调用者上下文（演示自定义鉴权端点）。
 *
 * 所有 Output 用 `haiResultSchema()` 封装，与全局 HaiResult 一致。
 */

import { apiContract } from '@h-ai/api-contract'
import { z } from 'zod'

// ─── app.info ────────────────────────────────────────────────────────────────

/** 服务元信息：公开端点，可被探针或客户端调用确认部署版本。 */
export const AppInfoOutputDataSchema = z.object({
  name: z.string(),
  version: z.string(),
  uptimeMs: z.number().int().nonnegative(),
  transportEnabled: z.boolean(),
})

export const AppInfoOutputSchema = apiContract.haiResultSchema(AppInfoOutputDataSchema)

// ─── app.echo ────────────────────────────────────────────────────────────────

/** 输入：单条文本消息（演示用，限制最大长度防 DoS）。 */
export const AppEchoInputSchema = z.object({
  message: z.string().min(1).max(2000),
})

/** 输出：原样回显 + 调用者快照（userId / requestId / 服务端时间戳）。 */
export const AppEchoOutputDataSchema = z.object({
  message: z.string(),
  userId: z.string(),
  requestId: z.string(),
  timestamp: z.string(),
})

export const AppEchoOutputSchema = apiContract.haiResultSchema(AppEchoOutputDataSchema)

export type AppInfoOutputData = z.infer<typeof AppInfoOutputDataSchema>
export type AppEchoInput = z.infer<typeof AppEchoInputSchema>
export type AppEchoOutputData = z.infer<typeof AppEchoOutputDataSchema>
