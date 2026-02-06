/**
 * =============================================================================
 * @hai/storage - 存储配置 Schema
 * =============================================================================
 *
 * 本文件定义存储模块的配置结构，使用 Zod 进行运行时校验。
 *
 * 包含：
 * - 错误码常量（5000-5999 范围）
 * - 存储类型枚举
 * - S3 连接配置
 * - 统一的 StorageConfig 配置结构
 *
 * @example
 * ```ts
 * import { StorageConfigSchema, StorageErrorCode } from '@hai/storage'
 *
 * // 校验配置
 * const config = StorageConfigSchema.parse({
 *     type: 's3',
 *     bucket: 'my-bucket',
 *     region: 'us-east-1',
 *     accessKeyId: 'xxx',
 *     secretAccessKey: 'xxx'
 * })
 *
 * // 使用错误码
 * if (error.code === StorageErrorCode.NOT_INITIALIZED) {
 *     // 处理错误：请先调用 storage.init()
 * }
 * ```
 *
 * @module storage-config
 * =============================================================================
 */

import { z } from 'zod'
import { storageM } from './storage-i18n.js'

// =============================================================================
// 错误码常量
// =============================================================================

/**
 * 存储错误码（数值范围 5000-5999）
 *
 * 用于标识存储操作中的各类错误，便于错误处理和日志记录。
 *
 * @example
 * ```ts
 * import { StorageErrorCode } from '@hai/storage'
 *
 * if (result.error?.code === StorageErrorCode.CONNECTION_FAILED) {
 *     // 处理错误：存储连接失败
 * }
 * ```
 */
export const StorageErrorCode = {
  /** 连接失败 */
  CONNECTION_FAILED: 5000,
  /** 操作失败 */
  OPERATION_FAILED: 5001,
  /** 文件不存在 */
  NOT_FOUND: 5002,
  /** 文件已存在 */
  ALREADY_EXISTS: 5003,
  /** 权限拒绝 */
  PERMISSION_DENIED: 5004,
  /** 配额超限 */
  QUOTA_EXCEEDED: 5005,
  /** 无效路径 */
  INVALID_PATH: 5006,
  /** IO 错误 */
  IO_ERROR: 5007,
  /** 网络错误 */
  NETWORK_ERROR: 5008,
  /** 存储未初始化 */
  NOT_INITIALIZED: 5010,
  /** 不支持的存储类型 */
  UNSUPPORTED_TYPE: 5011,
  /** 配置错误 */
  CONFIG_ERROR: 5012,
  /** 签名 URL 生成失败 */
  PRESIGN_FAILED: 5013,
  /** 上传失败 */
  UPLOAD_FAILED: 5014,
  /** 下载失败 */
  DOWNLOAD_FAILED: 5015,
} as const

/** 存储错误码类型 */
export type StorageErrorCodeType = (typeof StorageErrorCode)[keyof typeof StorageErrorCode]

// =============================================================================
// 存储配置 Schema
// =============================================================================

/**
 * 存储类型枚举
 *
 * 支持的存储类型：
 * - `s3` - S3 协议对象存储（兼容 AWS S3、MinIO、阿里云 OSS 等）
 * - `local` - 本地文件存储（仅后端）
 */
export const StorageTypeSchema = z.enum(['s3', 'local'])

/** 存储类型 */
export type StorageType = z.infer<typeof StorageTypeSchema>

/**
 * S3 存储配置 Schema
 *
 * 支持标准 S3 以及兼容 S3 协议的存储服务（MinIO、阿里云 OSS 等）
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

  /** 自定义端点（用于 MinIO、阿里云 OSS 等） */
  endpoint: z.string().url().optional(),

  /** 强制使用路径风格 URL（某些 S3 兼容服务需要） */
  forcePathStyle: z.boolean().default(false),

  /** 路径前缀（所有操作都会加上此前缀） */
  prefix: z.string().default(''),

  /** 公开访问基础 URL（用于生成公开 URL） */
  publicUrl: z.string().url().optional(),
})

/** S3 配置类型 */
export type S3Config = z.infer<typeof S3ConfigSchema>

/**
 * 本地存储配置 Schema
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
})

/** 本地配置类型 */
export type LocalConfig = z.infer<typeof LocalConfigSchema>

/**
 * 统一存储配置 Schema
 *
 * 支持 S3 和本地文件两种类型的配置验证。
 *
 * @example
 * ```ts
 * // S3 配置
 * const s3Config = StorageConfigSchema.parse({
 *     type: 's3',
 *     bucket: 'my-bucket',
 *     region: 'us-east-1',
 *     accessKeyId: 'AKIAXXXXXXXX',
 *     secretAccessKey: 'xxxxx'
 * })
 *
 * // MinIO 配置
 * const minioConfig = StorageConfigSchema.parse({
 *     type: 's3',
 *     bucket: 'my-bucket',
 *     region: 'us-east-1',
 *     endpoint: 'http://localhost:9000',
 *     accessKeyId: 'minioadmin',
 *     secretAccessKey: 'minioadmin',
 *     forcePathStyle: true
 * })
 *
 * // 本地存储配置
 * const localConfig = StorageConfigSchema.parse({
 *     type: 'local',
 *     root: '/data/uploads'
 * })
 * ```
 */
export const StorageConfigSchema = z.discriminatedUnion('type', [
  S3ConfigSchema,
  LocalConfigSchema,
])

/** 存储配置类型（parse 后的完整配置） */
export type StorageConfig = z.infer<typeof StorageConfigSchema>

/** 存储配置输入类型（parse 前，允许省略带默认值的字段） */
export type StorageConfigInput = z.input<typeof StorageConfigSchema>

// =============================================================================
// 签名 URL 配置
// =============================================================================

/**
 * 签名 URL 配置 Schema
 */
export const PresignOptionsSchema = z.object({
  /** 过期时间（秒），默认 3600（1小时） */
  expiresIn: z.number().min(1).max(604800).default(3600), // 最长 7 天

  /** 响应内容类型（用于下载时设置 Content-Type） */
  responseContentType: z.string().optional(),

  /** 响应内容处置（用于设置下载文件名） */
  responseContentDisposition: z.string().optional(),
})

/** 签名 URL 配置类型 */
export type PresignOptions = z.infer<typeof PresignOptionsSchema>

/**
 * 上传签名 URL 配置 Schema
 */
export const PresignUploadOptionsSchema = PresignOptionsSchema.extend({
  /** 上传内容类型（必须与实际上传匹配） */
  contentType: z.string().default('application/octet-stream'),

  /** 最大文件大小限制（bytes） */
  maxSize: z.number().optional(),
})

/** 上传签名 URL 配置类型 */
export type PresignUploadOptions = z.infer<typeof PresignUploadOptionsSchema>
