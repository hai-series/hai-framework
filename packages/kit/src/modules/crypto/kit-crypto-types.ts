/**
 * @h-ai/kit — 传输加密类型定义
 *
 * 仅复用 @h-ai/crypto 的真实公开能力。
 * @module kit-crypto-types
 */

import type { CryptoFunctions, TransportKeyStore, TransportServerKeyRing } from '@h-ai/crypto'
// ─── 传输加密（Transport Encryption） ───

export type {
  EncryptedPayload,
  TransportEncryptionManager,
  TransportKeyPair,
} from '@h-ai/crypto'

/**
 * 传输加密配置。
 *
 * kit 不再维护本地加解密实现；服务端管理器由 `crypto.transport.createServer()` 创建，
 * 协议常量与载荷类型统一来自 `@h-ai/crypto`。
 * @example
 * ```ts
 * import type { TransportEncryptionConfig } from '@h-ai/kit'
 *
 * function publicPaths(config: TransportEncryptionConfig) { return config.excludePaths ?? [] }
 * ```
 */
export interface TransportEncryptionConfig {
  /** 宿主构建挂载目录，默认空字符串；仅作用于 API/data 保护范围。 */
  basePath?: string
  /** 双向业务明文 UTF-8 字节上限；默认 1 MiB，整数范围 1 KiB～64 MiB。 */
  maxPlaintextBytes?: number
  /** 请求时间允许领先服务器的秒数，默认 30，整数范围 0～300。 */
  maxFutureSkewSeconds?: number
  /** 请求从签发起的有效秒数，默认 300，整数范围 1～600。 */
  maxRequestAgeSeconds?: number
  /** 路由明文容量；* 匹配一个完整路径段。 */
  routePlaintextBytes?: Readonly<Record<string, number>>
  /** 受管服务端密钥环，仅从服务端 Secret 注入，不放公开 kit 配置。 */
  serverKeyRing: TransportServerKeyRing
  /** 是否启用传输加密（默认 false） */
  enabled: boolean
  /** @h-ai/crypto 服务实例 */
  crypto: CryptoFunctions
  /** 密钥交换端点路径（默认 `/api/_hai/key-exchange`） */
  keyExchangePath?: string
  /** 排除路径（不加密），支持精确匹配和前缀匹配 */
  excludePaths?: readonly string[]
  /** 显式客户端公钥存储；生产使用共享 Redis/reldb，内存仅供开发/测试。 */
  keyStore: TransportKeyStore
}
