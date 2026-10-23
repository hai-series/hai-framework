/** 内置 cache Provider 共享契约，不属于 package.exports 公共 API。 */
import type { HaiResult } from '@h-ai/core'
import type { CacheConfig } from '../cache-config.js'
import type { CacheCompositeOperations } from '../cache-types.js'

/**
 * 缓存 Provider 接口
 *
 * 由具体实现（memory / redis）提供；上层通过 cache-main 统一管理生命周期。
 * @internal
 * @example 模块内部上下文
 * ```ts
 * async function connectAndClose(provider: CacheProvider, config: CacheConfig) {
 *   const connected = await provider.connect(config)
 *   if (!connected.success) return connected
 *   try { return await provider.ping() } finally { await provider.close() }
 * }
 * ```
 */
export interface CacheProvider extends CacheCompositeOperations {
  /** Provider 名称（如 'memory' / 'redis'） */
  readonly name: string
  /** 连接缓存服务；config 已经过 Zod Schema 校验 */
  connect: (config: CacheConfig) => Promise<HaiResult<void>>
  /** 关闭连接并释放资源 */
  close: () => Promise<void>
  /** 是否处于已连接状态 */
  isConnected: () => boolean
}
