/** Local/S3 共用的批量删除与前缀删除。 */
import type { HaiResult } from '@h-ai/core'
import type { DirOperations, FileOperations, StorageDeleteResult, StorageDeleteSummary } from './storage-types.js'
import { ok } from '@h-ai/core'
import { storageM } from './storage-i18n.js'
import { HaiStorageError } from './storage-types.js'

/**
 * 按对象键的字符串前缀逐页删除，保留列举或批量删除返回的失败详情。
 * @param prefix - 空字符串匹配容器内的所有对象。
 * @param list - Provider 的无分隔符列表操作。
 * @param deleteMany - Provider 的批量删除操作。
 * @returns 所有匹配对象均已处理时返回成功。
 * @example 模块内部上下文
 * ```ts
 * async function removeDrafts(dir: DirOperations, file: FileOperations) {
 *   const result = await deleteStoragePrefix('uploads/draft-', dir.list, file.deleteMany)
 *   if (!result.success) throw new Error(result.error.message)
 * }
 * ```
 */
export async function deleteStoragePrefix(prefix: string, list: DirOperations['list'], deleteMany: FileOperations['deleteMany']): Promise<HaiResult<void>> {
  let continuationToken: string | undefined
  do {
    const page = await list({ prefix, continuationToken, maxKeys: 1000 })
    if (!page.success)
      return page
    if (page.data.files.length) {
      const deleted = await deleteMany(page.data.files.map(file => file.key))
      if (!deleted.success)
        return deleted
    }
    continuationToken = page.data.nextContinuationToken
  } while (continuationToken)
  return ok(undefined)
}

/**
 * 仅在所有对象均确认删除时返回成功；失败时保留安全、可跨端传输的部分进度。
 * @param summary - 已确认成功与未完成的项目
 * @returns 批量删除结果，不抛业务异常
 * @example 模块内部上下文
 * ```ts
 * const result = toStorageDeleteResult({ deletedKeys: ['a.txt'], failures: [] })
 * if (!result.success) throw new Error(result.error.message)
 * void result.data.deletedKeys
 * ```
 */
export function toStorageDeleteResult(summary: StorageDeleteSummary): StorageDeleteResult {
  if (summary.failures.length === 0)
    return ok(summary)
  return {
    success: false,
    error: {
      ...HaiStorageError.OPERATION_FAILED,
      message: storageM('storage_deleteManyFailed', {
        params: { count: summary.failures.length },
      }),
      ext: { deleteMany: summary },
    },
  }
}
