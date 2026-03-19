import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheErrorCode } from '../src/cache-config.js'

const redisMocks = vi.hoisted(() => {
  const connect = vi.fn()
  const ping = vi.fn()
  const disconnect = vi.fn()
  const quit = vi.fn()

  class MockRedis {
    connect(): unknown {
      return connect()
    }
    ping(): unknown {
      return ping()
    }
    disconnect(reconnect?: boolean): unknown {
      return disconnect(reconnect)
    }
    quit(): unknown {
      return quit()
    }
  }

  class MockRedisCluster {
    connect(): unknown {
      return connect()
    }
    ping(): unknown {
      return ping()
    }
    disconnect(reconnect?: boolean): unknown {
      return disconnect(reconnect)
    }
    quit(): unknown {
      return quit()
    }
  }

  Object.assign(MockRedis, { Cluster: MockRedisCluster })

  return {
    connect,
    ping,
    disconnect,
    quit,
    MockRedis,
  }
})

vi.mock('ioredis', () => ({
  default: redisMocks.MockRedis,
}))

import { createRedisProvider } from '../src/providers/cache-provider-redis.js'

describe('cache redis provider connect cleanup', () => {
  const baseConfig = {
    type: 'redis' as const,
    url: 'redis://127.0.0.1:6379/0',
    connectTimeout: 1000,
    commandTimeout: 1000,
    keyPrefix: '',
    maxRetries: 1,
    retryDelay: 1,
    host: '127.0.0.1',
    port: 6379,
    password: undefined,
    db: 0,
    tls: false,
    readOnly: false,
    cluster: [],
    sentinel: undefined,
  }

  beforeEach(() => {
    redisMocks.connect.mockReset()
    redisMocks.ping.mockReset()
    redisMocks.disconnect.mockReset()
    redisMocks.quit.mockReset()
  })

  it('connect 失败时应清理连接并保持未连接状态', async () => {
    redisMocks.connect.mockRejectedValueOnce(new Error('connect failed'))

    const provider = createRedisProvider()
    const result = await provider.connect(baseConfig)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.CONNECTION_FAILED)
    }
    expect(redisMocks.disconnect).toHaveBeenCalledTimes(1)
    expect(redisMocks.disconnect).toHaveBeenCalledWith(false)
    expect(provider.isConnected()).toBe(false)
  })

  it('ping 失败时也应清理连接并保持未连接状态', async () => {
    redisMocks.connect.mockResolvedValueOnce(undefined)
    redisMocks.ping.mockRejectedValueOnce(new Error('ping failed'))

    const provider = createRedisProvider()
    const result = await provider.connect(baseConfig)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(CacheErrorCode.CONNECTION_FAILED)
    }
    expect(redisMocks.disconnect).toHaveBeenCalledTimes(1)
    expect(redisMocks.disconnect).toHaveBeenCalledWith(false)
    expect(provider.isConnected()).toBe(false)
  })
})
