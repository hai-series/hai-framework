/**
 * @h-ai/kit — A2A 类型定义
 *
 * Kit A2A 路由处理器相关类型
 * @module kit-a2a-types
 */

import type { RequestEvent } from '@sveltejs/kit'

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
   * - 函数：自定义认证回调
   */
  authenticate?: 'apiKey' | ((event: RequestEvent) => Promise<Record<string, unknown> | null | undefined>)
}
