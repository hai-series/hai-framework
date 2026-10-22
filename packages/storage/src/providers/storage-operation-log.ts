import type { StorageOperationLogConfig } from '../storage-config.js'

/**
 * 存储 Provider 所需的最小结构化日志接口。
 * @example 模块内部上下文
 * ```ts
 * function emit(logger: StorageOperationLogger) {
 *   logger.debug('Storage operation executed', { count: 1 })
 * }
 * ```
 */
interface StorageOperationLogger {
  info: (message: string, context?: Record<string, unknown>) => void
  debug: (message: string, context?: Record<string, unknown>) => void
  trace: (message: string, context?: Record<string, unknown>) => void
}

/**
 * 选择存储操作日志 read/write 开关的内部分类。
 * @example 模块内部上下文
 * ```ts
 * const category: StorageOperationCategory = 'write'
 * void category
 * ```
 */
type StorageOperationCategory = 'read' | 'write'

function normalizePayloadValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { byteLength: value.byteLength }
  }
  return value
}

function stringifyOperationPayload(payload: unknown, maxLength: number): string {
  if (maxLength <= 0) {
    return ''
  }

  try {
    const text = JSON.stringify(payload, (_key, value: unknown) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }
      if (typeof value === 'function') {
        return '[Function]'
      }
      return normalizePayloadValue(value)
    })
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
  catch {
    const text = String(payload)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  }
}

/**
 * 按配置输出有界操作摘要；字节内容只记录长度，不接管连接生命周期。
 * @param logger - 当前 Provider 的结构化日志器。
 * @param config - 已解析的日志开关和长度配置；未设置时不输出。
 * @param category - read 或 write，对应日志开关。
 * @param operation - 稳定的操作名称。
 * @param payload - 诊断摘要；不传入凭据或原始文件内容。
 * @example 模块内部上下文
 * ```ts
 * function emit(logger: StorageOperationLogger) {
 *   logStorageOperation(logger, { read: false, write: true, level: 'debug', maxLength: 100 }, 'write', 'file.put', { bytes: 5 })
 * }
 * ```
 */
export function logStorageOperation(
  logger: StorageOperationLogger,
  config: StorageOperationLogConfig | undefined,
  category: StorageOperationCategory,
  operation: string,
  payload: unknown,
): void {
  if (!config?.[category]) {
    return
  }

  logger[config.level]('Storage operation executed', {
    category,
    operation,
    payload: stringifyOperationPayload(payload, config.maxLength),
  })
}
