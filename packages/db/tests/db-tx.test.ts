/**
 * =============================================================================
 * @hai/db - 事务操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db, DbErrorCode } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.tx', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    it(`${label}: 事务成功应提交数据`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await db.tx(async (tx) => {
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

    it(`${label}: 事务失败应回滚并返回 TRANSACTION_FAILED`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const result = await db.tx(async (tx) => {
        await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
        throw new Error('boom')
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(DbErrorCode.TRANSACTION_FAILED)
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
