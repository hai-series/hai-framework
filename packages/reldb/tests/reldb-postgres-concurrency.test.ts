import type { ReldbConfigInput } from '../src/reldb-config.js'
/** 真实 PostgreSQL 锁等待复现首次 DDL 目录竞争；非幂等、权限及业务约束错误不能重试。 */
import { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { reldb } from '../src/index.js'
import { acquirePostgresContainer } from './helpers/postgres-container.js'

const require = createRequire(import.meta.url)
const pg = require('pg') as typeof import('pg')

let release: (() => Promise<void>) | undefined
let config: ReldbConfigInput

beforeAll(async () => {
  const lease = await acquirePostgresContainer()
  release = lease.release
  config = { type: 'postgresql', host: lease.host, port: lease.port, database: lease.database, user: lease.user, password: lease.password, pool: { max: 5 } }
  const result = await reldb.init(config)
  expect(result.success).toBe(true)
}, 120_000)
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  try {
    await reldb.close()
  }
  finally { await release?.() }
}, 30_000)

describe.each(['table', 'index'] as const)('concurrent PostgreSQL %s creation', (kind) => {
  it.each(['ddl', 'sql'] as const)('%s 等待另一个事务提交后仍返回成功', async (entry) => {
    const table = `ddl_race_${kind}_${entry}`
    const index = `${table}_idx`
    if (kind === 'index')
      expect((await reldb.ddl.createTable(table, { id: { type: 'TEXT' } })).success).toBe(true)
    const statement = kind === 'table'
      ? `CREATE TABLE IF NOT EXISTS "${table}" ("id" TEXT)`
      : `CREATE INDEX IF NOT EXISTS "${index}" ON "${table}"("id")`
    const begun = await reldb.tx.begin()
    if (!begun.success)
      throw new Error(begun.error.message)
    let pending: Promise<{ success: boolean }> | undefined
    try {
      expect((await begun.data.execute(statement)).success).toBe(true)
      pending = entry === 'sql'
        ? reldb.sql.execute(statement)
        : kind === 'table'
          ? reldb.ddl.createTable(table, { id: { type: 'TEXT' } })
          : reldb.ddl.createIndex(table, index, { columns: ['id'] })
      // 必须观察到真实目录锁等待，再释放胜者事务；不靠随机延时碰运气。
      await vi.waitFor(async () => {
        const waiting = await reldb.sql.get<{ count: string }>('SELECT COUNT(*) AS count FROM pg_stat_activity WHERE wait_event_type = \'Lock\' AND query LIKE ?', [`%${kind === 'table' ? table : index}%`])
        expect(waiting.success && Number(waiting.data?.count)).toBe(1)
      }, { timeout: 5000 })
      expect((await begun.data.commit()).success).toBe(true)
      expect((await pending).success).toBe(true)
    }
    finally {
      await begun.data.rollback()
      await pending
    }
  }, 15_000)
})

it.each([
  { statement: 'INSERT INTO events VALUES (1)', code: '23505', constraint: 'pg_class_relname_nsp_index', calls: 1 },
  { statement: 'CREATE INDEX duplicate ON events(id)', code: '23505', constraint: 'pg_class_relname_nsp_index', calls: 1 },
  { statement: 'CREATE INDEX IF NOT EXISTS denied ON events(id)', code: '42501', constraint: 'pg_class_relname_nsp_index', calls: 1 },
  { statement: 'CREATE UNIQUE INDEX IF NOT EXISTS business ON events(id)', code: '23505', constraint: 'business_unique', calls: 1 },
  { statement: 'CREATE INDEX IF NOT EXISTS still_failing ON events(id)', code: '23505', constraint: 'pg_class_relname_nsp_index', calls: 2 },
  { statement: 'INSERT INTO events VALUES (1)', code: 'EAI_AGAIN', constraint: '', calls: 1 },
])('保留失败且有界执行：$statement', async ({ statement, code, constraint, calls }) => {
  const error = Object.assign(new Error('Injected driver failure'), { code, constraint, schema: 'pg_catalog' })
  const query = vi.spyOn(pg.Pool.prototype, 'query').mockImplementation(async () => {
    throw error
  })
  const result = await reldb.sql.execute(statement)
  expect(result.success).toBe(false)
  expect(query).toHaveBeenCalledTimes(calls)
})

it('业务唯一索引即使与系统目录同名也不重复构建', async () => {
  expect((await reldb.ddl.createTable('business_collision', { id: { type: 'TEXT' } })).success).toBe(true)
  expect((await reldb.sql.execute('INSERT INTO business_collision (id) VALUES (?), (?)', ['same', 'same'])).success).toBe(true)
  const query = vi.spyOn(pg.Pool.prototype, 'query')
  const result = await reldb.ddl.createIndex('business_collision', 'pg_class_relname_nsp_index', { columns: ['id'], unique: true })
  expect(result.success).toBe(false)
  if (!result.success)
    expect(result.error.cause).toMatchObject({ code: '23505', schema: 'public', constraint: 'pg_class_relname_nsp_index' })
  expect(query).toHaveBeenCalledTimes(1)
})

it.each([
  { code: 'EAI_AGAIN', failures: 2, success: true, calls: 3 },
  { code: 'EAI_AGAIN', failures: 3, success: false, calls: 3 },
  { code: '28P01', failures: 1, success: false, calls: 1 },
])('连接探测仅对临时 DNS 错误有界重试：$code/$failures', async ({ code, failures, success, calls }) => {
  expect((await reldb.close()).success).toBe(true)
  const original = pg.Pool.prototype.query
  let remaining = failures
  const query = vi.spyOn(pg.Pool.prototype, 'query').mockImplementation(async function (this: import('pg').Pool) {
    if (remaining-- > 0)
      throw Object.assign(new Error('Injected connection failure'), { code })
    return original.call(this, 'SELECT 1')
  })
  const result = await reldb.init(config)
  expect(result.success).toBe(success)
  expect(query).toHaveBeenCalledTimes(calls)
  query.mockRestore()
  if (!success)
    expect((await reldb.init(config)).success).toBe(true)
})
