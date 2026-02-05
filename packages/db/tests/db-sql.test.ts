/**
 * =============================================================================
 * @hai/db - SQL 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.sql', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    it(`${label}: execute/query/get 应该按预期返回结果`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const insert = await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
      expect(insert.success).toBe(true)
      if (insert.success) {
        expect(insert.data.changes).toBe(1)
      }

      const users = await db.sql.query<{ id: number, name: string }>('SELECT id, name FROM users')
      expect(users.success).toBe(true)
      if (users.success) {
        expect(users.data.length).toBe(1)
        expect(users.data[0].name).toBe('用户1')
      }

      const user = await db.sql.get<{ id: number, name: string }>('SELECT id, name FROM users WHERE id = ?', [1])
      expect(user.success).toBe(true)
      if (user.success) {
        expect(user.data?.name).toBe('用户1')
      }
    })

    it(`${label}: batch 应该在同一事务中执行`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const batch = await db.sql.batch([
        { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户1'] },
        { sql: 'INSERT INTO users (name) VALUES (?)', params: ['用户2'] },
      ])
      expect(batch.success).toBe(true)

      const count = await db.sql.get<{ count: number }>('SELECT COUNT(*) as count FROM users')
      expect(count.success).toBe(true)
      if (count.success) {
        expect(Number(count.data?.count)).toBe(2)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
