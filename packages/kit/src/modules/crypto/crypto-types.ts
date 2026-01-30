/**
 * =============================================================================
 * @hai/kit - Crypto 类型定义
 * =============================================================================
 * Crypto 模块集成相关类型
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'

/**
 * Crypto 服务接口（简化版，与 @hai/crypto 兼容）
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
export interface CsrfConfig {
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
