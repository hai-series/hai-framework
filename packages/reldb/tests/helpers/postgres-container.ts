/**
 * =============================================================================
 * @h-ai/reldb - PostgreSQL 测试容器管理
 * =============================================================================
 */

import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer, Wait } from 'testcontainers'

let containerPromise: Promise<StartedTestContainer> | null = null
let refCount = 0

export interface PostgresContainerLease {
  host: string
  port: number
  database: string
  user: string
  password: string
  release: () => Promise<void>
}

const POSTGRES_DB = 'db_test'
const POSTGRES_USER = 'db_user'
const POSTGRES_PASSWORD = 'db_password'

export async function acquirePostgresContainer(): Promise<PostgresContainerLease> {
  refCount += 1

  if (!containerPromise) {
    containerPromise = new GenericContainer('postgres:alpine')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_DB,
        POSTGRES_USER,
        POSTGRES_PASSWORD,
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
    database: POSTGRES_DB,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
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
