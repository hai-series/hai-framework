/**
 * =============================================================================
 * @hai/cache - 缓存模块
 * =============================================================================
 * 提供统一的缓存访问接口
 *
 * 支持：
 * - Redis（ioredis）
 *
 * @example
 * ```ts
 * import { cache } from '@hai/cache'
 *
 * // Redis
 * await cache.init({ type: 'redis', host: 'localhost', port: 6379 })
 *
 * // 基础操作
 * await cache.set('user:1', { name: '张三' }, { ex: 3600 })
 * const user = await cache.get<{ name: string }>('user:1')
 *
 * // Hash 操作
 * await cache.hash.hset('session', { userId: 1, token: 'abc' })
 *
 * // List 操作
 * await cache.list.lpush('queue', { task: 'send_email' })
 *
 * // Set 操作
 * await cache.set_.sadd('tags', 'redis', 'cache')
 *
 * // SortedSet 操作
 * await cache.zset.zadd('rank', { score: 100, member: 'player1' })
 *
 * // 关闭
 * await cache.close()
 * ```
 *
 * @packageDocumentation
 * =============================================================================
 */

import { core } from '@hai/core'
import { CacheConfigSchema } from './cache-config.js'

// =============================================================================
// 导出配置和类型
// =============================================================================

export * from './cache-config.js'

export * from './cache-main.js'

// =============================================================================
// 导出主入口
// =============================================================================

export * from './cache-types.js'

// =============================================================================
// 自动注册 Schema 到 @hai/core
// =============================================================================

// 注册 cache 模块的配置 Schema
core.registerBuiltinSchema('cache', CacheConfigSchema)
