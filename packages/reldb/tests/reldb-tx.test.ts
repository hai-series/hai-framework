/**
 * =============================================================================
 * @h-ai/reldb - 事务操作测试
 * =============================================================================
 */

import { err, HaiCommonError, ok } from '@h-ai/core'
import { describe, expect, it } from 'vitest'
import { HaiReldbError, reldb } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

describe('reldb.tx', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    it(`${label}: wrapResult 在成功时提交，回滚时保留业务失败，wrap 仍包装普通返回值`, async () => {
      expect((await reldb.ddl.createTable('tx_result_items', {
        name: { type: 'TEXT', notNull: true },
      })).success).toBe(true)

      const rejected = err(HaiCommonError.CONFLICT, 'Invalid item')
      const rolled = await reldb.tx.wrapResult(async (tx) => {
        const inserted = await tx.execute('INSERT INTO tx_result_items (name) VALUES (?)', ['rolled back'])
        return inserted.success ? rejected : inserted
      })
      expect(rolled).toEqual(rejected)

      const committed = await reldb.tx.wrapResult(async (tx) => {
        const inserted = await tx.execute('INSERT INTO tx_result_items (name) VALUES (?)', ['committed'])
        return inserted.success
          ? ok(inserted.data.changes)
          : inserted
      })
      expect(committed).toEqual(ok(1))
      expect(await reldb.tx.wrap(async () => rejected)).toEqual(ok(rejected))
      expect(await reldb.sql.query('SELECT name FROM tx_result_items')).toEqual(ok([
        { name: 'committed' },
      ]))
    })

    it(`${label}: 事务成功应提交数据`, async () => {
      await reldb.ddl.dropTable('users', true)
      const createTable = await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
        return 'ok'
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('ok')
      }

      const count = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(2)
      }
    })

    it(`${label}: 事务内 batch 应执行全部语句`, async () => {
      await reldb.ddl.dropTable('users', true)
      const createTable = await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.batch([
          {
            sql: 'INSERT INTO users (name) VALUES (?)',
            params: ['用户1'],
          },
          {
            sql: 'INSERT INTO users (name) VALUES (?)',
            params: ['用户2'],
          },
        ])
        return 'ok'
      })

      expect(result.success).toBe(true)

      const count = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(2)
      }
    })

    it(`${label}: 事务内分页查询应返回总数`, async () => {
      await reldb.ddl.dropTable('users', true)
      const createTable = await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户3'])
        const pageResult = await tx.queryPage<{ id: number, name: string }>({
          sql: 'SELECT id, name FROM users ORDER BY id ASC',
          pagination: { page: 1, pageSize: 2 },
        })
        if (!pageResult.success) {
          throw new Error(pageResult.error.message)
        }
        return pageResult.data
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(3)
        expect(result.data.page).toBe(1)
        expect(result.data.pageSize).toBe(2)
        expect(result.data.items).toHaveLength(2)
      }
    })

    it(`${label}: 事务失败应回滚并返回 TRANSACTION_FAILED`, async () => {
      await reldb.ddl.dropTable('users', true)
      const createTable = await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
        throw new Error('boom')
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.TRANSACTION_FAILED.code)
      }

      const count = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(0)
      }
    })

    it(`${label}: begin + commit 应提交数据`, async () => {
      await reldb.ddl.dropTable('users', true)
      await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success) {
        return
      }

      const tx = txResult.data
      await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
      await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])

      const inTxCount = await tx.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(inTxCount.success).toBe(true)
      if (inTxCount.success) {
        expect(Number(inTxCount.data?.count)).toBe(2)
      }

      const commitResult = await tx.commit()
      expect(commitResult.success).toBe(true)

      const afterCount = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(afterCount.success).toBe(true)
      if (afterCount.success) {
        expect(Number(afterCount.data?.count)).toBe(2)
      }
    })

    it(`${label}: begin + rollback 应撤销数据`, async () => {
      await reldb.ddl.dropTable('users', true)
      await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const txResult = await reldb.tx.begin()
      expect(txResult.success).toBe(true)
      if (!txResult.success) {
        return
      }

      const tx = txResult.data
      await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])

      const inTxCount = await tx.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(inTxCount.success).toBe(true)
      if (inTxCount.success) {
        expect(Number(inTxCount.data?.count)).toBe(1)
      }

      const rollbackResult = await tx.rollback()
      expect(rollbackResult.success).toBe(true)

      const afterCount = await reldb.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(afterCount.success).toBe(true)
      if (afterCount.success) {
        expect(Number(afterCount.data?.count)).toBe(0)
      }
    })

    it(`${label}: tx 内 query 应读取事务快照数据`, async () => {
      await reldb.ddl.dropTable('users', true)
      await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户A'])
        const rows = await tx.query<{ name: string }>('SELECT name FROM users')
        return rows.success
          ? rows.data
          : []
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].name).toBe('用户A')
      }
    })

    it(`${label}: tx 内 get 应返回单行`, async () => {
      await reldb.ddl.dropTable('users', true)
      await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const result = await reldb.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户B'])
        const row = await tx.get<{ name: string }>('SELECT name FROM users WHERE name = ?', ['用户B'])
        return row.success ? row.data : null
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.name).toBe('用户B')
      }
    })

    it(`${label}: tx 内 get 无匹配行应返回 null`, async () => {
      await reldb.ddl.dropTable('users', true)
      await reldb.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const result = await reldb.tx.wrap(async (tx) => {
        const row = await tx.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [999])
        return row.success ? row.data : undefined
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'), { resetConnection: true })

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'), { resetConnection: true })

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'), { resetConnection: true })
})
