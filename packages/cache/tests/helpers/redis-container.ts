/**
 * =============================================================================
 * @h-ai/cache - Redis 测试容器管理
 * =============================================================================
 */

import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer, Wait } from 'testcontainers'

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
      // Redis 明确输出就绪日志；避免 Podman 的内部端口 exec 探测挂起。
      // 后续 cache.init 仍会建立真实连接验证服务可达。
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start()
  }

  let container: StartedTestContainer
  try {
    container = await containerPromise
  }
  catch (error) {
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0)
      containerPromise = null
    throw error
  }
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
