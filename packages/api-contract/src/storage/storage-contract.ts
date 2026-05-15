/**
 * @h-ai/api-contract — Storage 领域 contract
 *
 * 定义文件存储相关 API 的接口边界：预签名 URL 生成与文件管理。
 * 所有接口均需 Bearer Token 认证（由 `@h-ai/serv` 的 feature 层强制）。
 * @module storage-contract
 */

import { oc } from '@orpc/contract'
import {
  StorageDeleteFilesInputSchema,
  StorageFileKeyInputSchema,
  StorageFileMetadataOutputSchema,
  StorageListFilesInputSchema,
  StorageListFilesOutputSchema,
  StoragePresignDownloadInputSchema,
  StoragePresignedUrlOutputSchema,
  StoragePresignUploadInputSchema,
  StorageVoidOutputSchema,
} from './storage-schemas.js'

/** Storage 领域 oRPC contract。 */
export const storageContract = {
  presignedUrls: {
    createDownload: oc
      .route({ method: 'POST', path: '/storage/presigned-urls/download', operationId: 'storage.presignedUrls.createDownload', summary: 'Create presigned download URL', tags: ['storage'] })
      .input(StoragePresignDownloadInputSchema)
      .output(StoragePresignedUrlOutputSchema),
    createUpload: oc
      .route({ method: 'POST', path: '/storage/presigned-urls/upload', operationId: 'storage.presignedUrls.createUpload', summary: 'Create presigned upload URL', tags: ['storage'] })
      .input(StoragePresignUploadInputSchema)
      .output(StoragePresignedUrlOutputSchema),
  },
  files: {
    list: oc
      .route({ method: 'GET', path: '/storage/files', operationId: 'storage.files.list', summary: 'List files', tags: ['storage'] })
      .input(StorageListFilesInputSchema)
      .output(StorageListFilesOutputSchema),
    getMetadata: oc
      .route({ method: 'POST', path: '/storage/files/metadata', operationId: 'storage.files.getMetadata', summary: 'Get file metadata', tags: ['storage'] })
      .input(StorageFileKeyInputSchema)
      .output(StorageFileMetadataOutputSchema),
    delete: oc
      .route({ method: 'DELETE', path: '/storage/files', operationId: 'storage.files.delete', summary: 'Delete file', tags: ['storage'] })
      .input(StorageFileKeyInputSchema)
      .output(StorageVoidOutputSchema),
    deleteMany: oc
      .route({ method: 'POST', path: '/storage/files/delete-many', operationId: 'storage.files.deleteMany', summary: 'Delete files', tags: ['storage'] })
      .input(StorageDeleteFilesInputSchema)
      .output(StorageVoidOutputSchema),
  },
}

export type StorageContract = typeof storageContract
