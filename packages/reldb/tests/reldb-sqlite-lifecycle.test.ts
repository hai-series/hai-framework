/** 使用真实 SQLite 数据库与 worker 验证初始化链和失败清理的所有权。 */
import type BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reldb } from '../src/index.js'

const Database = createRequire(import.meta.url)('better-sqlite3') as typeof BetterSqlite3
const directories: string[] = []

function temporaryDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), 'hai-reldb-wal-'))
  directories.push(directory)
  return join(directory, 'test.sqlite')
}

afterEach(async () => {
  vi.restoreAllMocks()
  expect((await reldb.close()).success).toBe(true)
  for (const directory of directories.splice(0)) {
    expect(dirname(resolve(directory))).toBe(resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})

describe.sequential('sQLite resource ownership', () => {
  it.each(['SQLITE_BUSY', 'SQLITE_BUSY_RECOVERY'])('retries only transient WAL startup %s and restores the SQL busy budget', async (code) => {
    const original = Database.prototype.pragma
    let failures = 2
    let attempts = 0
    const databases: BetterSqlite3.Database[] = []
    vi.spyOn(Database.prototype, 'pragma').mockImplementation(function (this: BetterSqlite3.Database, source, options) {
      if (source === 'journal_mode = WAL') {
        databases.push(this)
        attempts++
        if (failures-- > 0)
          throw Object.assign(new Error('Injected WAL startup contention'), { code })
      }
      return original.call(this, source, options)
    })
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    expect(attempts).toBe(3)
    expect(databases[0]?.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect((await reldb.sql.get('SELECT 1 AS value')).success).toBe(true)
  })

  it('does not retry non-BUSY WAL failures and closes the owned database', async () => {
    const original = Database.prototype.pragma
    let attempts = 0
    const databases: BetterSqlite3.Database[] = []
    vi.spyOn(Database.prototype, 'pragma').mockImplementation(function (this: BetterSqlite3.Database, source, options) {
      if (source === 'journal_mode = WAL') {
        databases.push(this)
        attempts++
        throw Object.assign(new Error('Injected readonly WAL failure'), { code: 'SQLITE_READONLY' })
      }
      return original.call(this, source, options)
    })
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(false)
    expect(attempts).toBe(1)
    expect(databases[0]?.open).toBe(false)
  })

  it('exhausts one monotonic startup budget and closes the owned database', async () => {
    const original = Database.prototype.pragma
    const realNow = performance.now.bind(performance)
    let expired = false
    let attempts = 0
    const databases: BetterSqlite3.Database[] = []
    vi.spyOn(performance, 'now').mockImplementation(() => realNow() + (expired ? 6000 : 0))
    vi.spyOn(Database.prototype, 'pragma').mockImplementation(function (this: BetterSqlite3.Database, source, options) {
      if (source === 'journal_mode = WAL') {
        databases.push(this)
        attempts++
        expired = true
        throw Object.assign(new Error('Injected persistent WAL contention'), { code: 'SQLITE_BUSY' })
      }
      return original.call(this, source, options)
    })
    const result = await reldb.init({ type: 'sqlite', database: ':memory:' })
    expired = false
    expect(result.success).toBe(false)
    expect(attempts).toBe(1)
    expect(databases[0]?.open).toBe(false)
  })

  it('worker startup retries a real WAL lock until the reader releases it', async () => {
    const path = temporaryDatabase()
    const reader = new Database(path)
    reader.exec('CREATE TABLE startup (value INTEGER); BEGIN; SELECT * FROM startup')
    const release = setTimeout(() => reader.exec('COMMIT'), 100)
    try {
      const result = await reldb.init({ type: 'sqlite', database: path, sqlite: { executor: 'worker' } })
      expect(result.success).toBe(true)
      const mode = await reldb.sql.get<{ journal_mode: string }>('PRAGMA journal_mode')
      expect(mode).toMatchObject({ success: true, data: { journal_mode: 'wal' } })
      const budget = await reldb.sql.get<{ timeout: number }>('PRAGMA busy_timeout')
      expect(budget).toMatchObject({ success: true, data: { timeout: 5000 } })
    }
    finally {
      clearTimeout(release)
      reader.close()
    }
  })

  it('worker non-BUSY WAL failure terminates its real thread without retrying', async () => {
    const path = temporaryDatabase()
    const database = new Database(path)
    database.exec('CREATE TABLE startup (value INTEGER)')
    database.close()
    const workers: Worker[] = []
    const terminate = Worker.prototype.terminate
    vi.spyOn(Worker.prototype, 'terminate').mockImplementation(function (this: Worker) {
      workers.push(this)
      return terminate.call(this)
    })
    const started = performance.now()
    const result = await reldb.init({ type: 'sqlite', database: path, sqlite: { executor: 'worker', readonly: true } })
    expect(result.success).toBe(false)
    expect(performance.now() - started).toBeLessThan(3000)
    expect(workers).toHaveLength(1)
    expect(workers[0].threadId).toBe(-1)
  })

  it('worker persistent WAL contention exhausts five seconds and releases the thread', async () => {
    const path = temporaryDatabase()
    const reader = new Database(path)
    reader.exec('CREATE TABLE startup (value INTEGER); BEGIN; SELECT * FROM startup')
    const workers: Worker[] = []
    const terminate = Worker.prototype.terminate
    vi.spyOn(Worker.prototype, 'terminate').mockImplementation(function (this: Worker) {
      workers.push(this)
      return terminate.call(this)
    })
    try {
      const started = performance.now()
      const result = await reldb.init({ type: 'sqlite', database: path, sqlite: { executor: 'worker' } })
      expect(result.success).toBe(false)
      expect(performance.now() - started).toBeGreaterThanOrEqual(4900)
      expect(performance.now() - started).toBeLessThan(6500)
      expect(workers).toHaveLength(1)
      expect(workers[0].threadId).toBe(-1)
    }
    finally {
      reader.close()
    }
  }, 8000)

  it('wAL initialization failure closes the real database before retry', async () => {
    const databases: BetterSqlite3.Database[] = []
    const original = Database.prototype.pragma
    const pragma = vi.spyOn(Database.prototype, 'pragma').mockImplementationOnce(function (this: BetterSqlite3.Database) {
      databases.push(this)
      throw new Error('injected WAL failure')
    })
    const result = await reldb.init({ type: 'sqlite', database: ':memory:' })
    expect(result.success).toBe(false)
    expect(databases).toHaveLength(1)
    expect(databases[0].open).toBe(false)
    expect(reldb.isInitialized).toBe(false)
    pragma.mockImplementation(original)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  })

  it('failed database close is retained; replacement cannot allocate another database', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
    const pragma = vi.spyOn(Database.prototype, 'pragma')
    const close = vi.spyOn(Database.prototype, 'close')
      .mockImplementationOnce(() => { throw new Error('injected close failure') })
      .mockImplementationOnce(() => { throw new Error('injected close failure') })
    expect((await reldb.close()).success).toBe(false)
    expect(reldb.isInitialized).toBe(false)
    expect((await reldb.sql.query('SELECT 1')).success).toBe(false)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(false)
    expect(pragma).not.toHaveBeenCalled()
    close.mockRestore()
    expect((await reldb.close()).success).toBe(true)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  })

  it('a later successful candidate cleanup clears the pending marker from the init error', async () => {
    const databases: BetterSqlite3.Database[] = []
    vi.spyOn(Database.prototype, 'pragma').mockImplementationOnce(function (this: BetterSqlite3.Database) {
      databases.push(this)
      throw new Error('injected WAL failure')
    })
    vi.spyOn(Database.prototype, 'close').mockImplementationOnce(() => {
      throw new Error('first cleanup fails')
    })
    const result = await reldb.init({ type: 'sqlite', database: ':memory:' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.ext?.cleanupPending).not.toBe(true)
    expect(databases[0].open).toBe(false)
  })

  it('worker handshake timeout terminates each actual worker before repeated retries', async () => {
    const workers: Worker[] = []
    const terminate = Worker.prototype.terminate
    vi.spyOn(Worker.prototype, 'terminate').mockImplementation(function (this: Worker) {
      workers.push(this)
      return terminate.call(this)
    })
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await reldb.init({ type: 'sqlite', database: ':memory:', sqlite: { executor: 'worker', workerConnectTimeoutMs: 1 } })
      expect(result.success).toBe(false)
      expect(reldb.isInitialized).toBe(false)
    }
    expect(workers).toHaveLength(3)
    expect(workers.every(worker => worker.threadId === -1)).toBe(true)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:', sqlite: { executor: 'worker' } })).success).toBe(true)
  })

  it('worker initialization error terminates the failed worker without waiting for timeout', async () => {
    const workers: Worker[] = []
    const terminate = Worker.prototype.terminate
    vi.spyOn(Worker.prototype, 'terminate').mockImplementation(function (this: Worker) {
      workers.push(this)
      return terminate.call(this)
    })
    const result = await reldb.init({ type: 'sqlite', database: join(tmpdir(), `missing-${randomUUID()}`, 'database.sqlite'), sqlite: { executor: 'worker' } })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.message).not.toContain('timed out')
    expect(workers).toHaveLength(1)
    expect(workers[0].threadId).toBe(-1)
  })

  it('close permits an already borrowed SQLite transaction to drain', async () => {
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
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
    }
    finally { await tx.data.rollback() }
  })

  it('failed worker termination keeps the same worker for cleanup retry', async () => {
    const workers: Worker[] = []
    const terminate = Worker.prototype.terminate
    let failures = 3
    vi.spyOn(Worker.prototype, 'terminate').mockImplementation(function (this: Worker) {
      workers.push(this)
      if (failures-- > 0)
        return Promise.reject(new Error('injected terminate failure'))
      return terminate.call(this)
    })
    const result = await reldb.init({ type: 'sqlite', database: ':memory:', sqlite: { executor: 'worker', workerConnectTimeoutMs: 1 } })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.ext?.cleanupPending).toBe(true)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(false)
    expect(new Set(workers).size).toBe(1)
    expect((await reldb.close()).success).toBe(true)
    expect(workers[0].threadId).toBe(-1)
    expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
  })
})
