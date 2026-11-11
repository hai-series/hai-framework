import type { HaiError, HaiResult } from '@h-ai/core'
import type { StorageProvider } from './providers/storage-provider-types.js'
import type { StorageOperationLogConfig } from './storage-config.js'
import { Buffer } from 'node:buffer'
import { core, ok } from '@h-ai/core'
import { HaiStorageError } from './storage-types.js'

const logger = core.logger.child({ module: 'storage', scope: 'operations' })
const ERROR_NAME = /^[\w-]{1,80}$/

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
export function storageErrorContext(code: HaiError['code'], cause?: unknown): Record<string, unknown> {
  if (typeof cause !== 'object' || cause === null)
    return { code }
  const reason = 'code' in cause
    ? cause.code
    : ('name' in cause
        ? cause.name
        : undefined)
  const metadata = '$metadata' in cause
    ? cause.$metadata
    : undefined
  const status = typeof metadata === 'object' && metadata !== null && 'httpStatusCode' in metadata
    ? metadata.httpStatusCode
    : undefined
  return {
    code,
    causeCode: typeof reason === 'string' && ERROR_NAME.test(reason)
      ? reason
      : undefined,
    httpStatus: typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
      ? status
      : undefined,
  }
}

function warnFailure(operation: string, code: HaiError['code'], cause?: unknown): void {
  logger.warn('Storage operation failed', {
    operation,
    ...storageErrorContext(code, cause),
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
export async function logStorageResult<Result extends HaiResult<unknown>>(operation: string, pending: Promise<Result>): Promise<Result> {
  let result: Result
  try {
    result = await pending
  }
  catch (cause) {
    warnFailure(operation, HaiStorageError.OPERATION_FAILED.code, cause)
    throw cause
  }
  if (!result.success)
    warnFailure(operation, result.error.code, result.error.cause)
  return result
}

async function* logReadStream(stream: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  try {
    yield* stream
  }
  catch (cause) {
    warnFailure('file.getStream', HaiStorageError.OPERATION_FAILED.code, cause)
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
  function run<Result extends HaiResult<unknown>>(category: Category, operation: string, invoke: () => Promise<Result>, summary?: Summary): Promise<Result> {
    debugOperation(config, category, operation, summary)
    return logStorageResult(operation, invoke())
  }

  return {
    file: {
      put: (key, data, options) => run('write', 'file.put', () => file.put(key, data, options), {
        byteLength: typeof data === 'string'
          ? Buffer.byteLength(data)
          : data instanceof Uint8Array
            ? data.byteLength
            : undefined,
      }),
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
