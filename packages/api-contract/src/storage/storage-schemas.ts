/**
 * @h-ai/api-contract — Storage 领域 Schema
 *
 * 包含文件元数据、预签名 URL、文件列表与删除相关的 input/output Zod Schema。
 * 仅保留跨接口、跨层复用的数据结构；一次性输出包装在 contract 中内联。
 * @module storage-schemas
 */

import type { HaiResult } from '@h-ai/core'
import { StorageDeleteKeysSchema, StorageKeySchema, StoragePrefixSchema, StoragePresignExpiresInSchema } from '@h-ai/storage/schemas'
import { z } from 'zod'

/**
 * 文件元数据 Schema。
 * @example
 * ```ts
 * import { StorageFileMetadataSchema } from '@h-ai/api-contract'
 *
 * const value = StorageFileMetadataSchema.parse({
 *   key: 'examples/readme.txt',
 *   size: 0,
 *   contentType: 'example',
 *   lastModified: null
 * })
 * void value
 * ```
 */
export const StorageFileMetadataSchema = z.object({
  key: z.string(),
  size: z.number(),
  contentType: z.string(),
  lastModified: z.coerce.date(),
  etag: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

/**
 * 获取下载签名 URL 入参 Schema。
 * @example
 * ```ts
 * import { StoragePresignDownloadInputSchema } from '@h-ai/api-contract'
 *
 * const value = StoragePresignDownloadInputSchema.parse({
 *   key: 'examples/readme.txt'
 * })
 * void value
 * ```
 */
export const StoragePresignDownloadInputSchema = z.strictObject({
  key: StorageKeySchema,
  expiresIn: StoragePresignExpiresInSchema.optional(),
})

/**
 * 获取上传签名 URL 入参 Schema。
 * @example
 * ```ts
 * import { StoragePresignUploadInputSchema } from '@h-ai/api-contract'
 *
 * const value = StoragePresignUploadInputSchema.parse({
 *   key: 'examples/readme.txt'
 * })
 * void value
 * ```
 */
export const StoragePresignUploadInputSchema = z.strictObject({
  key: StorageKeySchema,
  contentType: z.string().optional(),
  expiresIn: StoragePresignExpiresInSchema.optional(),
})

/**
 * 签名 URL 业务数据 Schema。
 * @example
 * ```ts
 * import { StoragePresignedUrlSchema } from '@h-ai/api-contract'
 *
 * const value = StoragePresignedUrlSchema.parse({
 *   url: 'https://example.com/resource',
 *   key: 'examples/readme.txt'
 * })
 * void value
 * ```
 */
export const StoragePresignedUrlSchema = z.object({
  url: z.string(),
  key: z.string(),
  expiresAt: z.coerce.date().optional(),
})

/**
 * 文件列表查询入参 Schema。
 * @example
 * ```ts
 * import { StorageListFilesInputSchema } from '@h-ai/api-contract'
 *
 * const value = StorageListFilesInputSchema.parse({})
 * void value
 * ```
 */
export const StorageListFilesInputSchema = z.object({
  prefix: StoragePrefixSchema.optional(),
  maxKeys: z.coerce.number().int().min(1).max(1000).optional(),
  continuationToken: z.string().optional(),
  delimiter: z.string().optional(),
})

/**
 * 文件列表业务数据 Schema。
 * @example
 * ```ts
 * import { StorageListFilesDataSchema } from '@h-ai/api-contract'
 *
 * const value = StorageListFilesDataSchema.parse({
 *   files: [
 *     {
 *       key: 'examples/readme.txt',
 *       size: 0,
 *       contentType: 'example',
 *       lastModified: null
 *     }
 *   ],
 *   commonPrefixes: [
 *     'example'
 *   ],
 *   isTruncated: true
 * })
 * void value
 * ```
 */
export const StorageListFilesDataSchema = z.object({
  files: z.array(StorageFileMetadataSchema),
  commonPrefixes: z.array(z.string()),
  nextContinuationToken: z.string().optional(),
  isTruncated: z.boolean(),
})

/**
 * 单文件操作入参 Schema。
 * @example
 * ```ts
 * import { StorageFileKeyInputSchema } from '@h-ai/api-contract'
 *
 * const value = StorageFileKeyInputSchema.parse({
 *   key: 'examples/readme.txt'
 * })
 * void value
 * ```
 */
export const StorageFileKeyInputSchema = z.object({
  key: StorageKeySchema,
})

/**
 * 批量删除文件入参 Schema。
 * @example
 * ```ts
 * import { StorageDeleteFilesInputSchema } from '@h-ai/api-contract'
 *
 * const value = StorageDeleteFilesInputSchema.parse({
 *   keys: [
 *     'example'
 *   ]
 * })
 * void value
 * ```
 */
export const StorageDeleteFilesInputSchema = z.object({
  keys: StorageDeleteKeysSchema,
})

/**
 * 批量删除的安全进度；响应失败时通过 error.ext.deleteMany 返回同一结构。
 * @example
 * ```ts
 * import { StorageDeleteSummarySchema } from '@h-ai/api-contract'
 *
 * const value = StorageDeleteSummarySchema.parse({
 *   deletedKeys: [
 *     'example'
 *   ],
 *   failures: [
 *     {
 *       key: 'examples/readme.txt',
 *       code: 'example-1',
 *       retryable: true,
 *       outcome: 'failed'
 *     }
 *   ]
 * })
 * void value
 * ```
 */
export const StorageDeleteSummarySchema = z.object({
  deletedKeys: z.array(z.string()),
  failures: z.array(z.object({
    key: z.string(),
    code: z.string(),
    retryable: z.boolean(),
    outcome: z.enum(['failed', 'unknown', 'notAttempted']),
  })),
})

/**
 * 为对象生成下载地址的请求。
 * @example
 * ```ts
 * import type { StoragePresignDownloadInput } from '@h-ai/api-contract'
 * import { StoragePresignDownloadInputSchema } from '@h-ai/api-contract'
 *
 * const value: StoragePresignDownloadInput = StoragePresignDownloadInputSchema.parse({
 *   key: 'examples/readme.txt'
 * })
 * void value
 * ```
 */
export type StoragePresignDownloadInput = z.infer<typeof StoragePresignDownloadInputSchema>
/**
 * 为对象生成上传地址的请求。
 * @example
 * ```ts
 * import type { StoragePresignUploadInput } from '@h-ai/api-contract'
 * import { StoragePresignUploadInputSchema } from '@h-ai/api-contract'
 *
 * const value: StoragePresignUploadInput = StoragePresignUploadInputSchema.parse({
 *   key: 'examples/readme.txt'
 * })
 * void value
 * ```
 */
export type StoragePresignUploadInput = z.infer<typeof StoragePresignUploadInputSchema>
/**
 * 以 HaiResult 区分成功业务数据和公共错误的 StoragePresignedUrlOutput 响应。
 * @example
 * ```ts
 * import type { StoragePresignedUrlOutput } from '@h-ai/api-contract'
 * import { StoragePresignedUrlSchema } from '@h-ai/api-contract'
 * import { ok } from '@h-ai/core'
 *
 * const response: StoragePresignedUrlOutput = ok(StoragePresignedUrlSchema.parse({
 *   url: 'https://example.com/resource',
 *   key: 'examples/readme.txt'
 * }))
 * if (response.success) void response.data
 * ```
 */
export type StoragePresignedUrlOutput = HaiResult<z.infer<typeof StoragePresignedUrlSchema>>
/**
 * 按前缀和游标列出对象的请求。
 * @example
 * ```ts
 * import type { StorageListFilesInput } from '@h-ai/api-contract'
 * import { StorageListFilesInputSchema } from '@h-ai/api-contract'
 *
 * const value: StorageListFilesInput = StorageListFilesInputSchema.parse({})
 * void value
 * ```
 */
export type StorageListFilesInput = z.infer<typeof StorageListFilesInputSchema>
/**
 * 以对象 key 定位文件的请求。
 * @example
 * ```ts
 * import type { StorageFileKeyInput } from '@h-ai/api-contract'
 * import { StorageFileKeyInputSchema } from '@h-ai/api-contract'
 *
 * const value: StorageFileKeyInput = StorageFileKeyInputSchema.parse({
 *   key: 'examples/readme.txt'
 * })
 * void value
 * ```
 */
export type StorageFileKeyInput = z.infer<typeof StorageFileKeyInputSchema>
/**
 * 批量删除指定对象 key 的请求。
 * @example
 * ```ts
 * import type { StorageDeleteFilesInput } from '@h-ai/api-contract'
 * import { StorageDeleteFilesInputSchema } from '@h-ai/api-contract'
 *
 * const value: StorageDeleteFilesInput = StorageDeleteFilesInputSchema.parse({
 *   keys: [
 *     'example'
 *   ]
 * })
 * void value
 * ```
 */
export type StorageDeleteFilesInput = z.infer<typeof StorageDeleteFilesInputSchema>
