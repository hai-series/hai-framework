/**
 * =============================================================================
 * @hai/db - 分页查询测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.pagination', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    it(`${label}: sql.queryPage 应返回正确分页`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const insert1 = await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
      const insert2 = await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
      const insert3 = await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户3'])
      expect(insert1.success).toBe(true)
      expect(insert2.success).toBe(true)
      expect(insert3.success).toBe(true)

      const firstPage = await db.sql.queryPage<{ id: number, name: string }>({
        sql: 'SELECT id, name FROM users ORDER BY id ASC',
        pagination: { page: 1, pageSize: 2 },
      })

      expect(firstPage.success).toBe(true)
      if (!firstPage.success) {
        return
      }

      expect(firstPage.data.total).toBe(3)
      expect(firstPage.data.page).toBe(1)
      expect(firstPage.data.pageSize).toBe(2)
      expect(firstPage.data.items).toHaveLength(2)
      expect(firstPage.data.items[0].name).toBe('用户1')

      const secondPage = await db.sql.queryPage<{ id: number, name: string }>({
        sql: 'SELECT id, name FROM users ORDER BY id ASC',
        pagination: { page: 2, pageSize: 2 },
      })

      expect(secondPage.success).toBe(true)
      if (!secondPage.success) {
        return
      }

      expect(secondPage.data.total).toBe(3)
      expect(secondPage.data.items).toHaveLength(1)
      expect(secondPage.data.items[0].name).toBe('用户3')
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
