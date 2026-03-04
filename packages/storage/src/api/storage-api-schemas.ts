/**
 * @h-ai/storage/api — 存储 API 契约 Schema
 *
 * 入参/出参 Schema，客户端和服务端共享的唯一真相源。
 * @module storage-api-schemas
 */

import { z } from 'zod'

// ─── 文件元数据 ───

/** 文件元数据 Schema */
export const FileMetadataSchema = z.object({
  key: z.string(),
  size: z.number(),
  contentType: z.string(),
  lastModified: z.coerce.date(),
  etag: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
})

// ─── 签名 URL ───

/** 获取下载签名 URL 入参 */
export const PresignGetInputSchema = z.object({
  key: z.string().min(1),
  expiresIn: z.number().int().min(1).optional(),
})

/** 获取上传签名 URL 入参 */
export const PresignPutInputSchema = z.object({
  key: z.string().min(1),
  contentType: z.string().optional(),
  contentLength: z.number().int().min(1).optional(),
  expiresIn: z.number().int().min(1).optional(),
})

/** 签名 URL 出参 */
export const PresignUrlOutputSchema = z.object({
  url: z.string(),
  key: z.string(),
  expiresAt: z.coerce.date().optional(),
})

// ─── 列表 ───

/** 文件列表出参 */
export const ListFilesOutputSchema = z.object({
  files: z.array(FileMetadataSchema),
  commonPrefixes: z.array(z.string()),
  nextContinuationToken: z.string().optional(),
  isTruncated: z.boolean(),
})

// ─── 删除 ───

/** 删除文件入参 */
export const DeleteFileInputSchema = z.object({
  key: z.string().min(1),
})

/** 批量删除文件入参 */
export const DeleteFilesInputSchema = z.object({
  keys: z.array(z.string().min(1)).min(1),
})

// ─── 文件信息 ───

/** 获取文件信息入参 */
export const FileInfoInputSchema = z.object({
  key: z.string().min(1),
})

// ─── 推导类型 ───

export type PresignGetInput = z.infer<typeof PresignGetInputSchema>
export type PresignPutInput = z.infer<typeof PresignPutInputSchema>
export type PresignUrlOutput = z.infer<typeof PresignUrlOutputSchema>
export type ListFilesOutput = z.infer<typeof ListFilesOutputSchema>
export type DeleteFileInput = z.infer<typeof DeleteFileInputSchema>
export type DeleteFilesInput = z.infer<typeof DeleteFilesInputSchema>
export type FileInfoInput = z.infer<typeof FileInfoInputSchema>
