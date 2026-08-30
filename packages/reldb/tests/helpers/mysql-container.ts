/**
 * =============================================================================
 * @h-ai/reldb - MySQL 测试容器管理
 * =============================================================================
 */

import type { StartedTestContainer } from 'testcontainers'
import { GenericContainer, Wait } from 'testcontainers'

let containerPromise: Promise<StartedTestContainer> | null = null
let refCount = 0

export interface MysqlContainerLease {
  host: string
  port: number
  database: string
  user: string
  password: string
  release: () => Promise<void>
}

const MYSQL_DATABASE = 'db_test'
const MYSQL_USER = 'root'
const MYSQL_PASSWORD = 'db_password'
const CONTAINER_STOP_TIMEOUT_MS = 10_000

export async function acquireMysqlContainer(): Promise<MysqlContainerLease> {
  refCount += 1

  if (!containerPromise) {
    containerPromise = new GenericContainer('mysql:8')
      .withExposedPorts(3306)
      .withEnvironment({
        MYSQL_DATABASE,
        MYSQL_ROOT_PASSWORD: MYSQL_PASSWORD,
      })
      // 只接受最终 TCP 服务的就绪日志；初始化用的临时服务器端口为 0。
      .withWaitStrategy(Wait.forLogMessage(/ready for connections\..*port: 3306/))
      .withStartupTimeout(120_000)
      .start()
  }

  const container = await containerPromise
  const host = container.getHost()
  const port = container.getMappedPort(3306)

  return {
    host,
    port,
    database: MYSQL_DATABASE,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    release: async () => {
      refCount -= 1
      if (refCount <= 0) {
        refCount = 0
        containerPromise = null
        // Docker Desktop 偶发会让 stop 请求长期挂起；显式限制等待时间，避免拖死整仓测试。
        await container.stop({
          timeout: CONTAINER_STOP_TIMEOUT_MS,
          remove: true,
          removeVolumes: true,
        })
      }
    },
  }
}
