/**
 * =============================================================================
 * @h-ai/kit - Crypto 类型定义
 * =============================================================================
 * Crypto 模块集成相关类型
 * =============================================================================
 */

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

// =============================================================================
// 传输加密（Transport Encryption）
// =============================================================================

/** SM2 密钥对 */
export interface TransportKeyPair {
  /** 公钥（十六进制） */
  publicKey: string
  /** 私钥（十六进制） */
  privateKey: string
}

/**
 * 传输加密服务接口（解耦 @h-ai/crypto）
 *
 * 只声明传输加密所需的非对称 + 对称加密子集，由使用者注入实际实现。
 */
export interface TransportCryptoServiceLike {
  asymmetric: {
    /** 生成非对称密钥对 */
    generateKeyPair: () => { success: boolean, data?: TransportKeyPair, error?: { code: number, message: string } }
    /** 非对称加密 */
    encrypt: (data: string, publicKey: string) => { success: boolean, data?: string, error?: { code: number, message: string } }
    /** 非对称解密 */
    decrypt: (ciphertext: string, privateKey: string) => { success: boolean, data?: string, error?: { code: number, message: string } }
  }
  symmetric: {
    /** 生成随机对称密钥 */
    generateKey: () => string
    /** 带 IV 加密（CBC 模式，自动生成 IV） */
    encryptWithIV: (data: string, key: string) => { success: boolean, data?: { ciphertext: string, iv: string }, error?: { code: number, message: string } }
    /** 带 IV 解密（CBC 模式） */
    decryptWithIV: (ciphertext: string, key: string, iv: string) => { success: boolean, data?: string, error?: { code: number, message: string } }
  }
}

/**
 * 传输加密配置
 */
export interface TransportEncryptionConfig {
  /** 是否启用传输加密（默认 false） */
  enabled: boolean
  /** 传输加密服务实例 */
  crypto: TransportCryptoServiceLike
  /** 密钥交换端点路径（默认 '/api/kit/key-exchange'） */
  keyExchangePath?: string
  /** 排除路径（不加密），支持精确匹配和前缀匹配 */
  excludePaths?: string[]
  /** 是否加密响应（默认 true） */
  encryptResponse?: boolean
}

/**
 * 加密载荷（前后端传输的统一格式）
 */
export interface EncryptedPayload {
  /** SM2 加密后的对称密钥（hex） */
  encryptedKey: string
  /** SM4 加密后的密文（hex） */
  ciphertext: string
  /** SM4 CBC 模式的 IV（hex） */
  iv: string
}

/**
 * 传输加密管理器接口
 */
export interface TransportEncryptionManager {
  /** 获取服务端公钥 */
  getServerPublicKey: () => string
  /** 注册客户端公钥，返回分配的 clientId */
  registerClientKey: (clientPublicKey: string) => string
  /** 获取已注册的客户端公钥 */
  getClientPublicKey: (clientId: string) => string | undefined
  /** 加密响应数据（使用指定客户端的公钥） */
  encryptResponse: (clientId: string, data: string) => EncryptedPayload
  /** 解密请求数据（使用服务端私钥） */
  decryptRequest: (payload: EncryptedPayload) => string
}
