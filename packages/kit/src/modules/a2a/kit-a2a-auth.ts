/**
 * @h-ai/kit — A2A API Key 认证器
 *
 * 从请求头或 query 参数中提取 API Key，调用 IAM apiKey.verifyApiKey 验证。
 * @module kit-a2a-auth
 */

import type { RequestEvent } from '@sveltejs/kit'
import { iam } from '@h-ai/iam'

/** A2A API Key 认证器配置 */
export interface A2AApiKeyAuthConfig {
  /** API Key 的传递位置 */
  in: 'header' | 'query'
  /** 参数名 */
  name: string
}

/**
 * 创建 A2A API Key 认证函数
 *
 * 根据配置从请求头或 query 参数中提取 API Key，
 * 通过 `iam.apiKey.verifyApiKey()` 验证后返回调用方上下文。
 *
 * - 无 API Key → 返回 `null`（匿名请求）
 * - 验证失败 → 返回 `null`（拒绝）
 * - 验证成功 → 返回 `{ agentId, apiKeyId, scopes }`
 *
 * @param config - API Key 提取配置
 * @returns authenticate 函数，可直接赋给 HandleA2AConfig.authenticate
 */
export function createA2AApiKeyAuthenticator(
  config: A2AApiKeyAuthConfig,
): (event: RequestEvent) => Promise<Record<string, unknown> | null> {
  return async (event: RequestEvent) => {
    const rawKey = config.in === 'header'
      ? event.request.headers.get(config.name)
      : event.url.searchParams.get(config.name)

    if (!rawKey)
      return null

    const result = await iam.apiKey.verifyApiKey(rawKey)
    if (!result.success)
      return null

    return {
      agentId: result.data.userId,
      apiKeyId: result.data.id,
      scopes: result.data.scopes,
    }
  }
}
