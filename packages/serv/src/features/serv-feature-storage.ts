/**
 * @h-ai/serv — Storage 默认 procedures
 *
 * 基于 `@h-ai/storage` 提供开箱即用的 Storage procedures 实现：预签名 URL、列表、元数据、删除。
 * 通过 `createStorageProcedures(deps)` 组装后直接挂载到 oRPC router。
 *
 * **⚠️ 安全说明（必读）：**
 *
 * 1. **路径穿越防护**：内置 `validateStorageKey` 拒绝 `..`、绝对路径、反斜杠、NUL 字节等危险输入。
 * 2. **多租户 / 多用户隔离（需应用层实现）**：默认 procedure 仅做 `requireAuth`，**任何登录用户均可访问任意 key**。
 *    生产环境必须在外层重新装配这些 procedure，以强制用 `context.session.userId` 作为 key 前缀，例如：
 *    `users/${context.session.userId}/...`，并拒绝跳出该前缀的访问。
 * 3. **权限收紧**：推荐用 `serv.requirePermission('storage.files.read'|'storage.files.write')` 替换 `requireAuth`。
 * @module features/serv-feature-storage
 */

import type {
  StorageDeleteFilesInput,
  StorageFileKeyInput,
  StorageListFilesInput,
  StoragePresignDownloadInput,
  StoragePresignUploadInput,
} from '@h-ai/api-contract'
import type { HaiResult } from '@h-ai/core'
import type { FileMetadata, ListResult, StorageFunctions } from '@h-ai/storage'
import type { ServContext } from '../serv-context.js'
import { storageContract } from '@h-ai/api-contract'
import { err, HaiCommonError } from '@h-ai/core'
import { implement } from '@orpc/server'
import { requireAuth } from '../serv-pipeline.js'
import { mapHaiResult } from './serv-feature-helpers.js'

/**
 * 校验存储 key 是否安全。拒绝路径穿越与控制字符，避免记忆后端（FS / S3 前缀）被绕过。
 *
 * 拒绝规则：
 * - 空 / 纯空白
 * - 起始 `/` 或含 `\\`
 * - 含 NUL 字符（0x00 / `\\0`）
 * - 任何 path segment 为 `..` 或 `.`
 * - 超过 1024 字符
 */
function validateStorageKey(key: string): HaiResult<string> | null {
  if (!key || key.trim() === '')
    return err(HaiCommonError.VALIDATION_ERROR, 'Storage key must not be empty')
  if (key.length > 1024)
    return err(HaiCommonError.VALIDATION_ERROR, 'Storage key too long (max 1024 chars)')
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0'))
    return err(HaiCommonError.VALIDATION_ERROR, 'Storage key contains illegal characters')
  for (const seg of key.split('/')) {
    if (seg === '..' || seg === '.')
      return err(HaiCommonError.VALIDATION_ERROR, 'Storage key must not contain "." or ".." segments')
  }
  return null
}

/** Storage 默认 procedures 依赖。 */
export interface StorageProcedureDeps {
  readonly storage: StorageFunctions
}

interface PresignedResponse {
  readonly url: string
  readonly key: string
  readonly expiresAt?: Date
}

/** 创建 Storage 默认 procedures。 */
export function createStorageProcedures(deps: StorageProcedureDeps) {
  const p = implement(storageContract).$context<ServContext>()
  const { storage } = deps

  return p.router({
    presignedUrls: {
      createDownload: p.presignedUrls.createDownload.handler(requireAuth<StoragePresignDownloadInput, PresignedResponse>(async ({ input }) => {
        const invalid = validateStorageKey(input.key)
        if (invalid)
          return invalid as HaiResult<PresignedResponse>
        const expiresIn = input.expiresIn ?? 900
        return toPresignedResult(input.key, expiresIn, await storage.presign.getUrl(input.key, { expiresIn }))
      })),
      createUpload: p.presignedUrls.createUpload.handler(requireAuth<StoragePresignUploadInput, PresignedResponse>(async ({ input }) => {
        const invalid = validateStorageKey(input.key)
        if (invalid)
          return invalid as HaiResult<PresignedResponse>
        const expiresIn = input.expiresIn ?? 900
        const contentType = input.contentType ?? 'application/octet-stream'
        return toPresignedResult(input.key, expiresIn, await storage.presign.putUrl(input.key, { ...input, expiresIn, contentType }))
      })),
    },
    files: {
      list: p.files.list.handler(requireAuth<StorageListFilesInput, ListResult>(({ input }) => storage.dir.list(input))),
      getMetadata: p.files.getMetadata.handler(requireAuth<StorageFileKeyInput, FileMetadata>(({ input }) => {
        const invalid = validateStorageKey(input.key)
        if (invalid)
          return invalid as HaiResult<FileMetadata>
        return storage.file.head(input.key)
      })),
      delete: p.files.delete.handler(requireAuth<StorageFileKeyInput, void>(({ input }) => {
        const invalid = validateStorageKey(input.key)
        if (invalid)
          return invalid as HaiResult<void>
        return storage.file.delete(input.key)
      })),
      deleteMany: p.files.deleteMany.handler(requireAuth<StorageDeleteFilesInput, void>(({ input }) => {
        for (const k of input.keys) {
          const invalid = validateStorageKey(k)
          if (invalid)
            return invalid as HaiResult<void>
        }
        return storage.file.deleteMany(input.keys)
      })),
    },
  })
}

function toPresignedResult(key: string, expiresIn: number | undefined, result: HaiResult<string>): HaiResult<PresignedResponse> {
  return mapHaiResult(result, url => ({
    url,
    key,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
  }))
}
