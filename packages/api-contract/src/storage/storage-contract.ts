/**
 * @h-ai/api-contract — Storage 领域 contract
 *
 * 定义文件存储相关 API 的接口边界：预签名 URL 生成与文件管理。
 * 所有接口均需 Bearer Token 认证（由 `@h-ai/serv` 的 feature 层强制）。
 * 资源访问还须通过应用注入的 authorize 策略；认证不等同于拥有任意 key 的访问权。
 * @module storage-contract
 */

import { z } from 'zod'
import { HaiErrorSchema, haiResultSchema, HaiVoidResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import {
  StorageDeleteFilesInputSchema,
  StorageDeleteSummarySchema,
  StorageFileKeyInputSchema,
  StorageFileMetadataSchema,
  StorageListFilesDataSchema,
  StorageListFilesInputSchema,
  StoragePresignDownloadInputSchema,
  StoragePresignedUrlSchema,
  StoragePresignUploadInputSchema,
} from './storage-schemas.js'

// 下载与上传接口共享同一响应结构，仅在本 contract 内复用。
const presignedUrlOutputSchema = haiResultSchema(StoragePresignedUrlSchema)

/** Storage 领域 oRPC contract。 */
export const storageContract = {
  presignedUrls: {
    createDownload: route({ method: 'POST', path: '/storage/presigned-urls/download', operationId: 'storage.presignedUrls.createDownload', summary: 'Create presigned download URL', tags: ['storage'] })
      .input(StoragePresignDownloadInputSchema)
      .output(presignedUrlOutputSchema),
    createUpload: route({ method: 'POST', path: '/storage/presigned-urls/upload', operationId: 'storage.presignedUrls.createUpload', summary: 'Create presigned upload URL', tags: ['storage'] })
      .input(StoragePresignUploadInputSchema)
      .output(presignedUrlOutputSchema),
  },
  files: {
    list: route({ method: 'GET', path: '/storage/files', operationId: 'storage.files.list', summary: 'List files', tags: ['storage'] })
      .input(StorageListFilesInputSchema)
      .output(haiResultSchema(StorageListFilesDataSchema)),
    getMetadata: route({ method: 'POST', path: '/storage/files/metadata', operationId: 'storage.files.getMetadata', summary: 'Get file metadata', tags: ['storage'] })
      .input(StorageFileKeyInputSchema)
      .output(haiResultSchema(StorageFileMetadataSchema)),
    delete: route({ method: 'DELETE', path: '/storage/files', operationId: 'storage.files.delete', summary: 'Delete file', tags: ['storage'] })
      .input(StorageFileKeyInputSchema)
      .output(HaiVoidResultSchema),
    deleteMany: route({ method: 'POST', path: '/storage/files/delete-many', operationId: 'storage.files.deleteMany', summary: 'Delete files', tags: ['storage'] })
      .input(StorageDeleteFilesInputSchema)
      .output(z.discriminatedUnion('success', [
        z.object({ success: z.literal(true), data: StorageDeleteSummarySchema }),
        z.object({
          success: z.literal(false),
          error: HaiErrorSchema.extend({ ext: z.object({ deleteMany: StorageDeleteSummarySchema.optional() }).catchall(z.unknown()).optional() }),
        }),
      ])),
  },
}

export type StorageContract = typeof storageContract
