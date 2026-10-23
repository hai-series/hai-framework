/**
 * @h-ai/storage — 存储配置 Schema
 * @module storage-config
 */

import { z } from 'zod'
import { storageM } from './storage-i18n.js'
import { StoragePresignExpiresInSchema } from './storage-schemas.js'

// ─── 配置 Schema ───

/**
 * 存储类型枚举
 *
 * 支持的存储类型：
 * - `s3` - S3 协议对象存储（兼容 AWS S3、MinIO、RustFS、阿里云 OSS 等）
 * - `local` - 本地文件存储（仅后端）
 * @example
 * ```ts
 * import { StorageTypeSchema } from '@h-ai/storage'
 *
 * const value = StorageTypeSchema.parse('local')
 * void value
 * ```
 */
export const StorageTypeSchema = z.enum(['s3', 'local'])

/**
 * 存储类型
 * @example
 * ```ts
 * import type { StorageType } from '@h-ai/storage'
 *
 * const value: StorageType = 's3'
 * void value
 * ```
 */
export type StorageType = z.infer<typeof StorageTypeSchema>

/**
 * StorageOperationLogConfigSchema 的数据约束与操作契约。
 * @example
 * ```ts
 * import { StorageOperationLogConfigSchema } from '@h-ai/storage'
 *
 * const value = StorageOperationLogConfigSchema.parse({ read: false, write: true, maxLength: 500, level: 'debug' })
 * void value
 * ```
 */
export const StorageOperationLogConfigSchema = z.object({
  read: z.boolean().default(false),
  write: z.boolean().default(false),
  maxLength: z.number().int().min(0).default(1000),
  level: z.enum(['info', 'debug', 'trace']).default('debug'),
})

/**
 * StorageOperationLogConfig 的数据约束与操作契约。
 * @example
 * ```ts
 * import { StorageOperationLogConfigSchema, type StorageOperationLogConfig } from '@h-ai/storage'
 *
 * const value: StorageOperationLogConfig = StorageOperationLogConfigSchema.parse({ read: false, write: true, maxLength: 500, level: 'debug' })
 * void value
 * ```
 */
export type StorageOperationLogConfig = z.infer<typeof StorageOperationLogConfigSchema>

const OperationLogConfigFieldSchema = {
  operationLog: StorageOperationLogConfigSchema.optional(),
}

/**
 * S3 存储配置 Schema
 *
 * 支持标准 AWS S3 以及兼容 S3 协议的存储服务（MinIO、RustFS、阿里云 OSS 等）。
 * 必填字段：bucket、region、accessKeyId、secretAccessKey。
 * @example
 * ```ts
 * import { S3ConfigSchema } from '@h-ai/storage'
 *
 * const value = S3ConfigSchema.parse({ type: 's3', bucket: 'uploads', region: 'us-east-1', accessKeyId: process.env.HAI_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.HAI_STORAGE_SECRET_ACCESS_KEY })
 * void value
 * ```
 */
export const S3ConfigSchema = z.object({
  /** 存储类型 */
  type: z.literal('s3'),

  /** 存储桶名称 */
  bucket: z.string().min(1, storageM('storage_config_bucketRequired')),

  /** 区域 */
  region: z.string().min(1, storageM('storage_config_regionRequired')),

  /** Access Key ID */
  accessKeyId: z.string().min(1, storageM('storage_config_accessKeyIdRequired')),

  /** Secret Access Key */
  secretAccessKey: z.string().min(1, storageM('storage_config_secretAccessKeyRequired')),

  /** 自定义端点（用于 MinIO、RustFS、阿里云 OSS 等） */
  endpoint: z.string().url().optional(),

  /** 强制使用路径风格 URL（某些 S3 兼容服务需要） */
  forcePathStyle: z.boolean().default(false),

  /** 路径前缀（所有操作都会加上此前缀） */
  prefix: z.string().default(''),

  /** 公开访问基础 URL（用于生成公开 URL） */
  publicUrl: z.string().url().optional(),

  ...OperationLogConfigFieldSchema,
})

/**
 * S3 配置类型（parse 后，带默认值的字段已填充，optional 字段仍可缺省）
 * @example
 * ```ts
 * import { S3ConfigSchema, type S3Config } from '@h-ai/storage'
 *
 * const value: S3Config = S3ConfigSchema.parse({ type: 's3', bucket: 'uploads', region: 'us-east-1', accessKeyId: process.env.HAI_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.HAI_STORAGE_SECRET_ACCESS_KEY })
 * void value
 * ```
 */
export type S3Config = z.infer<typeof S3ConfigSchema>

/**
 * 本地存储配置 Schema
 *
 * 基于本地文件系统，仅后端可用。必填字段：root。
 * @example
 * ```ts
 * import { LocalConfigSchema } from '@h-ai/storage'
 *
 * const value = LocalConfigSchema.parse({ type: 'local', root: './data/uploads' })
 * void value
 * ```
 */
export const LocalConfigSchema = z.object({
  /** 存储类型 */
  type: z.literal('local'),

  /** 根目录路径 */
  root: z.string().min(1, storageM('storage_config_rootRequired')),

  /** 目录创建权限 */
  directoryMode: z.number().default(0o755),

  /** 文件创建权限 */
  fileMode: z.number().default(0o644),

  ...OperationLogConfigFieldSchema,
})

/**
 * 本地配置类型（parse 后，带默认值的字段已填充，optional 字段仍可缺省）
 * @example
 * ```ts
 * import { LocalConfigSchema, type LocalConfig } from '@h-ai/storage'
 *
 * const value: LocalConfig = LocalConfigSchema.parse({ type: 'local', root: './data/uploads' })
 * void value
 * ```
 */
export type LocalConfig = z.infer<typeof LocalConfigSchema>

/**
 * 统一存储配置 Schema
 *
 * 支持 S3 和本地文件两种类型的配置验证。
 * @example
 * ```ts
 * import { StorageConfigSchema } from '@h-ai/storage'
 *
 * const value = StorageConfigSchema.parse({ type: 'local', root: './data/uploads' })
 * void value
 * ```
 */
export const StorageConfigSchema = z.discriminatedUnion('type', [
  S3ConfigSchema,
  LocalConfigSchema,
])

/**
 * 存储配置类型（parse 后的完整配置）
 * @example
 * ```ts
 * import { StorageConfigSchema, type StorageConfig } from '@h-ai/storage'
 *
 * const value: StorageConfig = StorageConfigSchema.parse({ type: 'local', root: './data/uploads' })
 * void value
 * ```
 */
export type StorageConfig = z.infer<typeof StorageConfigSchema>

/**
 * 存储配置输入类型（parse 前，允许省略带默认值的字段）
 * @example
 * ```ts
 * import type { StorageConfigInput } from '@h-ai/storage'
 *
 * const value: StorageConfigInput = { type: 'local', root: './data/uploads' }
 * void value
 * ```
 */
export type StorageConfigInput = z.input<typeof StorageConfigSchema>

// ─── 签名 URL 配置 ───

/**
 * 签名 URL 配置 Schema
 *
 * 用于控制 `storage.presign.getUrl()` 生成的下载签名 URL 参数。
 * @example
 * ```ts
 * import { PresignOptionsSchema } from '@h-ai/storage'
 *
 * const value = PresignOptionsSchema.parse({ expiresIn: 60 })
 * void value
 * ```
 */
export const PresignOptionsSchema = z.object({
  /** 过期时间（秒），范围 1~604800（7 天），默认 3600（1 小时） */
  expiresIn: StoragePresignExpiresInSchema.default(3600), // 最长 7 天

  /** 响应内容类型（用于下载时设置 Content-Type） */
  responseContentType: z.string().optional(),

  /** 响应内容处置（用于设置下载文件名） */
  responseContentDisposition: z.string().optional(),
})

/**
 * 签名 URL 输入选项，允许省略带默认值的字段。
 * @example
 * ```ts
 * import type { PresignOptions } from '@h-ai/storage'
 *
 * const value: PresignOptions = { expiresIn: 60, responseContentType: 'text/plain' }
 * void value
 * ```
 */
export type PresignOptions = z.input<typeof PresignOptionsSchema>

/**
 * 上传签名 URL 配置 Schema
 *
 * 继承 PresignOptionsSchema 并扩展上传专属参数，用于 `storage.presign.putUrl()`。
 * @example
 * ```ts
 * import { PresignUploadOptionsSchema } from '@h-ai/storage'
 *
 * const value = PresignUploadOptionsSchema.parse({ contentType: 'text/plain' })
 * void value
 * ```
 */
export const PresignUploadOptionsSchema = PresignOptionsSchema.extend({
  /** 上传内容类型（必须与实际上传匹配） */
  contentType: z.string().default('application/octet-stream'),
})

/**
 * 上传签名 URL 输入选项，省略 contentType 时使用 application/octet-stream。
 * @example
 * ```ts
 * import type { PresignUploadOptions } from '@h-ai/storage'
 *
 * const value: PresignUploadOptions = { expiresIn: 60, contentType: 'text/plain' }
 * void value
 * ```
 */
export type PresignUploadOptions = z.input<typeof PresignUploadOptionsSchema>
