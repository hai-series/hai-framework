/**
 * @h-ai/kit — Crypto 类型定义
 *
 * Crypto 模块集成相关类型
 * @module kit-crypto-types
 */

import type { CryptoFunctions, TransportKeyStore, TransportServerKeyRing } from '@h-ai/crypto'
import type { RequestEvent } from '@sveltejs/kit'

/**
 * 辅助函数所需的异步加密依赖结构；实际服务需由应用适配，不等同于 @h-ai/crypto 的公开接口。
 * @example
 * ```ts
 * import type { CryptoServiceLike } from '@h-ai/kit'
 *
 * async function verify(crypto: CryptoServiceLike, body: string, secret: string, signature: string) {
 *   const result = await crypto.hmac.verify(body, secret, signature, 'sha256')
 *   return result.success && result.data === true
 * }
 * ```
 */
export interface CryptoServiceLike {
  hmac: {
    sign: (
      data: string,
      key: string,
      algorithm?: string,
    ) => Promise<{
      success: boolean
      data?: string
      error?: { code: number, message: string }
    }>
    verify: (
      data: string,
      key: string,
      signature: string,
      algorithm?: string,
    ) => Promise<{
      success: boolean
      data?: boolean
      error?: { code: number, message: string }
    }>
  }

  hash: {
    digest: (
      data: string,
      algorithm?: string,
    ) => Promise<{
      success: boolean
      data?: string
      error?: { code: number, message: string }
    }>
    timingSafeEqual: (
      a: string,
      b: string,
    ) => Promise<{
      success: boolean
      data?: boolean
      error?: { code: number, message: string }
    }>
  }

  aes: {
    encrypt: (
      data: string,
      key: string,
    ) => Promise<{
      success: boolean
      data?: string
      error?: { code: number, message: string }
    }>
    decrypt: (
      data: string,
      key: string,
    ) => Promise<{
      success: boolean
      data?: string
      error?: { code: number, message: string }
    }>
  }

  random: {
    bytes: (length: number) => Promise<{
      success: boolean
      data?: Uint8Array
      error?: { code: number, message: string }
    }>
  }
}

/**
 * Webhook 验证配置
 * @example
 * ```ts
 * import type { WebhookVerifyConfig } from '@h-ai/kit'
 *
 * function signatureHeader(config: WebhookVerifyConfig) { return config.event.request.headers.get(config.signatureHeader ?? 'X-Signature') }
 * ```
 */
export interface WebhookVerifyConfig {
  /** Crypto 服务实例 */
  crypto: CryptoServiceLike
  /** 请求事件 */
  event: RequestEvent
  /** 签名密钥 */
  secretKey: string
  /** 签名头名称 */
  signatureHeader?: string
  /** 算法 */
  algorithm?: 'sha256' | 'sha512'
  /** 编码 */
  encoding?: 'hex' | 'base64'
}

/**
 * CSRF 配置
 * @example
 * ```ts
 * import type { CryptoCsrfConfig } from '@h-ai/kit'
 *
 * function tokenSize(config: CryptoCsrfConfig) { return config.tokenLength ?? 32 }
 * ```
 */
export interface CryptoCsrfConfig {
  /** Crypto 服务实例 */
  crypto: CryptoServiceLike
  /** Cookie 名称 */
  cookieName?: string
  /** Header 名称 */
  headerName?: string
  /** 表单字段名称 */
  formFieldName?: string
  /** Token 长度 */
  tokenLength?: number
  /** Cookie 选项 */
  cookieOptions?: {
    path?: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    maxAge?: number
  }
}

/**
 * 加密 Cookie 配置
 * @example
 * ```ts
 * import type { EncryptedCookieConfig } from '@h-ai/kit'
 *
 * function assertKey(config: EncryptedCookieConfig) {
 *   if (!config.encryptionKey) throw new Error('Encryption key required')
 * }
 * ```
 */
export interface EncryptedCookieConfig {
  /** Crypto 服务实例 */
  crypto: CryptoServiceLike
  /** 加密密钥 */
  encryptionKey: string
  /** Cookie 选项 */
  cookieOptions?: {
    path?: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    maxAge?: number
  }
}

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
  /** 双向业务明文 UTF-8 字节上限；默认 1 MiB，整数范围 1 KiB～64 MiB。 */
  maxPlaintextBytes?: number
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
