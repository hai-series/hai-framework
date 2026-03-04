/**
 * @h-ai/storage/api — 存储 API 端点契约定义
 *
 * 所有 storage 模块的 API 端点（path + method + schema），
 * 客户端和服务端都从此处引用，编译时保证一致性。
 * @module storage-api-contract
 */

import { z } from 'zod'
import {
  DeleteFileInputSchema,
  DeleteFilesInputSchema,
  FileInfoInputSchema,
  FileMetadataSchema,
  ListFilesOutputSchema,
  PresignGetInputSchema,
  PresignPutInputSchema,
  PresignUrlOutputSchema,
} from './storage-api-schemas.js'

// ─── 端点定义辅助（内联，避免对 @h-ai/api-client 的循环依赖） ───

interface EndpointDef<TInput = unknown, TOutput = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  input: z.ZodType<TInput>
  output: z.ZodType<TOutput>
  requireAuth?: boolean
  meta?: { summary?: string, tags?: string[] }
}

function defineEndpoint<TInput, TOutput>(def: EndpointDef<TInput, TOutput>): EndpointDef<TInput, TOutput> {
  return def
}

// ─── storage API 端点 ───

/**
 * storage 所有 API 端点
 *
 * @example
 * ```ts
 * // 客户端
 * import { storageEndpoints } from '@h-ai/storage/api'
 * const { url } = await api.call(storageEndpoints.presignUpload, { key: 'avatar.png' })
 *
 * // 服务端
 * export const POST = kit.fromContract(storageEndpoints.presignUpload, async (input) => {
 *   const result = await storage.presign.putUrl(input.key, input)
 *   return result.success ? result.data : kit.response.internalError(result.error.message)
 * })
 * ```
 */
export const storageEndpoints = {
  /** 获取下载签名 URL */
  presignDownload: defineEndpoint({
    method: 'POST',
    path: '/storage/presign/download',
    input: PresignGetInputSchema,
    output: PresignUrlOutputSchema,
    meta: { summary: 'Get presigned download URL', tags: ['storage'] },
  }),

  /** 获取上传签名 URL */
  presignUpload: defineEndpoint({
    method: 'POST',
    path: '/storage/presign/upload',
    input: PresignPutInputSchema,
    output: PresignUrlOutputSchema,
    meta: { summary: 'Get presigned upload URL', tags: ['storage'] },
  }),

  /** 获取文件元数据 */
  fileInfo: defineEndpoint({
    method: 'POST',
    path: '/storage/file/info',
    input: FileInfoInputSchema,
    output: FileMetadataSchema,
    meta: { summary: 'Get file metadata', tags: ['storage'] },
  }),

  /** 列出文件 */
  listFiles: defineEndpoint({
    method: 'GET',
    path: '/storage/files',
    input: z.object({
      prefix: z.string().optional(),
      maxKeys: z.coerce.number().int().min(1).max(1000).optional(),
      continuationToken: z.string().optional(),
      delimiter: z.string().optional(),
    }),
    output: ListFilesOutputSchema,
    meta: { summary: 'List files by prefix', tags: ['storage'] },
  }),

  /** 删除单个文件 */
  deleteFile: defineEndpoint({
    method: 'POST',
    path: '/storage/file/delete',
    input: DeleteFileInputSchema,
    output: z.void(),
    meta: { summary: 'Delete a file', tags: ['storage'] },
  }),

  /** 批量删除文件 */
  deleteFiles: defineEndpoint({
    method: 'POST',
    path: '/storage/files/delete',
    input: DeleteFilesInputSchema,
    output: z.void(),
    meta: { summary: 'Delete multiple files', tags: ['storage'] },
  }),
} as const
