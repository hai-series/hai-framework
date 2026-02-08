/**
 * =============================================================================
 * @hai/iam - Redis 测试容器管理
 * =============================================================================
 *
 * 复用与 @hai/cache 相同的 Redis 容器模式。
 */

import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer } from 'testcontainers'

let containerPromise: Promise<StartedTestContainer> | null = null
let refCount = 0

export interface RedisContainerLease {
  host: string
  port: number
  release: () => Promise<void>
}

export async function acquireRedisContainer(): Promise<RedisContainerLease> {
  refCount += 1

  if (!containerPromise) {
    containerPromise = new GenericContainer('redis:alpine')
      .withExposedPorts(6379)
      .start()
  }

  const container = await containerPromise
  const host = container.getHost()
  const port = container.getMappedPort(6379)

  return {
    host,
    port,
    release: async () => {
      refCount -= 1
      if (refCount <= 0) {
        refCount = 0
        await container.stop()
        containerPromise = null
      }
    },
  }
}
