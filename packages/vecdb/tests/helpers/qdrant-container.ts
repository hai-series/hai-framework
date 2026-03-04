/**
 * =============================================================================
 * @h-ai/vecdb - Qdrant 测试容器管理
 *
 * 使用 Testcontainers 启动 qdrant/qdrant 容器，提供 Qdrant 向量搜索引擎实例
 * 供集成测试使用。采用引用计数管理容器生命周期。
 * =============================================================================
 */

import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer, Wait } from 'testcontainers'

let containerPromise: Promise<StartedTestContainer> | null = null
let refCount = 0

/** Qdrant 容器租约，调用 release 归还 */
export interface QdrantContainerLease {
  url: string
  host: string
  httpPort: number
  grpcPort: number
  release: () => Promise<void>
}

/**
 * 申请一个 Qdrant 容器实例
 *
 * 首次调用时启动容器，后续调用复用同一容器（引用计数）。
 * 所有租约释放后自动销毁容器。
 */
export async function acquireQdrantContainer(): Promise<QdrantContainerLease> {
  refCount += 1

  if (!containerPromise) {
    containerPromise = new GenericContainer('qdrant/qdrant:latest')
      .withExposedPorts(6333, 6334)
      .withWaitStrategy(Wait.forLogMessage('Qdrant HTTP listening'))
      .start()
  }

  const container = await containerPromise
  const host = container.getHost()
  const httpPort = container.getMappedPort(6333)
  const grpcPort = container.getMappedPort(6334)

  return {
    url: `http://${host}:${httpPort}`,
    host,
    httpPort,
    grpcPort,
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
