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
   * 验证入站 A2A 请求的身份。返回 null/undefined 表示匿名请求，
   * 抛出异常或返回 Response 表示认证失败。
   */
  authenticate?: (event: RequestEvent) => Promise<Record<string, unknown> | null | undefined>
}
