/**
 * =============================================================================
 * @hai/cache - 测试套件辅助
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
    })

    beforeEach(async () => {
      await cache.close()
      await cache.init(env!.config)
    })

    afterEach(async () => {
      await cache.close()
    })

    afterAll(async () => {
      await env?.release?.()
      env = null
    })

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
