import { inspect } from 'node:util'
import { core } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cache, HaiCacheError } from '../src/index.js'

const redis = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  ping: vi.fn(),
  eval: vi.fn(),
  quit: vi.fn(),
}))

vi.mock('ioredis', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    default: class RedisFixture extends EventEmitter {
      status = 'ready'
      connect = redis.connect
      disconnect = redis.disconnect
      ping = redis.ping
      eval = redis.eval
      quit = redis.quit
    },
  }
})

const config = { type: 'redis' as const, host: 'cache.fixture.invalid' }
const marker = 'DIAGNOSTIC_FIXTURE_MARKER'

function driverError(prefix: string, name = 'ReplyError') {
  return Object.assign(new Error(`${prefix} ${marker}_MESSAGE`, {
    cause: new Error(`${marker}_CAUSE`),
  }), {
    name,
    code: `${marker}_CODE`,
    stack: `${marker}_STACK`,
    command: {
      name: 'eval',
      args: [`${marker}_COMMAND_ARGUMENT`],
    },
  })
}

describe('redis error diagnostics', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    redis.connect.mockResolvedValue(undefined)
    redis.ping.mockResolvedValue('PONG')
    redis.quit.mockResolvedValue('OK')
  })

  afterEach(async () => {
    expect((await cache.close()).success).toBe(true)
  })

  it.each([
    ['NOPERM', HaiCacheError.OPERATION_FAILED],
    ['CROSSSLOT', HaiCacheError.CROSS_SLOT],
  ] as const)('projects a command failure to safe diagnostics and preserves %s', async (driverCode, expected) => {
    expect((await cache.init(config)).success).toBe(true)
    redis.eval.mockRejectedValueOnce(driverError(driverCode))

    const result = await core.context.run({ traceId: 'cache.trace-1' }, () =>
      cache.kv.compareAndSwap('fixture', 'before', 'after'))

    expect(result).toMatchObject({
      success: false,
      error: {
        code: expected.code,
        cause: { causeName: 'ReplyError', causeCode: driverCode },
        traceId: 'cache.trace-1',
      },
    })
    expect(inspect(result, { depth: null })).not.toContain(marker)
  })

  it('omits unrecognized driver diagnostic names and codes', async () => {
    expect((await cache.init(config)).success).toBe(true)
    redis.eval.mockRejectedValueOnce(driverError(marker, marker))

    const result = await core.context.run({ requestId: 'cache-request-1' }, () =>
      cache.kv.compareAndSwap('fixture', 'before', 'after'))

    expect(result).toMatchObject({
      success: false,
      error: { code: HaiCacheError.OPERATION_FAILED.code, cause: {}, traceId: 'cache-request-1' },
    })
    expect(inspect(result, { depth: null })).not.toContain(marker)
  })

  it('projects connection and cleanup errors in results and logs', async () => {
    const observations: Array<{ message: string }> = []
    const stop = core.logger.observe(entry => observations.push(entry))
    const nodeError = driverError('WRONGPASS')
    const clusterError = Object.assign(driverError(marker, 'ClusterAllFailedError'), { lastNodeError: nodeError })
    const disconnectError = Object.assign(driverError(marker, 'Error'), { code: 'ECONNRESET' })
    redis.connect.mockRejectedValueOnce(clusterError)
    redis.disconnect.mockImplementationOnce(() => {
      throw disconnectError
    }).mockImplementationOnce(() => {
      throw disconnectError
    })

    try {
      const result = await core.context.run({ traceId: 'cache.trace-2' }, () => cache.init(config))

      expect(result).toMatchObject({
        success: false,
        error: {
          code: HaiCacheError.CONNECTION_FAILED.code,
          cause: { causeName: 'ReplyError', causeCode: 'WRONGPASS' },
          traceId: 'cache.trace-2',
          ext: {
            cleanupPending: true,
            cleanupError: {
              code: HaiCacheError.CONNECTION_FAILED.code,
              cause: { causeName: 'Error', causeCode: 'ECONNRESET' },
              traceId: 'cache.trace-2',
            },
          },
        },
      })
      expect(inspect(result, { depth: null })).not.toContain(marker)
      const failures = observations.filter(entry => /Redis connection failed|Provider cleanup failed/.test(entry.message))
      expect(failures).toHaveLength(2)
      const logged = inspect(failures, { depth: null })
      expect(logged).toContain('WRONGPASS')
      expect(logged).toContain('ECONNRESET')
      expect(logged).toContain('cache.trace-2')
      expect(logged).not.toContain(marker)
    }
    finally {
      stop()
    }
  })

  it('preserves serialization failures without retaining the original cause', async () => {
    expect((await cache.init(config)).success).toBe(true)
    const value = {
      toJSON() {
        throw new Error(marker)
      },
    }

    const result = await cache.kv.compareAndSwap('fixture', 'before', value)

    expect(result).toMatchObject({
      success: false,
      error: {
        code: HaiCacheError.SERIALIZATION_FAILED.code,
        cause: { causeName: 'CacheSerializationError' },
      },
    })
    expect(redis.eval).not.toHaveBeenCalled()
    expect(inspect(result, { depth: null })).not.toContain(marker)
  })
})
