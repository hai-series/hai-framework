import type { VecdbOpsContext } from '../src/providers/vecdb-provider-base.js'
import { describe, expect, it, vi } from 'vitest'
import { logVecdbOperation } from '../src/providers/vecdb-provider-base.js'

function createContext(): VecdbOpsContext {
  return {
    isConnected: () => true,
    operationLog: () => ({ read: false, write: true, maxLength: 30, level: 'info' }),
    logger: {
      error: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      info: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      debug: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      trace: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
    },
  }
}

describe('vecdb operation log', () => {
  it('logs enabled write operations through context config', () => {
    const ctx = createContext()

    logVecdbOperation(ctx, 'write', 'vector.upsert', {
      collection: 'docs',
      documents: [{ id: '1', vector: [0.1, 0.2, 0.3], content: 'long content value' }],
    })

    expect(ctx.logger.info).toHaveBeenCalledOnce()
    expect(ctx.logger.info).toHaveBeenCalledWith('VecDB operation executed', {
      category: 'write',
      operation: 'vector.upsert',
      payload: expect.stringMatching(/^.{30}\.\.\.$/),
    })
  })

  it('does not log disabled read operations', () => {
    const ctx = createContext()

    logVecdbOperation(ctx, 'read', 'vector.search', { collection: 'docs' })

    expect(ctx.logger.info).not.toHaveBeenCalled()
    expect(ctx.logger.debug).not.toHaveBeenCalled()
    expect(ctx.logger.trace).not.toHaveBeenCalled()
  })
})
