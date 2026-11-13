import type { VecdbOpsContext } from '../src/providers/vecdb-provider-base.js'
import type { VecdbOperationLogConfig } from '../src/vecdb-config.js'
import { ok } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { createBaseVectorOps } from '../src/providers/vecdb-provider-base.js'

function setup(config: Partial<VecdbOperationLogConfig> = {}) {
  const ctx: VecdbOpsContext = {
    isConnected: () => true,
    operationLog: () => ({
      read: false,
      write: true,
      maxLength: 1000,
      level: 'info',
      ...config,
    }),
    logger: {
      error: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      info: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      debug: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
      trace: vi.fn<(message: string, context?: Record<string, unknown>) => void>(),
    },
  }
  const ops = createBaseVectorOps(ctx, {
    insert: async () => ok(undefined),
    upsert: async () => ok(undefined),
    delete: async () => ok(undefined),
    search: async () => ok([]),
    count: async () => ok(0),
    scan: async () => ok({ items: [] }),
  })
  return { ops, logger: ctx.logger }
}

describe('vecdb operation log', () => {
  it('records counts and dimensions without storing document contents, metadata or filter values', async () => {
    const { ops, logger } = setup({ read: true })
    await expect(ops.upsert('private-collection', [
      {
        id: 'private-id',
        vector: [0.1, 0.2, 0.3],
        content: 'private-content',
        metadata: { value: 'private-metadata' },
      },
    ])).resolves.toMatchObject({ success: true })
    await expect(ops.search('private-collection', [0.1, 0.2, 0.3], {
      topK: 5,
      filter: { tenant: 'private-filter' },
    })).resolves.toMatchObject({ success: true })
    expect(logger.info).toHaveBeenNthCalledWith(1, 'VecDB operation started', {
      category: 'write',
      operation: 'vector.upsert',
      payload: JSON.stringify({ count: 1, dimension: 3 }),
    })
    expect(logger.info).toHaveBeenNthCalledWith(2, 'VecDB operation started', {
      category: 'read',
      operation: 'vector.search',
      payload: JSON.stringify({ dimension: 3, topK: 5, hasFilter: true }),
    })
  })

  it.each([0, 8])('limits the safe summary to %i characters', async (maxLength) => {
    const { ops, logger } = setup({ maxLength })
    await ops.delete('docs', ['doc-1'])
    expect(logger.info).toHaveBeenCalledWith('VecDB operation started', {
      category: 'write',
      operation: 'vector.delete',
      payload: JSON.stringify({ count: 1 }).slice(0, maxLength),
    })
  })

  it('does not log disabled read operations', async () => {
    const { ops, logger } = setup()
    await ops.search('docs', [1])
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.debug).not.toHaveBeenCalled()
    expect(logger.trace).not.toHaveBeenCalled()
  })

  it('records scan page size without exposing the cursor', async () => {
    const { ops, logger } = setup({ read: true })
    await ops.scan('private-collection', { cursor: 'private-cursor', limit: 2 })
    expect(logger.info).toHaveBeenCalledWith('VecDB operation started', {
      category: 'read',
      operation: 'vector.scan',
      payload: JSON.stringify({ limit: 2, hasCursor: true }),
    })
  })
})
