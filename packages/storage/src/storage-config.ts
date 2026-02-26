/**
 * @h-ai/storage — 错误码 + 配置 Schema
 */

import { z } from 'zod'
import { storageM } from './storage-i18n.js'

// ─── 错误码 ───

/**
 * 存储错误码（数值范围 6000-6999）
 */
export const StorageErrorCode = {
  /** 连接失败 */
  CONNECTION_FAILED: 6000,
  /** 操作失败 */
  OPERATION_FAILED: 6001,
  /** 文件不存在 */
  NOT_FOUND: 6002,
  /** 文件已存在 */
  ALREADY_EXISTS: 6003,
  /** 权限拒绝 */
  PERMISSION_DENIED: 6004,
  /** 配额超限 */
  QUOTA_EXCEEDED: 6005,
  /** 无效路径 */
  INVALID_PATH: 6006,
  /** IO 错误 */
  IO_ERROR: 6007,
  /** 网络错误 */
  NETWORK_ERROR: 6008,
  /** 存储未初始化 */
  NOT_INITIALIZED: 6010,
  /** 不支持的存储类型 */
  UNSUPPORTED_TYPE: 6011,
  /** 配置错误 */
  CONFIG_ERROR: 6012,
  /** 签名 URL 生成失败 */
  PRESIGN_FAILED: 6013,
  /** 上传失败 */
  UPLOAD_FAILED: 6014,
  /** 下载失败 */
  DOWNLOAD_FAILED: 6015,
} as const

/** 存储错误码类型 */
export type StorageErrorCodeType = (typeof StorageErrorCode)[keyof typeof StorageErrorCode]

// ─── 配置 Schema ───

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
 * 支持标准 AWS S3 以及兼容 S3 协议的存储服务（MinIO、阿里云 OSS 等）。
 * 必填字段：bucket、region、accessKeyId、secretAccessKey。
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

/** S3 配置类型（parse 后，所有字段已填充默认值） */
export type S3Config = z.infer<typeof S3ConfigSchema>

/**
 * 本地存储配置 Schema
 *
 * 基于本地文件系统，仅后端可用。必填字段：root。
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

/** 本地配置类型（parse 后，所有字段已填充默认值） */
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

// ─── 签名 URL 配置 ───

/**
 * 签名 URL 配置 Schema
 *
 * 用于控制 `storage.presign.getUrl()` 生成的下载签名 URL 参数。
 *
 * @example
 * ```ts
 * const url = await storage.presign.getUrl('report.pdf', {
 *   expiresIn: 600,                          // 10 分钟过期
 *   responseContentDisposition: 'attachment; filename="report.pdf"',
 * })
 * ```
 */
export const PresignOptionsSchema = z.object({
  /** 过期时间（秒），范围 1~604800（7 天），默认 3600（1 小时） */
  expiresIn: z.number().min(1).max(604800).default(3600), // 最长 7 天

  /** 响应内容类型（用于下载时设置 Content-Type） */
  responseContentType: z.string().optional(),

  /** 响应内容处置（用于设置下载文件名） */
  responseContentDisposition: z.string().optional(),
})

/** 签名 URL 配置类型（parse 后） */
export type PresignOptions = z.infer<typeof PresignOptionsSchema>

/**
 * 上传签名 URL 配置 Schema
 *
 * 继承 PresignOptionsSchema 并扩展上传专属参数，用于 `storage.presign.putUrl()`。
 *
 * @example
 * ```ts
 * const url = await storage.presign.putUrl('uploads/avatar.png', {
 *   contentType: 'image/png',
 *   maxSize: 5 * 1024 * 1024,   // 5MB 限制
 *   expiresIn: 300,
 * })
 * ```
 */
export const PresignUploadOptionsSchema = PresignOptionsSchema.extend({
  /** 上传内容类型（必须与实际上传匹配） */
  contentType: z.string().default('application/octet-stream'),

  /** 最大文件大小限制（bytes） */
  maxSize: z.number().optional(),
})

/** 上传签名 URL 配置类型（parse 后） */
export type PresignUploadOptions = z.infer<typeof PresignUploadOptionsSchema>
