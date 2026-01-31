/**
 * =============================================================================
 * @hai/kit - Storage 类型定义
 * =============================================================================
 * Storage 模块集成相关类型
 * =============================================================================
 */

import type { RequestEvent } from '@sveltejs/kit'
import type { Buffer } from 'node:buffer'

/**
 * Storage 服务接口（简化版，与 @hai/storage 兼容）
 */
export interface StorageServiceLike {
  put: (
    bucket: string,
    key: string,
    data: Buffer | Uint8Array | string,
    options?: {
      contentType?: string
      metadata?: Record<string, string>
    },
  ) => Promise<{
    success: boolean
    data?: { url?: string, etag?: string }
    error?: { code: number, message: string }
  }>

  get: (
    bucket: string,
    key: string,
  ) => Promise<{
    success: boolean
    data?: { body: Buffer, contentType?: string, metadata?: Record<string, string> }
    error?: { code: number, message: string }
  }>

  delete: (
    bucket: string,
    key: string,
  ) => Promise<{
    success: boolean
    error?: { code: number, message: string }
  }>

  list: (
    bucket: string,
    options?: {
      prefix?: string
      maxKeys?: number
      continuationToken?: string
    },
  ) => Promise<{
    success: boolean
    data?: Array<{
      key: string
      size: number
      lastModified: Date
      etag?: string
    }>
    error?: { code: number, message: string }
  }>

  getPresignedUploadUrl: (
    bucket: string,
    key: string,
    options?: {
      contentType?: string
      expiresIn?: number
    },
  ) => Promise<{
    success: boolean
    data?: { url: string }
    error?: { code: number, message: string }
  }>

  getPresignedDownloadUrl: (
    bucket: string,
    key: string,
    options?: {
      expiresIn?: number
    },
  ) => Promise<{
    success: boolean
    data?: { url: string }
    error?: { code: number, message: string }
  }>
}

/**
 * Storage 端点配置
 */
export interface StorageEndpointConfig {
  /** Storage 服务实例 */
  storage: StorageServiceLike
  /** 存储桶名称 */
  bucket: string
  /** 允许的文件类型 */
  allowedTypes?: string[]
  /** 最大文件大小（字节） */
  maxFileSize?: number
  /** 是否需要认证 */
  requireAuth?: boolean
  /** 自定义 key 生成函数 */
  generateKey?: (filename: string, event: RequestEvent) => string
  /** 上传完成回调 */
  onUploadComplete?: (ctx: {
    result: StorageUploadResult
    file: File
    event: RequestEvent
  }) => void | Promise<void>
  /** 上传失败回调 */
  onUploadError?: (ctx: {
    error: { code: number, message: string }
    file: File
    event: RequestEvent
  }) => void | Promise<void>
}

/**
 * 上传结果
 */
export interface StorageUploadResult {
  /** 文件 key */
  key: string
  /** 存储桶 */
  bucket: string
  /** 文件大小 */
  size: number
  /** 内容类型 */
  contentType: string
  /** 访问 URL（如有） */
  url?: string
}

/**
 * 预签名结果
 */
export interface PresignResult {
  /** 预签名 URL */
  url: string
  /** 文件 key */
  key: string
  /** 存储桶 */
  bucket: string
  /** 过期时间 */
  expiresAt: string
}

/**
 * 文件列表项
 */
export interface StorageFileItem {
  /** 文件 key */
  key: string
  /** 文件大小 */
  size: number
  /** 最后修改时间 */
  lastModified: Date
  /** ETag */
  etag?: string
}
