/**
 * @h-ai/kit — Crypto 类型定义
 *
 * Crypto 模块集成相关类型
 * @module kit-crypto-types
 */

import type { CryptoFunctions, TransportKeyStore } from '@h-ai/crypto'
import type { RequestEvent } from '@sveltejs/kit'

/**
 * Crypto 服务接口（简化版，与 @h-ai/crypto 兼容）
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
 */
export interface TransportEncryptionConfig {
  /** 是否启用传输加密（默认 false） */
  enabled: boolean
  /** @h-ai/crypto 服务实例 */
  crypto: CryptoFunctions
  /** 密钥交换端点路径（默认 `/api/_hai/key-exchange`） */
  keyExchangePath?: string
  /** 排除路径（不加密），支持精确匹配和前缀匹配 */
  excludePaths?: string[]
  /** 是否加密响应（默认 true） */
  encryptResponse?: boolean
  /** 服务端可缓存的客户端公钥数量上限（默认 10000） */
  maxClients?: number
  /** 共享客户端公钥存储（如 Redis / reldb）；未传时默认使用进程内内存实现。 */
  keyStore?: TransportKeyStore
  /**
   * 是否强制要求传输加密（默认 true）
   *
   * - `true`：非排除路径上缺少 X-Client-Id 请求头时返回 400，防止绕过加密。
   * - `false`：缺少 X-Client-Id 时透传明文，仅适用于渐进式迁移场景，不建议生产启用。
   */
  requireEncryption?: boolean
}
