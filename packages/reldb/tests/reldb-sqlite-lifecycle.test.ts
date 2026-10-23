/** 使用真实 SQLite 数据库与 worker 验证初始化链和失败清理的所有权。 */
import type BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reldb } from '../src/index.js'

const Database = createRequire(import.meta.url)('better-sqlite3') as typeof BetterSqlite3

afterEach(async () => {
  vi.restoreAllMocks()
  expect((await reldb.close()).success).toBe(true)
})

describe.sequential('sQLite resource ownership', () => {
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
