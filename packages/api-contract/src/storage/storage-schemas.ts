/**
 * @h-ai/api-contract — Storage 领域 Schema
 *
 * 包含文件元数据、预签名 URL、文件列表与删除相关的 input/output Zod Schema。
 * 所有 Output Schema 均用 `haiResultSchema()` 封装。
 * @module storage-schemas
 */

import { z } from 'zod'
import { haiResultSchema } from '../common/result-schemas.js'

/** 文件元数据 Schema。 */
export const StorageFileMetadataSchema = z.object({
  key: z.string(),
  size: z.number(),
  contentType: z.string(),
  lastModified: z.coerce.date(),
  etag: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

/** 获取下载签名 URL 入参 Schema。 */
export const StoragePresignDownloadInputSchema = z.object({
  key: z.string().min(1),
  expiresIn: z.number().int().min(1).optional(),
})

/** 获取上传签名 URL 入参 Schema。 */
export const StoragePresignUploadInputSchema = z.object({
  key: z.string().min(1),
  contentType: z.string().optional(),
  contentLength: z.number().int().min(1).optional(),
  expiresIn: z.number().int().min(1).optional(),
})

/** 签名 URL 业务数据 Schema。 */
export const StoragePresignedUrlSchema = z.object({
  url: z.string(),
  key: z.string(),
  expiresAt: z.coerce.date().optional(),
})

/** 文件列表查询入参 Schema。 */
export const StorageListFilesInputSchema = z.object({
  prefix: z.string().optional(),
  maxKeys: z.coerce.number().int().min(1).max(1000).optional(),
  continuationToken: z.string().optional(),
  delimiter: z.string().optional(),
})

/** 文件列表业务数据 Schema。 */
export const StorageListFilesDataSchema = z.object({
  files: z.array(StorageFileMetadataSchema),
  commonPrefixes: z.array(z.string()),
  nextContinuationToken: z.string().optional(),
  isTruncated: z.boolean(),
})

/** 单文件操作入参 Schema。 */
export const StorageFileKeyInputSchema = z.object({
  key: z.string().min(1),
})

/** 批量删除文件入参 Schema。 */
export const StorageDeleteFilesInputSchema = z.object({
  keys: z.array(z.string().min(1)).min(1),
})

export const StoragePresignedUrlOutputSchema = haiResultSchema(StoragePresignedUrlSchema)
export const StorageFileMetadataOutputSchema = haiResultSchema(StorageFileMetadataSchema)
export const StorageListFilesOutputSchema = haiResultSchema(StorageListFilesDataSchema)
export const StorageVoidOutputSchema = haiResultSchema(z.void())

export type StoragePresignDownloadInput = z.infer<typeof StoragePresignDownloadInputSchema>
export type StoragePresignUploadInput = z.infer<typeof StoragePresignUploadInputSchema>
export type StoragePresignedUrlOutput = z.infer<typeof StoragePresignedUrlOutputSchema>
export type StorageListFilesInput = z.infer<typeof StorageListFilesInputSchema>
export type StorageFileKeyInput = z.infer<typeof StorageFileKeyInputSchema>
export type StorageDeleteFilesInput = z.infer<typeof StorageDeleteFilesInputSchema>
