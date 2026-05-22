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
import type { ServMessageKey } from '../serv-i18n.js'
import { storageContract } from '@h-ai/api-contract'
import { err, HaiCommonError, ok } from '@h-ai/core'
import { implement } from '@orpc/server'
import { servM } from '../serv-i18n.js'
import { requireAuth } from '../serv-pipeline.js'
import { mapHaiResult } from './serv-feature-helpers.js'

const STORAGE_KEY_MAX_LENGTH = 1024

function buildStorageKeyValidationFailure(
  field: string,
  locale: string,
  messageKey: ServMessageKey,
  params?: Record<string, string | number>,
): HaiResult<never> {
  const message = servM(messageKey, { locale, params })
  return err(
    HaiCommonError.VALIDATION_ERROR,
    servM('serv_validationFailed', { locale }),
    [{ field, message }],
  )
}

/**
 * 对业务层再次校验存储 key 是否安全。
 *
 * 这里不额外构造 Zod schema，而是直接按业务规则返回统一的
 * `HaiResult + ValidationFormError[]` 形态，避免把简单路径安全规则包装得过重。
 */
function validateStorageKeyOrFail(key: string, locale: string, field: string = 'key'): HaiResult<string> {
  if (key.trim() === '')
    return buildStorageKeyValidationFailure(field, locale, 'serv_storageKeyRequired')
  if (key.length > STORAGE_KEY_MAX_LENGTH) {
    return buildStorageKeyValidationFailure(field, locale, 'serv_storageKeyTooLong', {
      max: STORAGE_KEY_MAX_LENGTH,
    })
  }
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0'))
    return buildStorageKeyValidationFailure(field, locale, 'serv_storageKeyIllegalChars')
  if (key.split('/').some(seg => seg === '.' || seg === '..'))
    return buildStorageKeyValidationFailure(field, locale, 'serv_storageKeyDotSegments')
  return ok(key)
}

function validateStorageKeysOrFail(keys: string[], locale: string): HaiResult<string[]> {
  for (const [index, key] of keys.entries()) {
    const keyResult = validateStorageKeyOrFail(key, locale, `keys.${index}`)
    if (!keyResult.success)
      return keyResult
  }
  return ok(keys)
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
      createDownload: p.presignedUrls.createDownload.handler(requireAuth<StoragePresignDownloadInput, PresignedResponse>(async ({ input, context }) => {
        const keyResult = validateStorageKeyOrFail(input.key, context.locale)
        if (!keyResult.success)
          return keyResult
        const expiresIn = input.expiresIn ?? 900
        return toPresignedResult(keyResult.data, expiresIn, await storage.presign.getUrl(keyResult.data, { expiresIn }))
      })),
      createUpload: p.presignedUrls.createUpload.handler(requireAuth<StoragePresignUploadInput, PresignedResponse>(async ({ input, context }) => {
        const keyResult = validateStorageKeyOrFail(input.key, context.locale)
        if (!keyResult.success)
          return keyResult
        const expiresIn = input.expiresIn ?? 900
        const contentType = input.contentType ?? 'application/octet-stream'
        const { key: _, ...options } = input
        return toPresignedResult(keyResult.data, expiresIn, await storage.presign.putUrl(keyResult.data, { ...options, expiresIn, contentType }))
      })),
    },
    files: {
      list: p.files.list.handler(requireAuth<StorageListFilesInput, ListResult>(({ input }) => storage.dir.list(input))),
      getMetadata: p.files.getMetadata.handler(requireAuth<StorageFileKeyInput, FileMetadata>(({ input, context }) => {
        const keyResult = validateStorageKeyOrFail(input.key, context.locale)
        if (!keyResult.success)
          return keyResult
        return storage.file.head(keyResult.data)
      })),
      delete: p.files.delete.handler(requireAuth<StorageFileKeyInput, void>(({ input, context }) => {
        const keyResult = validateStorageKeyOrFail(input.key, context.locale)
        if (!keyResult.success)
          return keyResult
        return storage.file.delete(keyResult.data)
      })),
      deleteMany: p.files.deleteMany.handler(requireAuth<StorageDeleteFilesInput, void>(({ input, context }) => {
        const keysResult = validateStorageKeysOrFail(input.keys, context.locale)
        if (!keysResult.success)
          return keysResult
        return storage.file.deleteMany(keysResult.data)
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
