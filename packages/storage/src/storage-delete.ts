/** Local/S3 共用的批量删除结果构造。 */
import type { StorageDeleteResult, StorageDeleteSummary } from './storage-types.js'
import { ok } from '@h-ai/core'
import { storageM } from './storage-i18n.js'
import { HaiStorageError } from './storage-types.js'

/**
 * 仅在所有对象均确认删除时返回成功；失败时保留安全、可跨端传输的部分进度。
 * @param summary - 已确认成功与未完成的项目
 * @returns 批量删除结果，不抛业务异常
 * @example toStorageDeleteResult({ deletedKeys: ['a.txt'], failures: [] })
 */
export function toStorageDeleteResult(summary: StorageDeleteSummary): StorageDeleteResult {
  if (summary.failures.length === 0)
    return ok(summary)
  return {
    success: false,
    error: {
      ...HaiStorageError.OPERATION_FAILED,
      message: storageM('storage_deleteManyFailed', { params: { count: summary.failures.length } }),
      ext: { deleteMany: summary },
    },
  }
}
