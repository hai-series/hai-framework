import { StorageKeySchema } from '@h-ai/storage/schemas'
import { z } from 'zod'
import { haiResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import { StorageFileKeyInputSchema, StorageFileMetadataSchema } from './storage-schemas.js'

/**
 * Storage 中转接口允许的单文件最大字节数，multipart 请求仍须预留封装开销。
 * @example
 * ```ts
 * import { STORAGE_PROXY_MAX_FILE_BYTES } from '@h-ai/api-contract'
 * const fits = new File(['hello'], 'note.txt').size <= STORAGE_PROXY_MAX_FILE_BYTES
 * void fits
 * ```
 */
export const STORAGE_PROXY_MAX_FILE_BYTES = 5 * 1024 * 1024

/**
 * 中转上传的 multipart 字段。应用授权 `key` 后才会尝试创建对象。
 * @example
 * ```ts
 * import { StorageUploadFileInputSchema } from '@h-ai/api-contract'
 * const input = StorageUploadFileInputSchema.parse({ key: 'users/user-1/note.txt', file: new File(['hello'], 'note.txt', { type: 'text/plain' }) })
 * void input
 * ```
 */
export const StorageUploadFileInputSchema = z.strictObject({
  key: StorageKeySchema,
  file: z.file().min(1).max(STORAGE_PROXY_MAX_FILE_BYTES),
})

/**
 * 由应用显式挂载的文件中转契约。适用于本地存储或需要应用中转的小文件。
 * @example
 * ```ts
 * import { apiContract } from '@h-ai/api-contract'
 * const contract = apiContract.create({ storageTransfer: apiContract.extensions.storage })
 * void contract.storageTransfer.files.upload
 * ```
 */
export const storageExtensionContract = {
  files: {
    upload: route({
      method: 'POST',
      path: '/storage/files/upload',
      operationId: 'storage.files.upload',
      summary: 'Upload a file through the application',
      tags: ['storage'],
    })
      .input(StorageUploadFileInputSchema)
      .output(haiResultSchema(StorageFileMetadataSchema)),
    download: route({
      method: 'GET',
      path: '/storage/files/download',
      operationId: 'storage.files.download',
      summary: 'Download a file through the application',
      tags: ['storage'],
    })
      .input(StorageFileKeyInputSchema)
      .output(z.file().max(STORAGE_PROXY_MAX_FILE_BYTES)),
  },
}

/**
 * 显式挂载的文件中转契约类型。
 * @example
 * ```ts
 * import { type StorageExtensionContract, apiContract } from '@h-ai/api-contract'
 * const contract: StorageExtensionContract = apiContract.extensions.storage
 * void contract
 * ```
 */
export type StorageExtensionContract = typeof storageExtensionContract
