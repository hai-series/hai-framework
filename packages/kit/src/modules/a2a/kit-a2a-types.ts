/**
 * @h-ai/kit — A2A 类型定义
 *
 * Kit A2A 路由处理器相关类型
 * @module kit-a2a-types
 */

import type { RequestEvent } from '@sveltejs/kit'

/** A2A API Key 配置 */
export interface KitA2AApiKeyConfig {
  /** API Key 的传递位置 */
  in: 'header' | 'query'
  /** 请求头或 query 参数名 */
  name: string
}

/** A2A 路由处理器配置 */
export interface KitA2AHandlerConfig {
  /**
   * 可选的认证回调
   *
   * 验证入站 A2A 请求的身份。
   *
   * - 返回认证上下文：鉴权成功
   * - 返回 `undefined`：当前请求无需执行 A2A 鉴权，继续匿名处理
   * - 返回 `null`：鉴权失败，返回 401
   * - 抛出异常：鉴权异常，返回 403
   *
   * - `'apiKey'`：自动使用 IAM API Key 认证
   *   可通过 `apiKey` 字段自定义读取位置与参数名。
   * - 函数：自定义认证回调
   */
  authenticate?: 'apiKey' | ((event: RequestEvent) => Promise<Record<string, unknown> | null | undefined>)

  /**
   * 当 `authenticate: 'apiKey'` 时使用的 API Key 读取配置
   *
   * 未配置时默认 `{ in: 'header', name: 'x-api-key' }`
   */
  apiKey?: KitA2AApiKeyConfig
}
