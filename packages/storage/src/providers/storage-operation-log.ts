import type { StorageOperationLogConfig } from '../storage-config.js'

interface StorageOperationLogger {
  info: (message: string, context?: Record<string, unknown>) => void
  debug: (message: string, context?: Record<string, unknown>) => void
  trace: (message: string, context?: Record<string, unknown>) => void
}

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
