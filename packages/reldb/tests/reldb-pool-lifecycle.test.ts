/** 对真实 PostgreSQL/MySQL 连接池注入健康检查/关闭故障，核验服务端连接数量。 */
import type { Pool as MysqlPool } from 'mysql2/promise'
import type { Pool as PgPool } from 'pg'
import type { ReldbConfigInput } from '../src/reldb-config.js'
import { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { reldb } from '../src/index.js'
import { acquireMysqlContainer } from './helpers/mysql-container.js'
import { acquirePostgresContainer } from './helpers/postgres-container.js'

const require = createRequire(import.meta.url)
const pg = require('pg') as typeof import('pg')
const mysql = require('mysql2/promise') as typeof import('mysql2/promise')

describe.each(['postgresql', 'mysql'] as const)('%s pool lifecycle', (backend) => {
  let config: ReldbConfigInput
  let release: (() => Promise<void>) | undefined
  let observer: PgPool | MysqlPool | undefined
  let mysqlPrototype: MysqlPool

  beforeAll(async () => {
    const lease = await (backend === 'postgresql' ? acquirePostgresContainer() : acquireMysqlContainer())
    release = lease.release
    config = { type: backend, host: lease.host, port: lease.port, database: lease.database, user: lease.user, password: lease.password }
    const connection = { host: lease.host, port: lease.port, database: lease.database, user: lease.user, password: lease.password }
    observer = backend === 'postgresql' ? new pg.Pool(connection) : mysql.createPool(connection)
    if (backend === 'mysql')
      mysqlPrototype = Object.getPrototypeOf(observer) as MysqlPool
    await observer.query('SELECT 1')
  }, 180_000)
  afterEach(async () => {
    vi.restoreAllMocks()
    expect((await reldb.close()).success).toBe(true)
  })
  afterAll(async () => {
    await observer?.end()
    await release?.()
  }, 30_000)

  /** 独立观察连接不受故障注入影响；其余框架连接释放后服务端只应剩下观察者。 */
  async function expectOnlyObserver(): Promise<void> {
    await vi.waitFor(async () => {
      if (backend === 'postgresql') {
        const rows = await (observer as PgPool).query<{ count: string }>('SELECT COUNT(*) AS count FROM pg_stat_activity WHERE datname = current_database()')
        expect(Number(rows.rows[0].count)).toBe(1)
      }
      else {
        const [rows] = await (observer as MysqlPool).query('SELECT COUNT(*) AS count FROM information_schema.PROCESSLIST WHERE DB = DATABASE()')
        expect(Number((rows as Array<{ count: number }>)[0].count)).toBe(1)
      }
    }, { timeout: 10_000 })
  }

  it('health failure after a real query closes every allocated connection before retry', async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (backend === 'postgresql') {
        const query = pg.Pool.prototype.query
        vi.spyOn(pg.Pool.prototype, 'query').mockImplementationOnce(async function (this: PgPool) {
          await query.call(this, 'SELECT 1')
          throw new Error('injected health failure after real SELECT')
        })
      }
      else {
        const query = mysqlPrototype.query
        vi.spyOn(mysqlPrototype, 'query').mockImplementationOnce(async function (this: MysqlPool) {
          await query.call(this, 'SELECT 1')
          throw new Error('injected health failure after real SELECT')
        })
      }
      expect((await reldb.init(config)).success).toBe(false)
      expect(reldb.isInitialized).toBe(false)
      await expectOnlyObserver()
      vi.restoreAllMocks()
    }
    expect((await reldb.init(config)).success).toBe(true)
    expect((await reldb.sql.query('SELECT 1')).success).toBe(true)
  }, 60_000)

  it('cleanup failure blocks replacement and retries the same actual pool', async () => {
    expect((await reldb.init(config)).success).toBe(true)
    const owners = new Set<PgPool | MysqlPool>()
    let failures = 2
    if (backend === 'postgresql') {
      const end = pg.Pool.prototype.end
      vi.spyOn(pg.Pool.prototype, 'end').mockImplementation(function (this: PgPool) {
        owners.add(this)
        if (failures-- > 0)
          return Promise.reject(new Error('injected pool cleanup failure'))
        return end.call(this)
      })
    }
    else {
      const end = mysqlPrototype.end
      vi.spyOn(mysqlPrototype, 'end').mockImplementation(function (this: MysqlPool) {
        owners.add(this)
        if (failures-- > 0)
          return Promise.reject(new Error('injected pool cleanup failure'))
        return end.call(this)
      })
    }
    expect((await reldb.close()).success).toBe(false)
    expect((await reldb.sql.query('SELECT 1')).success).toBe(false)
    expect(reldb.isInitialized).toBe(false)
    expect((await reldb.init(config)).success).toBe(false)
    expect(owners.size).toBe(1)
    expect((await reldb.close()).success).toBe(true)
    expect(owners.size).toBe(1)
    await expectOnlyObserver()
    expect((await reldb.init(config)).success).toBe(true)
  }, 60_000)

  it('close rejects new operations while allowing an existing transaction to drain', async () => {
    expect((await reldb.init(config)).success).toBe(true)
    const tx = await reldb.tx.begin()
    expect(tx.success).toBe(true)
    if (!tx.success)
      return
    try {
      const closing = reldb.close()
      expect(reldb.isInitialized).toBe(false)
      expect((await reldb.sql.query('SELECT 1')).success).toBe(false)
      expect((await tx.data.get('SELECT 1 AS value')).success).toBe(true)
      expect((await tx.data.commit()).success).toBe(true)
      expect((await closing).success).toBe(true)
      await expectOnlyObserver()
    }
    finally { await tx.data.rollback() }
  }, 30_000)
})
