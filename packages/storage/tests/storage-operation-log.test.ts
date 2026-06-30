import { describe, expect, it, vi } from 'vitest'
import { logStorageOperation } from '../src/providers/storage-operation-log.js'

function createLogger() {
  return {
    info: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
    debug: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
    trace: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
  }
}

describe('storage operation log', () => {
  it('logs enabled write operations and normalizes binary payloads', () => {
    const logger = createLogger()

    logStorageOperation(
      logger,
      { read: false, write: true, maxLength: 1000, level: 'debug' },
      'write',
      'file.put',
      { key: 'a.txt', body: new Uint8Array([1, 2, 3]) },
    )

    expect(logger.debug).toHaveBeenCalledWith('Storage operation executed', {
      category: 'write',
      operation: 'file.put',
      payload: '{"key":"a.txt","body":{"byteLength":3}}',
    })
  })

  it('does not log when config is missing', () => {
    const logger = createLogger()

    logStorageOperation(logger, undefined, 'read', 'file.get', { key: 'a.txt' })

    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.debug).not.toHaveBeenCalled()
    expect(logger.trace).not.toHaveBeenCalled()
  })
})
