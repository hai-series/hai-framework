/**
 * =============================================================================
 * @hai/core - 存储配置 Schema
 * =============================================================================
 * 定义存储相关配置的 Zod schema
 *
 * 对应配置文件: _storage.yml
 * =============================================================================
 */

import { z } from 'zod'

// =============================================================================
// 错误码（存储 5000-5999）
// =============================================================================

/**
 * 存储错误码 (5000-5999)
 */
export const StorageErrorCode = {
  FILE_NOT_FOUND: 5000,
  WRITE_FAILED: 5001,
  READ_FAILED: 5002,
  DELETE_FAILED: 5003,
  PERMISSION_DENIED: 5004,
  QUOTA_EXCEEDED: 5005,
  INVALID_PATH: 5006,
  FILE_TOO_LARGE: 5007,
  INVALID_FILE_TYPE: 5008,
  UPLOAD_FAILED: 5009,
  DOWNLOAD_FAILED: 5010,
  SIGNED_URL_FAILED: 5011,
} as const
// eslint-disable-next-line ts/no-redeclare -- 同时导出 value/type，提供更直观的公共 API
export type StorageErrorCode = typeof StorageErrorCode[keyof typeof StorageErrorCode]

// =============================================================================
// 配置类型
// =============================================================================

/**
 * 存储提供者类型
 */
export const StorageProviderTypeSchema = z.enum(['hai', 'local', 's3', 'oss', 'cos', 'minio', 'custom'])
export type StorageProviderType = z.infer<typeof StorageProviderTypeSchema>

/**
 * 本地存储配置
 */
export const LocalStorageConfigSchema = z.object({
  /** 存储根目录 */
  root: z.string().default('./storage'),
  /** 公共访问目录 */
  publicDir: z.string().default('public'),
  /** 私有目录 */
  privateDir: z.string().default('private'),
  /** 临时目录 */
  tempDir: z.string().default('temp'),
})
export type LocalStorageConfig = z.infer<typeof LocalStorageConfigSchema>

/**
 * S3 兼容存储配置
 */
export const S3StorageConfigSchema = z.object({
  /** 区域 */
  region: z.string().default('us-east-1'),
  /** 端点（自托管时使用） */
  endpoint: z.string().url().optional(),
  /** Bucket 名称 */
  bucket: z.string(),
  /** Access Key ID */
  accessKeyId: z.string(),
  /** Secret Access Key */
  secretAccessKey: z.string(),
  /** 是否强制路径样式 */
  forcePathStyle: z.boolean().default(false),
  /** 签名版本 */
  signatureVersion: z.enum(['v2', 'v4']).default('v4'),
})
export type S3StorageConfig = z.infer<typeof S3StorageConfigSchema>

/**
 * 阿里云 OSS 配置
 */
export const OSSStorageConfigSchema = z.object({
  /** 区域 */
  region: z.string(),
  /** Bucket 名称 */
  bucket: z.string(),
  /** Access Key ID */
  accessKeyId: z.string(),
  /** Access Key Secret */
  accessKeySecret: z.string(),
  /** 内网端点 */
  internal: z.boolean().default(false),
  /** CDN 域名 */
  cdnDomain: z.string().url().optional(),
})
export type OSSStorageConfig = z.infer<typeof OSSStorageConfigSchema>

/**
 * 腾讯云 COS 配置
 */
export const COSStorageConfigSchema = z.object({
  /** 区域 */
  region: z.string(),
  /** Bucket 名称 */
  bucket: z.string(),
  /** Secret ID */
  secretId: z.string(),
  /** Secret Key */
  secretKey: z.string(),
  /** CDN 域名 */
  cdnDomain: z.string().url().optional(),
})
export type COSStorageConfig = z.infer<typeof COSStorageConfigSchema>

/**
 * 上传限制配置
 */
export const UploadLimitsSchema = z.object({
  /** 最大文件大小（字节） */
  maxFileSize: z.number().int().positive().default(10 * 1024 * 1024), // 10MB
  /** 允许的 MIME 类型 */
  allowedMimeTypes: z.array(z.string()).default([
    'image/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.*',
  ]),
  /** 禁止的文件扩展名 */
  forbiddenExtensions: z.array(z.string()).default(['.exe', '.bat', '.sh', '.php']),
  /** 是否生成缩略图 */
  generateThumbnails: z.boolean().default(true),
  /** 缩略图尺寸 */
  thumbnailSizes: z.array(z.object({
    name: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })).default([
    { name: 'small', width: 150, height: 150 },
    { name: 'medium', width: 400, height: 400 },
    { name: 'large', width: 800, height: 800 },
  ]),
})
export type UploadLimits = z.infer<typeof UploadLimitsSchema>

/**
 * 存储配置
 */
export const StorageConfigSchema = z.object({
  /** 提供者类型 */
  provider: StorageProviderTypeSchema.default('hai'),
  /** 本地存储配置 */
  local: LocalStorageConfigSchema.optional(),
  /** S3 配置（当 provider 为 s3 或 minio 时） */
  s3: S3StorageConfigSchema.optional(),
  /** OSS 配置（当 provider 为 oss 时） */
  oss: OSSStorageConfigSchema.optional(),
  /** COS 配置（当 provider 为 cos 时） */
  cos: COSStorageConfigSchema.optional(),
  /** 上传限制 */
  limits: UploadLimitsSchema.optional(),
  /** 默认存储可见性 */
  defaultVisibility: z.enum(['public', 'private']).default('private'),
  /** URL 签名过期时间（秒） */
  signedUrlExpiry: z.number().int().positive().default(3600),
})
export type StorageConfig = z.infer<typeof StorageConfigSchema>
