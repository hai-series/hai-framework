/**
 * =============================================================================
 * @h-ai/reldb - 测试套件辅助
 * =============================================================================
 */

import type { ReldbConfigInput, ReldbFunctions } from '../../src/index.js'
import { afterAll, afterEach, beforeAll, beforeEach, describe } from 'vitest'
import { reldb } from '../../src/index.js'
import { acquireMysqlContainer } from './mysql-container.js'
import { acquirePostgresContainer } from './postgres-container.js'

export interface DbTestEnv {
  config: ReldbConfigInput
  release?: () => Promise<void>
}

async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForReady(database: ReldbFunctions, maxAttempts = 10, intervalMs = 2000): Promise<void> {
  let lastError: string | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ping = await database.sql.query('SELECT 1')
    if (ping.success) {
      return
    }
    lastError = ping.error.message
    await delay(intervalMs)
  }
  throw new Error(`db ping failed after ${maxAttempts} attempts: ${lastError ?? 'unknown error'}`)
}

export function defineDbSuite(
  label: string,
  setup: () => Promise<DbTestEnv> | DbTestEnv,
  defineTests: () => void,
  options: { resetConnection?: boolean, database?: ReldbFunctions } = {},
): void {
  const database = options.database ?? reldb
  describe.sequential(`db (${label})`, () => {
    let env: DbTestEnv | null = null

    beforeAll(async () => {
      env = await setup()
    }, 300000)

    beforeEach(async () => {
      // 网络数据库本就保留同一份表数据；普通 SQL/DDL 场景复用池，事务和生命周期仍逐例重建。
      if (!options.resetConnection && env!.config.type !== 'sqlite' && database.isInitialized)
        return
      await database.close()
      const initResult = await database.init(env!.config)
      if (!initResult.success) {
        throw new Error(`db init failed: ${initResult.error.code} ${initResult.error.message}`)
      }
      await waitForReady(database)
    }, 120000)

    afterEach(async () => {
      if (options.resetConnection || env!.config.type === 'sqlite')
        await database.close()
    })

    afterAll(async () => {
      try {
        await database.close()
      }
      finally {
        await env?.release?.()
        env = null
      }
    }, 300000)

    defineTests()
  })
}

export function sqliteMemoryEnv(): DbTestEnv {
  return { config: { type: 'sqlite', database: ':memory:' } }
}

export async function postgresEnv(): Promise<DbTestEnv> {
  const lease = await acquirePostgresContainer()
  return {
    config: {
      type: 'postgresql',
      host: lease.host,
      port: lease.port,
      database: lease.database,
      user: lease.user,
      password: lease.password,
      pool: { max: 5 },
    },
    release: lease.release,
  }
}

export async function mysqlEnv(): Promise<DbTestEnv> {
  const lease = await acquireMysqlContainer()
  return {
    config: {
      type: 'mysql',
      host: lease.host,
      port: lease.port,
      database: lease.database,
      user: lease.user,
      password: lease.password,
      pool: { max: 5 },
      mysql: { charset: 'utf8mb4' },
    },
    release: lease.release,
  }
}
