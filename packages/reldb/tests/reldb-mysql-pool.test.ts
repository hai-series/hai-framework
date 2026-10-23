/** 真实 MySQL 饱和、超时和关闭回归：失败的借用不能稍后执行 SQL。 */
import type { Pool } from 'mysql2/promise'
import type { ReldbConfigInput } from '../src/index.js'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { HaiReldbError, reldb, ReldbConfigSchema } from '../src/index.js'
import { acquireMysqlContainer } from './helpers/mysql-container.js'

const mysql = createRequire(import.meta.url)('mysql2/promise') as typeof import('mysql2/promise')

describe('mysql pool contract', () => {
  it('accepts url-only MySQL configuration and still requires database without a URL', () => {
    expect(ReldbConfigSchema.safeParse({ type: 'mysql', url: 'mysql://db.example:3306/url_db' }).success).toBe(true)
    expect(ReldbConfigSchema.safeParse({ type: 'mysql' }).success).toBe(false)
    expect(ReldbConfigSchema.safeParse({ type: 'mysql', url: 'https://db.example/url_db' }).success).toBe(false)
  })
  it('rejects unsupported retention options and requires finite positive acquisition limits', () => {
    for (const pool of [{ min: 0 }, { idleTimeout: 30000 }, { acquireTimeout: 0 }, { acquireTimeout: 2147483648 }, { queueLimit: 0 }]) {
      const parsed = ReldbConfigSchema.safeParse({ type: 'mysql', database: 'test', pool })
      expect(parsed.success, JSON.stringify(pool)).toBe(false)
    }
  })

  it('exposes only implemented MySQL defaults and rejects the unused timezone option', () => {
    const parsed = ReldbConfigSchema.parse({ type: 'mysql', database: 'test', pool: {} })
    expect(parsed.type).toBe('mysql')
    if (parsed.type === 'mysql')
      expect(parsed.pool).toEqual({ max: 10, acquireTimeout: 10000, queueLimit: 1000 })
    expect(ReldbConfigSchema.safeParse({ type: 'mysql', database: 'test', mysql: { timezone: '+08:00' } }).success).toBe(false)
  })
})

describe('mysql bounded acquisition', () => {
  let config: Extract<ReldbConfigInput, { type: 'mysql' }>
  let observer: Pool
  let release: (() => Promise<void>) | undefined
  let prototype: Pool
  let url: string

  beforeAll(async () => {
    const lease = await acquireMysqlContainer()
    release = lease.release
    const connection = { host: lease.host, port: lease.port, database: lease.database, user: lease.user, password: lease.password }
    config = { type: 'mysql', ...connection, pool: { max: 1, acquireTimeout: 1000 } }
    url = `mysql://${encodeURIComponent(lease.user)}:${encodeURIComponent(lease.password)}@127.0.0.1:${lease.port}/hai_pool_uri`
    observer = mysql.createPool(connection)
    prototype = Object.getPrototypeOf(observer) as Pool
    await observer.query('CREATE TABLE IF NOT EXISTS hai_pool_effects (id INT AUTO_INCREMENT PRIMARY KEY, value INT NOT NULL)')
    await observer.query('CREATE DATABASE IF NOT EXISTS hai_pool_uri')
  }, 180_000)

  afterEach(async () => {
    vi.restoreAllMocks()
    expect((await reldb.close()).success).toBe(true)
    await observer.query('DELETE FROM hai_pool_effects')
    await observer.query('DROP TABLE IF EXISTS hai_pool_late_ddl')
  })
  afterAll(async () => {
    await observer?.end()
    await release?.()
  }, 30_000)

  /** 观察连接独立于框架池，核对超时写入未在后台执行。 */
  async function values(): Promise<number[]> {
    const [rows] = await observer.query('SELECT value FROM hai_pool_effects ORDER BY id')
    return (rows as Array<{ value: number }>).map(row => row.value)
  }

  it('uses the URL host and database even when split connection fields conflict, and keeps independent driver options', async () => {
    expect((await reldb.init({ type: 'mysql', url })).success).toBe(true)
    const selected = await reldb.sql.get<{ name: string }>('SELECT DATABASE() AS name')
    expect(selected.success && selected.data?.name).toBe('hai_pool_uri')
    expect((await reldb.close()).success).toBe(true)
    expect((await reldb.init({
      type: 'mysql',
      url,
      host: '192.0.2.1',
      port: 1,
      database: 'ignored_database',
      user: 'ignored_user',
      password: 'ignored_password',
      mysql: { charset: 'utf8mb4' },
      pool: { max: 1, acquireTimeout: 1000, queueLimit: 2 },
    })).success).toBe(true)
    const actual = await reldb.sql.get<{ name: string, charset: string }>('SELECT DATABASE() AS name, @@character_set_client AS charset')
    expect(actual.success && actual.data).toEqual({ name: 'hai_pool_uri', charset: 'utf8mb4' })
  })

  it('bounds acquisition for SQL, DDL, batch and transactions without deferred side effects', async () => {
    expect((await reldb.init(config)).success).toBe(true)
    const held = await reldb.tx.begin()
    expect(held.success).toBe(true)
    if (!held.success)
      return
    const rollback = setTimeout(() => {
      void held.data.rollback()
    }, 1500)
    const pending = [
      reldb.sql.get('SELECT 1 AS value'),
      reldb.sql.execute('INSERT INTO hai_pool_effects (value) VALUES (?)', [1]),
      reldb.ddl.raw('CREATE TABLE hai_pool_late_ddl (id INT)'),
      reldb.sql.batch([{ sql: 'INSERT INTO hai_pool_effects (value) VALUES (?)', params: [2] }]),
    ]
    const pendingTx = reldb.tx.begin()
    try {
      const results = await Promise.all([...pending, pendingTx])
      for (const result of results) {
        expect(result.success).toBe(false)
        if (!result.success)
          expect(result.error.code).toBe(HaiReldbError.TIMEOUT.code)
      }
    }
    finally {
      clearTimeout(rollback)
      await held.data.rollback()
      await Promise.all(pending)
      const tx = await pendingTx
      if (tx.success)
        await tx.data.rollback()
    }
    expect(await values()).toEqual([])
    const [tables] = await observer.query('SHOW TABLES LIKE ?', ['hai_pool_late_ddl'])
    expect(tables).toEqual([])
    expect((await reldb.sql.get('SELECT 1 AS value')).success).toBe(true)
  })

  it('removes repeated timed-out waiters rather than executing them when the held connection returns', async () => {
    expect((await reldb.init(config)).success).toBe(true)
    const held = await reldb.tx.begin()
    expect(held.success).toBe(true)
    if (!held.success)
      return
    const rollback = setTimeout(() => {
      void held.data.rollback()
    }, 4500)
    try {
      for (let index = 0; index < 3; index++) {
        const result = await reldb.sql.execute('INSERT INTO hai_pool_effects (value) VALUES (?)', [index])
        expect(result.success).toBe(false)
        if (!result.success)
          expect(result.error.code).toBe(HaiReldbError.TIMEOUT.code)
      }
    }
    finally {
      clearTimeout(rollback)
      await held.data.rollback()
    }
    expect((await reldb.sql.get('SELECT 1 AS value')).success).toBe(true)
    expect(await values()).toEqual([])
  })

  it('rejects a full finite queue immediately and preserves FIFO for admitted writes', async () => {
    expect((await reldb.init({ ...config, pool: { max: 1, acquireTimeout: 1000, queueLimit: 2 } })).success).toBe(true)
    const held = await reldb.tx.begin()
    expect(held.success).toBe(true)
    if (!held.success)
      return
    const rollback = setTimeout(() => {
      void held.data.rollback()
    }, 1500)
    const first = reldb.sql.execute('INSERT INTO hai_pool_effects (value) VALUES (?)', [1])
    const second = reldb.sql.execute('INSERT INTO hai_pool_effects (value) VALUES (?)', [2])
    try {
      const rejected = await reldb.sql.execute('INSERT INTO hai_pool_effects (value) VALUES (?)', [3])
      expect(rejected.success).toBe(false)
      if (!rejected.success)
        expect(rejected.error.code).toBe(HaiReldbError.POOL_EXHAUSTED.code)
    }
    finally {
      clearTimeout(rollback)
      await held.data.rollback()
    }
    expect((await first).success).toBe(true)
    expect((await second).success).toBe(true)
    expect(await values()).toEqual([1, 2])
  })

  it('cancels queued acquisition on close while an existing transaction drains', async () => {
    expect((await reldb.init(config)).success).toBe(true)
    const held = await reldb.tx.begin()
    expect(held.success).toBe(true)
    if (!held.success)
      return
    let waitingSettled = false
    let closingSettled = false
    const waiting = reldb.sql.get('SELECT 1 AS value').then((result) => {
      waitingSettled = true
      return result
    })
    const closing = reldb.close().then((result) => {
      closingSettled = true
      return result
    })
    try {
      await delay(20)
      expect(waitingSettled).toBe(true)
      expect(closingSettled).toBe(false)
      expect((await waiting).success).toBe(false)
      expect((await held.data.get('SELECT 1 AS value')).success).toBe(true)
    }
    finally {
      await held.data.rollback()
      await waiting
      expect((await closing).success).toBe(true)
    }
  })

  it('retains a timed-out connecting slot until its actual connection is released', async () => {
    expect((await reldb.init(config)).success).toBe(true)
    const getConnection = prototype.getConnection
    let deliver: (() => void) | undefined
    let connected!: () => void
    const ready = new Promise<void>((resolve) => {
      connected = resolve
    })
    const spy = vi.spyOn(prototype, 'getConnection').mockImplementationOnce(async function (this: Pool) {
      const connection = await getConnection.call(this)
      return new Promise((resolve) => {
        deliver = () => resolve(connection)
        connected()
      })
    })
    const first = reldb.sql.execute('INSERT INTO hai_pool_effects (value) VALUES (?)', [1])
    await ready
    let second: ReturnType<typeof reldb.sql.get> | undefined
    try {
      const expired = await first
      expect(expired.success).toBe(false)
      if (!expired.success)
        expect(expired.error.code).toBe(HaiReldbError.TIMEOUT.code)
      second = reldb.sql.get('SELECT 1 AS value')
      await delay(20)
      expect(spy).toHaveBeenCalledTimes(1)
      deliver?.()
      expect((await second).success).toBe(true)
      expect(await values()).toEqual([])
    }
    finally {
      deliver?.()
      await first
      await second
    }
  })

  it.each(['on delivery', 'before SQL'] as const)('does not execute after the exact acquisition deadline %s', async (boundary) => {
    expect((await reldb.init(config)).success).toBe(true)
    let calls = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => {
      calls++
      // 依次是创建截止期限、开始借用、驱动返回、业务调用前；SDK 不使用此时钟。
      return calls >= (boundary === 'on delivery' ? 3 : 4) ? 2000 : 1000
    })
    try {
      const result = await reldb.sql.execute('INSERT INTO hai_pool_effects (value) VALUES (?)', [1])
      expect(result.success).toBe(false)
      if (!result.success)
        expect(result.error.code).toBe(HaiReldbError.TIMEOUT.code)
    }
    finally { clock.mockRestore() }
    expect(await values()).toEqual([])
    expect((await reldb.sql.get('SELECT 1 AS value')).success).toBe(true)
  })
})
