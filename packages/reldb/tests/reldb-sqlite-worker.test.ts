/**
 * =============================================================================
 * @h-ai/reldb - SQLite worker 执行方式测试
 * =============================================================================
 *
 * 验证 sqlite.executor='worker' 下的建表 / 写入 / 查询 / 分页 / 事务 / 批量，
 * 确认连接放进 worker 线程后功能与同步模式一致。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reldb } from '../src/index.js'

describe.sequential('sqlite worker executor', () => {
  beforeEach(async () => {
    await reldb.close()
    const init = await reldb.init({
      type: 'sqlite',
      database: ':memory:',
      sqlite: { executor: 'worker' },
    })
    // worker 线程加载失败会在此暴露为初始化错误。
    expect(init.success).toBe(true)
  })

  afterEach(async () => {
    await reldb.close()
  })

  it('worker 模式下应完成建表、写入与查询', async () => {
    const create = await reldb.ddl.createTable('hai_worker_items', {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      name: { type: 'TEXT', notNull: true },
    })
    expect(create.success).toBe(true)

    const insert = await reldb.sql.execute('INSERT INTO hai_worker_items (name) VALUES (?)', ['alpha'])
    expect(insert.success).toBe(true)
    if (insert.success) {
      expect(insert.data.changes).toBe(1)
      expect(Number(insert.data.lastInsertRowid)).toBeGreaterThan(0)
    }

    const rows = await reldb.sql.query<{ id: number, name: string }>('SELECT * FROM hai_worker_items ORDER BY id')
    expect(rows.success).toBe(true)
    if (rows.success) {
      expect(rows.data.length).toBe(1)
      expect(rows.data[0].name).toBe('alpha')
    }

    const one = await reldb.sql.get<{ name: string }>('SELECT name FROM hai_worker_items WHERE name = ?', ['alpha'])
    expect(one.success).toBe(true)
    if (one.success) {
      expect(one.data?.name).toBe('alpha')
    }
  })

  it('worker 模式下应支持分页查询', async () => {
    await reldb.ddl.createTable('hai_worker_paged', {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      name: { type: 'TEXT', notNull: true },
    })
    for (const name of ['a', 'b', 'c']) {
      await reldb.sql.execute('INSERT INTO hai_worker_paged (name) VALUES (?)', [name])
    }

    const page = await reldb.sql.queryPage<{ id: number, name: string }>({
      sql: 'SELECT * FROM hai_worker_paged ORDER BY id',
      pagination: { page: 1, pageSize: 2 },
    })
    expect(page.success).toBe(true)
    if (page.success) {
      expect(page.data.total).toBe(3)
      expect(page.data.items.length).toBe(2)
      expect(page.data.page).toBe(1)
      expect(page.data.pageSize).toBe(2)
    }
  })

  it('worker 模式下事务应提交与回滚', async () => {
    await reldb.ddl.createTable('hai_worker_tx', {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      name: { type: 'TEXT', notNull: true },
    })

    const committed = await reldb.tx.wrap(async (tx) => {
      await tx.execute('INSERT INTO hai_worker_tx (name) VALUES (?)', ['committed'])
      return 'ok'
    })
    expect(committed.success).toBe(true)

    const rolled = await reldb.tx.wrap(async (tx) => {
      await tx.execute('INSERT INTO hai_worker_tx (name) VALUES (?)', ['rolled'])
      // 抛错触发回滚。
      throw new Error('force rollback')
    })
    expect(rolled.success).toBe(false)

    const rows = await reldb.sql.query<{ name: string }>('SELECT name FROM hai_worker_tx')
    expect(rows.success).toBe(true)
    if (rows.success) {
      const names = rows.data.map(r => r.name)
      expect(names).toContain('committed')
      expect(names).not.toContain('rolled')
    }
  })

  it('worker 模式下批量执行应原子生效', async () => {
    await reldb.ddl.createTable('hai_worker_batch', {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      name: { type: 'TEXT', notNull: true },
    })

    const batch = await reldb.sql.batch([
      { sql: 'INSERT INTO hai_worker_batch (name) VALUES (?)', params: ['x'] },
      { sql: 'INSERT INTO hai_worker_batch (name) VALUES (?)', params: ['y'] },
    ])
    expect(batch.success).toBe(true)

    const count = await reldb.sql.get<{ n: number }>('SELECT COUNT(*) as n FROM hai_worker_batch')
    expect(count.success).toBe(true)
    if (count.success) {
      expect(Number(count.data?.n)).toBe(2)
    }
  })
})
