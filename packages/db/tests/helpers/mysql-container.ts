/**
 * =============================================================================
 * @hai/db - MySQL 测试容器管理
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

export async function acquireMysqlContainer(): Promise<MysqlContainerLease> {
  refCount += 1

  if (!containerPromise) {
    containerPromise = new GenericContainer('mysql:8')
      .withExposedPorts(3306)
      .withEnvironment({
        MYSQL_DATABASE,
        MYSQL_ROOT_PASSWORD: MYSQL_PASSWORD,
      })
      .withWaitStrategy(Wait.forLogMessage('ready for connections'))
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
        await container.stop()
        containerPromise = null
      }
    },
  }
}
