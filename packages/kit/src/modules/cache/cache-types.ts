/**
 * =============================================================================
 * @h-ai/kit - Cache 类型定义
 * =============================================================================
 * Cache 模块集成相关类型
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'

/**
 * Cache 服务接口（简化版，与 @h-ai/cache 兼容）
 */
export interface CacheServiceLike {
  get: (key: string) => Promise<{
    success: boolean
    data?: unknown
    error?: { code: number, message: string }
  }>

  set: (key: string, value: unknown, ttl?: number) => Promise<{
    success: boolean
    error?: { code: number, message: string }
  }>

  delete: (key: string) => Promise<{
    success: boolean
    error?: { code: number, message: string }
  }>

  /** 可选：按模式删除（需要 Redis 等支持） */
  deleteByPattern?: (pattern: string) => Promise<{
    success: boolean
    error?: { code: number, message: string }
  }>
}

/**
 * 路由缓存配置
 */
export interface CacheRouteConfig {
  /** 缓存时间（秒） */
  ttl: number
  /** Stale-While-Revalidate 时间（秒） */
  staleWhileRevalidate?: number
  /** 自定义缓存键生成器 */
  keyGenerator?: (event: RequestEvent) => string
  /** 是否缓存带认证的请求 */
  cacheAuthenticated?: boolean
}

/**
 * Cache Handle 配置
 */
export interface CacheHandleConfig {
  /** Cache 服务实例 */
  cache: CacheServiceLike
  /** 路由缓存配置 */
  routes?: Record<string, CacheRouteConfig>
  /** 默认 TTL（秒），0 表示不缓存 */
  defaultTtl?: number
  /** 需要缓存的 HTTP 方法 */
  methods?: string[]
  /** Vary 头部 */
  varyHeaders?: string[]
  /** 绕过缓存的请求头 */
  bypassHeader?: string
}
