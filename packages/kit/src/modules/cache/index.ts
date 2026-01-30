/**
 * =============================================================================
 * @hai/kit - Cache 模块导出
 * =============================================================================
 * SvelteKit 与 @hai/cache 集成
 *
 * 包含：
 * - createCacheHandle - 创建缓存 Handle
 * - createCacheUtils - 创建缓存工具函数
 * =============================================================================
 */

// Handle
export { createCacheHandle, createCacheUtils } from './cache-handle.js'

// 类型
export type { CacheHandleConfig, CacheRouteConfig, CacheServiceLike } from './cache-types.js'
