/**
 * =============================================================================
 * @hai/db - 事务操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

const TRANSACTION_FAILED = 3003

describe('db.tx', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    it(`${label}: 事务成功应提交数据`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await db.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
        return 'ok'
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('ok')
      }

      const count = await db.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(2)
      }
    })

    it(`${label}: 事务内 batch 应执行全部语句`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await db.tx.wrap(async (tx) => {
        await tx.batch([
          { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户1'] },
          { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户2'] },
        ])
        return 'ok'
      })

      expect(result.success).toBe(true)

      const count = await db.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(2)
      }
    })

    it(`${label}: 事务内分页查询应返回总数`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await db.tx.wrap(async (tx) => {
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
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await db.tx.wrap(async (tx) => {
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
        throw new Error('boom')
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(TRANSACTION_FAILED)
      }

      const count = await db.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(0)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
