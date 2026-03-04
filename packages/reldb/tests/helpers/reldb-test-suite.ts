/**
 * =============================================================================
 * @h-ai/reldb - 测试套件辅助
 * =============================================================================
 */

import type { ReldbConfigInput } from '../../src/index.js'
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

async function waitForReady(maxAttempts = 10, intervalMs = 2000): Promise<void> {
  let lastError: string | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const ping = await reldb.sql.query('SELECT 1')
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
): void {
  describe.sequential(`db (${label})`, () => {
    let env: DbTestEnv | null = null

    beforeAll(async () => {
      env = await setup()
    }, 300000)

    beforeEach(async () => {
      await reldb.close()
      const initResult = await reldb.init(env!.config)
      if (!initResult.success) {
        throw new Error(`db init failed: ${initResult.error.code} ${initResult.error.message}`)
      }
      await waitForReady()
    }, 120000)

    afterEach(async () => {
      await reldb.close()
    })

    afterAll(async () => {
      await env?.release?.()
      env = null
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
