import type {
  StorageDeleteFilesInput,
  StorageFileKeyInput,
  StorageListFilesInput,
  StoragePresignDownloadInput,
  StoragePresignUploadInput,
} from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { FileMetadata, ListResult, StorageFunctions } from '@h-ai/storage'
import type { ServContext } from '../context/context-types.js'
import { storageContract } from '@h-ai/api-contract'
import { ok } from '@h-ai/core'
import { implement } from '@orpc/server'
import { requireAuth } from '../pipeline/orpc.js'

/** Storage 默认 procedures 依赖。 */
export interface StorageProcedureDeps {
  readonly storage: StorageFunctions
}

/** 创建 Storage 默认 procedures。 */
export function createStorageProcedures(deps: StorageProcedureDeps) {
  const p = implement(storageContract).$context<ServContext>()

  return p.router({
    presignedUrls: {
      createDownload: p.presignedUrls.createDownload.handler(requireAuth<StoragePresignDownloadInput, { url: string, key: string, expiresAt?: Date }>(async ({ input }) => {
        const expiresIn = input.expiresIn ?? 900
        return toPresignedUrlResult(input.key, expiresIn, await deps.storage.presign.getUrl(input.key, { expiresIn }))
      })),
      createUpload: p.presignedUrls.createUpload.handler(requireAuth<StoragePresignUploadInput, { url: string, key: string, expiresAt?: Date }>(async ({ input }) => {
        const expiresIn = input.expiresIn ?? 900
        const contentType = input.contentType ?? 'application/octet-stream'
        return toPresignedUrlResult(input.key, expiresIn, await deps.storage.presign.putUrl(input.key, { ...input, expiresIn, contentType }))
      })),
    },
    files: {
      list: p.files.list.handler(requireAuth<StorageListFilesInput, ListResult>(async ({ input }) => {
        return deps.storage.dir.list(input)
      })),
      getMetadata: p.files.getMetadata.handler(requireAuth<StorageFileKeyInput, FileMetadata>(async ({ input }) => {
        return deps.storage.file.head(input.key)
      })),
      delete: p.files.delete.handler(requireAuth<StorageFileKeyInput, void>(async ({ input }) => {
        return deps.storage.file.delete(input.key)
      })),
      deleteMany: p.files.deleteMany.handler(requireAuth<StorageDeleteFilesInput, void>(async ({ input }) => {
        return deps.storage.file.deleteMany(input.keys)
      })),
    },
  })
}

function toPresignedUrlResult(
  key: string,
  expiresIn: number | undefined,
  result: HaiResult<string>,
): HaiResult<{ url: string, key: string, expiresAt?: Date }> {
  if (!result.success) {
    return result
  }

  return ok({
    url: result.data,
    key,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
  })
}
