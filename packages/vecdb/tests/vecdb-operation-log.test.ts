import type { LogRecord } from '@h-ai/core'
import type { VecdbOpsContext } from '../src/providers/vecdb-provider-base.js'
import type { VecdbOperationLogConfig } from '../src/vecdb-config.js'
import { core } from '@h-ai/core'
import { describe, expect, it, vi } from 'vitest'
import { HaiVecdbError, vecdb } from '../src/index.js'
import { createBaseVectorOps } from '../src/providers/vecdb-provider-base.js'

function setup(config: Partial<VecdbOperationLogConfig> = {}) {
  const ctx: VecdbOpsContext = {
    isConnected: () => true,
    operationLog: () => ({
      read: false,
      write: true,
      maxLength: 1000,
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
    insert: async () => core.ok(undefined),
    upsert: async () => core.ok(undefined),
    delete: async () => core.ok(undefined),
    search: async () => core.ok([]),
    count: async () => core.ok(0),
    scan: async () => core.ok({ items: [] }),
  })
  return { ops, logger: ctx.logger }
}

describe('vecdb operation log', () => {
  it('uses the Core threshold for safe summaries while retaining connection and operation errors', async () => {
    const initialLevel = core.logger.getLevel()
    const records: LogRecord[] = []
    const stop = core.logger.observe((record) => {
      if (record.context.module === 'vecdb')
        records.push(record)
    })
    const fetcher = vi.fn(async () => Response.json({
      status: 'ok',
      result: { collections: [] },
    }))
    vi.stubGlobal('fetch', fetcher)
    const config = {
      type: 'qdrant' as const,
      url: 'https://qdrant.example.test:6333',
      operationLog: { read: true, level: 'info' },
    }
    try {
      core.logger.setLevel('warn')
      fetcher.mockRejectedValueOnce(new Error('Controlled connection failure'))
      const rejected = await vecdb.init(config)
      expect(rejected).toMatchObject({
        success: false,
        error: { code: HaiVecdbError.CONNECTION_FAILED.code },
      })
      expect(records).toContainEqual(expect.objectContaining({ level: 'error', message: 'Vecdb module initialization failed' }))

      expect((await vecdb.init(config)).success).toBe(true)
      const summaries = () => records.filter(record => record.message === 'VecDB operation started')
      for (const level of ['warn', 'info'] as const) {
        core.logger.setLevel(level)
        expect(await vecdb.collection.list()).toMatchObject({ success: true, data: [] })
      }
      expect(summaries()).toEqual([])

      core.logger.setLevel('debug')
      expect(await vecdb.collection.list()).toMatchObject({ success: true, data: [] })
      expect(summaries()).toMatchObject([
        {
          level: 'debug',
          context: { category: 'read', operation: 'collection.list' },
        },
      ])

      core.logger.setLevel('warn')
      const secret = 'private-vecdb-log-test-value'
      fetcher.mockResolvedValueOnce(Response.json({ error: secret }, { status: 500 }))
      const failed = await core.context.run({ requestId: 'vecdb-log-threshold' }, () => vecdb.collection.list())
      expect(failed).toMatchObject({
        success: false,
        error: {
          code: HaiVecdbError.QUERY_FAILED.code,
          cause: { status: 500 },
        },
      })
      expect(records).toContainEqual(expect.objectContaining({
        level: 'error',
        message: 'Failed to list collections',
        context: expect.objectContaining({ requestId: 'vecdb-log-threshold', causeName: 'Error' }),
      }))
      expect(summaries()).toHaveLength(1)
      expect(JSON.stringify(records)).not.toContain(secret)
    }
    finally {
      stop()
      core.logger.setLevel(initialLevel)
      vi.unstubAllGlobals()
      await vecdb.close()
    }
  })

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
    expect(logger.debug).toHaveBeenNthCalledWith(1, 'VecDB operation started', {
      category: 'write',
      operation: 'vector.upsert',
      payload: JSON.stringify({ count: 1, dimension: 3 }),
    })
    expect(logger.debug).toHaveBeenNthCalledWith(2, 'VecDB operation started', {
      category: 'read',
      operation: 'vector.search',
      payload: JSON.stringify({ dimension: 3, topK: 5, hasFilter: true }),
    })
  })

  it.each([0, 8])('limits the safe summary to %i characters', async (maxLength) => {
    const { ops, logger } = setup({ maxLength })
    await ops.delete('docs', ['doc-1'])
    expect(logger.debug).toHaveBeenCalledWith('VecDB operation started', {
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
    expect(logger.debug).toHaveBeenCalledWith('VecDB operation started', {
      category: 'read',
      operation: 'vector.scan',
      payload: JSON.stringify({ limit: 2, hasCursor: true }),
    })
  })
})
