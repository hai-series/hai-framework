/**
 * =============================================================================
 * @hai/db - SQL 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db, DbErrorCode } from '../src/index.js'
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

    it(`${label}: query 无匹配行应返回空数组`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const result = await db.sql.query<{ id: number }>('SELECT id FROM users')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([])
      }
    })

    it(`${label}: get 无匹配行应返回 null`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const result = await db.sql.get<{ id: number }>('SELECT id FROM users WHERE id = ?', [999])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeNull()
      }
    })

    it(`${label}: execute 无匹配行应返回 changes=0`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const result = await db.sql.execute('DELETE FROM users WHERE id = ?', [999])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.changes).toBe(0)
      }
    })

    it(`${label}: 无效 SQL 应返回 QUERY_FAILED`, async () => {
      const result = await db.sql.query('SELECT * FROM nonexistent_table_xyz')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(DbErrorCode.QUERY_FAILED)
      }
    })

    it(`${label}: execute 无效 SQL 应返回失败`, async () => {
      const result = await db.sql.execute('INSERT INTO nonexistent_table_xyz (name) VALUES (?)', ['用户'])
      expect(result.success).toBe(false)
    })

    it(`${label}: batch 空语句列表应成功`, async () => {
      const result = await db.sql.batch([])
      expect(result.success).toBe(true)
    })

    it(`${label}: 参数化查询应正确绑定`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['Alice'])
      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['Bob'])
      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['Charlie'])

      const result = await db.sql.query<{ name: string }>(
        'SELECT name FROM users WHERE name LIKE ? ORDER BY name ASC',
        ['%li%'],
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(2)
        expect(result.data[0].name).toBe('Alice')
        expect(result.data[1].name).toBe('Charlie')
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
