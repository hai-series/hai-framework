/**
 * =============================================================================
 * @h-ai/cache - 测试套件辅助
 * =============================================================================
 */

import type { CacheConfigInput } from '../../src/index.js'
import { afterAll, afterEach, beforeAll, beforeEach, describe } from 'vitest'
import { cache } from '../../src/index.js'
import { acquireRedisContainer } from './redis-container.js'

export interface CacheTestEnv {
  config: CacheConfigInput
  release?: () => Promise<void>
}

export function defineCacheSuite(
  label: string,
  setup: () => Promise<CacheTestEnv> | CacheTestEnv,
  defineTests: () => void,
): void {
  describe.sequential(`cache (${label})`, () => {
    let env: CacheTestEnv | null = null

    beforeAll(async () => {
      env = await setup()
    }, 120000)

    beforeEach(async () => {
      await cache.close()
      const initResult = await cache.init(env!.config)
      if (!initResult.success) {
        throw new Error(`cache init failed: ${initResult.error.code} ${initResult.error.message}`)
      }

      const keysResult = await cache.kv.keys('*')
      if (!keysResult.success) {
        throw new Error(`cache cleanup list failed: ${keysResult.error.code} ${keysResult.error.message}`)
      }

      if (keysResult.data.length > 0) {
        const deleteResult = await cache.kv.del(...keysResult.data)
        if (!deleteResult.success) {
          throw new Error(`cache cleanup delete failed: ${deleteResult.error.code} ${deleteResult.error.message}`)
        }
      }
    }, 60000)

    afterEach(async () => {
      await cache.close()
    })

    afterAll(async () => {
      await env?.release?.()
      env = null
    }, 120000)

    defineTests()
  })
}

export function memoryEnv(): CacheTestEnv {
  return { config: { type: 'memory' } }
}

export async function redisEnv(): Promise<CacheTestEnv> {
  const lease = await acquireRedisContainer()
  return {
    config: {
      type: 'redis',
      host: lease.host,
      port: lease.port,
      db: 0,
    },
    release: lease.release,
  }
}
