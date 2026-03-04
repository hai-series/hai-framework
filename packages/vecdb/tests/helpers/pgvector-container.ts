/**
 * =============================================================================
 * @h-ai/vecdb - pgvector 测试容器管理
 *
 * 使用 Testcontainers 启动 pgvector/pgvector:pg17 容器，提供带 vector 扩展的
 * PostgreSQL 实例供集成测试使用。采用引用计数管理容器生命周期。
 * =============================================================================
 */

import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer, Wait } from 'testcontainers'

let containerPromise: Promise<StartedTestContainer> | null = null
let refCount = 0

/** pgvector 容器租约，调用 release 归还 */
export interface PgvectorContainerLease {
  host: string
  port: number
  database: string
  user: string
  password: string
  release: () => Promise<void>
}

const PG_DB = 'vecdb_test'
const PG_USER = 'vecdb_user'
const PG_PASSWORD = 'vecdb_password'

/**
 * 申请一个 pgvector 容器实例
 *
 * 首次调用时启动容器，后续调用复用同一容器（引用计数）。
 * 所有租约释放后自动销毁容器。
 */
export async function acquirePgvectorContainer(): Promise<PgvectorContainerLease> {
  refCount += 1

  if (!containerPromise) {
    containerPromise = new GenericContainer('pgvector/pgvector:pg17')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_DB: PG_DB,
        POSTGRES_USER: PG_USER,
        POSTGRES_PASSWORD: PG_PASSWORD,
      })
      // PostgreSQL 在启动过程中会输出两次 "ready to accept connections"：
      // 第一次是模板数据库初始化，第二次才是服务器真正就绪
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .start()
  }

  const container = await containerPromise
  const host = container.getHost()
  const port = container.getMappedPort(5432)

  return {
    host,
    port,
    database: PG_DB,
    user: PG_USER,
    password: PG_PASSWORD,
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
