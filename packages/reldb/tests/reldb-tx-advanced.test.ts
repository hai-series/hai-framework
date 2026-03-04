/**
 * =============================================================================
 * @h-ai/reldb - 事务进阶测试
 * =============================================================================
 *
 * 覆盖事务的进阶场景：
 * - 事务提交 / 回滚后再操作应失败
 * - 跨表事务一致性
 * - tx.wrap 嵌套 CRUD 操作
 * - tx.crud 在 begin 模式下的使用
 * - 并发 tx.wrap 序列化
 * - 事务内部分操作失败的回滚验证
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { reldb, ReldbErrorCode } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

describe('reldb.tx advanced', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    const ensureTables = async () => {
      await reldb.ddl.dropTable('orders', true)
      await reldb.ddl.dropTable('users', true)
      await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        balance: { type: 'INTEGER', notNull: true, defaultValue: 0 },
      })
      await reldb.ddl.createTable('orders', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        user_id: { type: 'INTEGER', notNull: true },
        amount: { type: 'INTEGER', notNull: true },
      })
    }

    // ─── 事务提交后不可再操作 ───

    it(`${label}: begin+commit 后再 execute 应返回 TRANSACTION_FAILED`, async () => {
      await ensureTables()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success)
        return

      const tx = txResult.data
      await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户1', 100])

      const commitResult = await tx.commit()
      expect(commitResult.success).toBe(true)

      // 提交后再操作
      const afterCommit = await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户2', 200])
      expect(afterCommit.success).toBe(false)
      if (!afterCommit.success) {
        expect(afterCommit.error.code).toBe(ReldbErrorCode.TRANSACTION_FAILED)
      }
    })

    it(`${label}: begin+rollback 后再 execute 应返回 TRANSACTION_FAILED`, async () => {
      await ensureTables()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success)
        return

      const tx = txResult.data
      await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户1', 100])

      const rollbackResult = await tx.rollback()
      expect(rollbackResult.success).toBe(true)

      // 回滚后再操作
      const afterRollback = await tx.query('SELECT * FROM users')
      expect(afterRollback.success).toBe(false)
      if (!afterRollback.success) {
        expect(afterRollback.error.code).toBe(ReldbErrorCode.TRANSACTION_FAILED)
      }
    })

    it(`${label}: commit 后再次 commit 应返回 TRANSACTION_FAILED`, async () => {
      await ensureTables()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success)
        return

      const tx = txResult.data
      const first = await tx.commit()
      expect(first.success).toBe(true)

      const second = await tx.commit()
      expect(second.success).toBe(false)
      if (!second.success) {
        expect(second.error.code).toBe(ReldbErrorCode.TRANSACTION_FAILED)
      }
    })

    // ─── 跨表事务一致性 ───

    it(`${label}: 跨表事务提交应同时生效`, async () => {
      await ensureTables()

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['买家', 1000])
        await tx.execute('INSERT INTO orders (user_id, amount) VALUES (?, ?)', [1, 200])
        await tx.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [200, 1])
        return 'done'
      })

      expect(result.success).toBe(true)

      const user = await reldb.sql.get<{ balance: number }>('SELECT balance FROM users WHERE id = 1')
      expect(user.success).toBe(true)
      if (user.success) {
        expect(user.data?.balance).toBe(800)
      }

      const order = await reldb.sql.get<{ amount: number }>('SELECT amount FROM orders WHERE user_id = 1')
      expect(order.success).toBe(true)
      if (order.success) {
        expect(order.data?.amount).toBe(200)
      }
    })

    it(`${label}: 跨表事务回滚应全部撤回`, async () => {
      await ensureTables()

      // 先插入一个用户
      await reldb.sql.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['买家', 1000])

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO orders (user_id, amount) VALUES (?, ?)', [1, 500])
        await tx.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [500, 1])
        // 模拟业务校验失败
        throw new Error('余额不足')
      })

      expect(result.success).toBe(false)

      // 余额不应改变
      const user = await reldb.sql.get<{ balance: number }>('SELECT balance FROM users WHERE id = 1')
      expect(user.success).toBe(true)
      if (user.success) {
        expect(user.data?.balance).toBe(1000)
      }

      // 订单不应存在
      const orders = await reldb.sql.query('SELECT * FROM orders')
      expect(orders.success).toBe(true)
      if (orders.success) {
        expect(orders.data).toHaveLength(0)
      }
    })

    // ─── tx.crud 使用 ───

    it(`${label}: tx.wrap 内使用 tx.crud 应正确提交`, async () => {
      await ensureTables()

      const result = await reldb.tx.wrap(async (tx) => {
        const userCrud = tx.crud.table({
          table: 'users',
          idColumn: 'id',
          select: ['id', 'name', 'balance'],
          createColumns: ['name', 'balance'],
          updateColumns: ['name', 'balance'],
        })

        await userCrud.create({ name: '用户A', balance: 100 })
        await userCrud.create({ name: '用户B', balance: 200 })

        const count = await userCrud.count()
        if (!count.success)
          throw new Error('count failed')
        return count.data
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(2)
      }

      // 事务提交后，数据应持久
      const users = await reldb.sql.query('SELECT * FROM users')
      expect(users.success).toBe(true)
      if (users.success) {
        expect(users.data).toHaveLength(2)
      }
    })

    it(`${label}: begin 模式下的 tx.crud 操作 + 手动 rollback 应撤回`, async () => {
      await ensureTables()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success)
        return

      const tx = txResult.data
      const orderCrud = tx.crud.table({
        table: 'orders',
        idColumn: 'id',
        select: ['id', 'user_id', 'amount'],
        createColumns: ['user_id', 'amount'],
      })

      await orderCrud.create({ user_id: 1, amount: 300 })
      await orderCrud.create({ user_id: 2, amount: 400 })

      // 事务内查询
      const inTxCount = await orderCrud.count()
      expect(inTxCount.success).toBe(true)
      if (inTxCount.success) {
        expect(inTxCount.data).toBe(2)
      }

      // 手动回滚
      await tx.rollback()

      // 回滚后应无数据
      const afterCount = await reldb.sql.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM orders')
      expect(afterCount.success).toBe(true)
      if (afterCount.success) {
        expect(Number(afterCount.data?.cnt)).toBe(0)
      }
    })

    // ─── 连续事务 ───

    it(`${label}: 连续多次 tx.wrap 应独立完成`, async () => {
      await ensureTables()

      // 第一个事务
      const r1 = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户1', 100])
        return 1
      })
      expect(r1.success).toBe(true)

      // 第二个事务
      const r2 = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户2', 200])
        return 2
      })
      expect(r2.success).toBe(true)

      // 第三个事务（回滚）
      const r3 = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户3', 300])
        throw new Error('rollback')
      })
      expect(r3.success).toBe(false)

      // 应只有前两条
      const count = await reldb.sql.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.cnt)).toBe(2)
      }
    })

    // ─── tx.wrap 返回值 ───

    it(`${label}: tx.wrap 应返回回调的返回值`, async () => {
      await ensureTables()

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户A', 500])
        const user = await tx.get<{ id: number, name: string, balance: number }>(
          'SELECT * FROM users WHERE name = ?',
          ['用户A'],
        )
        if (!user.success || !user.data) {
          throw new Error('user not found')
        }
        return { id: user.data.id, name: user.data.name, balance: user.data.balance }
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('用户A')
        expect(result.data.balance).toBe(500)
      }
    })

    // ─── 事务内 batch ───

    it(`${label}: tx.wrap 内 batch 失败应整体回滚`, async () => {
      await ensureTables()

      await reldb.sql.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['原始用户', 100])

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['新用户', 200])
        // batch 中包含无效 SQL
        const batchResult = await tx.batch([
          { sql: 'INSERT INTO users (name, balance) VALUES (?, ?)', params: ['批量用户', 300] },
          { sql: 'INSERT INTO nonexistent_xyz (col) VALUES (?)', params: ['error'] },
        ])
        if (!batchResult.success) {
          throw new Error('batch failed')
        }
        return 'ok'
      })

      expect(result.success).toBe(false)

      // 整个事务应回滚，只剩原始用户
      const count = await reldb.sql.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.cnt)).toBe(1)
      }
    })

    // ─── 事务内 queryPage ───

    it(`${label}: begin 模式下 queryPage 应读取事务快照`, async () => {
      await ensureTables()

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success)
        return

      const tx = txResult.data
      await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户A', 100])
      await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户B', 200])
      await tx.execute('INSERT INTO users (name, balance) VALUES (?, ?)', ['用户C', 300])

      const page = await tx.queryPage<{ id: number, name: string }>({
        sql: 'SELECT id, name FROM users ORDER BY id ASC',
        pagination: { page: 1, pageSize: 2 },
      })

      expect(page.success).toBe(true)
      if (page.success) {
        expect(page.data.total).toBe(3)
        expect(page.data.items).toHaveLength(2)
        expect(page.data.items[0].name).toBe('用户A')
      }

      await tx.rollback()

      // 回滚后应无数据
      const after = await reldb.sql.query('SELECT * FROM users')
      expect(after.success).toBe(true)
      if (after.success) {
        expect(after.data).toHaveLength(0)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
