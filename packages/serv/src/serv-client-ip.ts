/**
 * 可信客户端地址解析。只信任运行时提供的对端地址与显式配置的代理。
 * @module serv-client-ip
 */
import { core } from '@h-ai/core'

/**
 * Hono runtime bindings 是 unknown，先收敛可信元数据的形状。
 *
 * @example
 * ```ts
 * // 模块内部上下文：示例复用当前声明所在模块的实际绑定。
 * const peer = readRemoteAddress({ remoteAddress: '192.0.2.10' })
 * const untrusted = readRemoteAddress({ 'x-forwarded-for': '192.0.2.20' })
 * ```
 */
export function readRemoteAddress(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object' || !('remoteAddress' in metadata) || typeof metadata.remoteAddress !== 'string')
    return undefined
  return core.access.normalizeClientIp(metadata.remoteAddress)
}
