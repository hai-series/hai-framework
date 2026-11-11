import type { HaiError, HaiResult } from '@h-ai/core'
import type { StorageProvider } from './providers/storage-provider-types.js'
import type { StorageOperationLogConfig } from './storage-config.js'
import { Buffer } from 'node:buffer'
import { getSystemErrorMessage } from 'node:util'
import { core, err, ok } from '@h-ai/core'
import { storageM } from './storage-i18n.js'
import { uploadWithSource } from './storage-stream.js'
import { HaiStorageError } from './storage-types.js'

const logger = core.logger.child({ module: 'storage', scope: 'operations' })
const ERROR_NAME = /^[\w:-]{1,80}$/
const FAILURE_REASONS: Readonly<Record<string, string>> = {
  [HaiStorageError.CONNECTION_FAILED.code]: 'Storage connection or cleanup failed',
  [HaiStorageError.OPERATION_FAILED.code]: 'Storage operation failed',
  [HaiStorageError.NOT_FOUND.code]: 'Storage object was not found',
  [HaiStorageError.ALREADY_EXISTS.code]: 'Destination object already exists',
  [HaiStorageError.PERMISSION_DENIED.code]: 'Storage access was denied',
  [HaiStorageError.QUOTA_EXCEEDED.code]: 'Storage quota or disk space was exhausted',
  [HaiStorageError.INVALID_PATH.code]: 'Storage path was invalid',
  [HaiStorageError.IO_ERROR.code]: 'Storage read or write failed',
  [HaiStorageError.NETWORK_ERROR.code]: 'Storage network request failed',
  [HaiStorageError.NOT_INITIALIZED.code]: 'Storage provider was not initialized',
  [HaiStorageError.UNSUPPORTED_TYPE.code]: 'Storage provider type was unsupported',
  [HaiStorageError.CONFIG_ERROR.code]: 'Storage configuration was invalid',
  [HaiStorageError.PRESIGN_FAILED.code]: 'Could not sign a storage URL',
  [HaiStorageError.UPLOAD_FAILED.code]: 'Could not read the upload source',
  [HaiStorageError.DOWNLOAD_FAILED.code]: 'Storage download failed',
  [HaiStorageError.CHECKSUM_FAILED.code]: 'Could not calculate the checksum',
  [HaiStorageError.INVALID_CHECKSUM.code]: 'Checksum input was invalid',
  [HaiStorageError.UNSUPPORTED_OPERATION.code]: 'Storage provider does not support this operation',
  [HaiStorageError.INVALID_LIST_OPTIONS.code]: 'Storage list options or cursor were invalid',
}

/**
 * Provider 对外的三组业务操作。
 * @example 模块内部上下文
 * ```ts
 * function inspect(operations: StorageOperations) { return operations.file.exists('fixture.txt') }
 * ```
 */
type StorageOperations = Pick<StorageProvider, 'file' | 'dir' | 'presign'>

/**
 * 与读写日志开关对应的操作类别。
 * @example 模块内部上下文
 * ```ts
 * const category: Category = 'write'
 * void category
 * ```
 */
type Category = 'read' | 'write'

/**
 * 允许进入操作摘要的数值信息。
 * @example 模块内部上下文
 * ```ts
 * const summary: Summary = { byteLength: 12 }
 * void summary
 * ```
 */
type Summary = Record<string, number | undefined>

/**
 * 仅提取可用于定位的错误码和上游状态，不记录对象键、签名 URL 或原始异常。
 * @example 模块内部上下文
 * ```ts
 * const fields = storageErrorContext(HaiStorageError.PERMISSION_DENIED.code, new Error('Access denied'))
 * void fields.code
 * ```
 */
export function storageErrorContext(code: HaiError['code'], cause?: unknown, cancelled = false): Record<string, unknown> {
  const details = cause && typeof cause === 'object'
    ? cause
    : {}
  const name = 'name' in details
    ? details.name
    : undefined
  const causeCode = 'code' in details && typeof details.code === 'string'
    ? details.code
    : name
  const errno = 'errno' in details
    ? details.errno
    : undefined
  const metadata = '$metadata' in details
    ? details.$metadata
    : undefined
  const status = typeof metadata === 'object' && metadata !== null && 'httpStatusCode' in metadata
    ? metadata.httpStatusCode
    : undefined
  const requestId = typeof metadata === 'object' && metadata !== null && 'requestId' in metadata
    ? metadata.requestId
    : undefined
  return {
    code,
    reason: cancelled || name === 'AbortError' || causeCode === 'ABORT_ERR'
      ? 'Storage operation was cancelled'
      : FAILURE_REASONS[code] ?? 'Storage operation failed',
    causeCode: typeof causeCode === 'string' && ERROR_NAME.test(causeCode)
      ? causeCode
      : undefined,
    systemReason: typeof errno === 'number' && Number.isInteger(errno) && errno < 0 && errno >= -2147483648
      ? getSystemErrorMessage(errno)
      : undefined,
    httpStatus: typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
      ? status
      : undefined,
    providerRequestId: typeof requestId === 'string' && ERROR_NAME.test(requestId)
      ? requestId
      : undefined,
  }
}

function warnFailure(operation: string, failure: Pick<HaiError, 'code' | 'cause' | 'ext'>, signal?: AbortSignal): void {
  const batch = failure.ext?.deleteMany
  const s3Operation = failure.ext?.s3Operation
  const cleanup = failure.ext?.cleanupError
  const cleanupContext = cleanup && typeof cleanup === 'object' && 'code' in cleanup
    && typeof cleanup.code === 'string' && ERROR_NAME.test(cleanup.code)
    ? storageErrorContext(cleanup.code, 'cause' in cleanup
        ? cleanup.cause
        : undefined)
    : undefined
  const failures = batch && typeof batch === 'object' && 'failures' in batch && Array.isArray(batch.failures)
    ? batch.failures
    : undefined
  logger.warn('Storage operation failed', {
    operation,
    ...storageErrorContext(failure.code, failure.cause, signal?.aborted && Object.is(failure.cause, signal.reason)),
    s3Operation: typeof s3Operation === 'string' && ERROR_NAME.test(s3Operation)
      ? s3Operation
      : undefined,
    cleanupError: cleanupContext,
    failedCount: failures?.length,
    failureCodes: failures && [
      ...new Set(failures.slice(0, 32).flatMap((item: unknown) => {
        if (typeof item === 'object' && item !== null && 'code' in item && typeof item.code === 'string' && ERROR_NAME.test(item.code))
          return [item.code]
        return []
      })),
    ],
  })
}

/**
 * 在调用方边界记录失败一次，保留原始结果及其诊断。
 * @example 模块内部上下文
 * ```ts
 * const result = await logStorageResult('file.exists', Promise.resolve(ok(false)))
 * if (result.success) void result.data
 * ```
 */
export async function logStorageResult<Value>(operation: string, pending: Promise<HaiResult<Value>>, signal?: AbortSignal): Promise<HaiResult<Value>> {
  const result = await pending.catch((cause: unknown) => err(HaiStorageError.OPERATION_FAILED, storageM('storage_operationFailed', {
    params: {
      error: cause instanceof Error
        ? cause.message
        : storageM('storage_unknownError'),
    },
  }), cause))
  if (!result.success)
    warnFailure(operation, result.error, signal)
  return result
}

async function* logReadStream(stream: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  try {
    yield* stream
  }
  catch (cause) {
    warnFailure('file.getStream', { code: HaiStorageError.DOWNLOAD_FAILED.code, cause })
    throw cause
  }
}

function debugOperation(config: StorageOperationLogConfig | undefined, category: Category, operation: string, summary?: Summary): void {
  if (!config?.[category])
    return
  const text = summary && config.maxLength > 0
    ? JSON.stringify(summary)
    : ''
  const payload = text.length > config.maxLength
    ? `${text.slice(0, config.maxLength)}...`
    : text
  logger.debug('Storage operation started', { category, operation, payload })
}

/**
 * 对外操作记录一次，Provider 内部的复制、分页和批量委托复用原操作。
 * @example 模块内部上下文
 * ```ts
 * function observe(provider: StorageProvider, config: StorageOperationLogConfig) {
 *   return withStorageOperationLogs(provider, config).file
 * }
 * ```
 */
export function withStorageOperationLogs(provider: StorageOperations, config?: StorageOperationLogConfig): StorageOperations {
  const { file, dir, presign } = provider
  function run<Value>(category: Category, operation: string, invoke: () => Promise<HaiResult<Value>>, summary?: Summary): Promise<HaiResult<Value>> {
    debugOperation(config, category, operation, summary)
    return logStorageResult(operation, invoke())
  }

  return {
    file: {
      put(key, data, options) {
        debugOperation(config, 'write', 'file.put', {
          byteLength: typeof data === 'string'
            ? Buffer.byteLength(data)
            : data instanceof Uint8Array
              ? data.byteLength
              : undefined,
        })
        return logStorageResult('file.put', uploadWithSource(data, options?.signal, input => file.put(key, input, options)), options?.signal)
      },
      get: (key, options) => run('read', 'file.get', () => file.get(key, options)),
      async getStream(key, options) {
        const result = await run('read', 'file.getStream', () => file.getStream(key, options))
        return result.success
          ? ok(logReadStream(result.data))
          : result
      },
      head: key => run('read', 'file.head', () => file.head(key)),
      exists: key => run('read', 'file.exists', () => file.exists(key)),
      delete: key => run('write', 'file.delete', () => file.delete(key)),
      deleteMany: keys => run('write', 'file.deleteMany', () => file.deleteMany(keys), { count: keys.length }),
      copy: (source, destination, options) => run('write', 'file.copy', () => file.copy(source, destination, options)),
    },
    dir: {
      list: options => run('read', 'dir.list', () => dir.list(options), { maxKeys: options?.maxKeys }),
      delete: prefix => run('write', 'dir.delete', () => dir.delete(prefix)),
    },
    presign: {
      getUrl: (key, options) => run('read', 'presign.getUrl', () => presign.getUrl(key, options)),
      putUrl: (key, options) => run('write', 'presign.putUrl', () => presign.putUrl(key, options)),
      publicUrl(key) {
        debugOperation(config, 'read', 'presign.publicUrl')
        return presign.publicUrl(key)
      },
    },
  }
}
