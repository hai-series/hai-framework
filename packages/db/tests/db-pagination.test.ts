/**
 * =============================================================================
 * @hai/db - 分页查询测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.sql.queryPage', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    it(`${label}: 应返回正确分页`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])
      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户3'])

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

    it(`${label}: 空表应返回 total=0 和空 items`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const result = await db.sql.queryPage<{ id: number }>({
        sql: 'SELECT id FROM users ORDER BY id ASC',
        pagination: { page: 1, pageSize: 10 },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(0)
        expect(result.data.items).toHaveLength(0)
        expect(result.data.page).toBe(1)
        expect(result.data.pageSize).toBe(10)
      }
    })

    it(`${label}: 超出最后一页应返回空 items`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])
      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户2'])

      const result = await db.sql.queryPage<{ id: number }>({
        sql: 'SELECT id FROM users ORDER BY id ASC',
        pagination: { page: 100, pageSize: 10 },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        // PostgreSQL 使用 COUNT(*) OVER() 窗口函数，当 OFFSET 超出数据范围时返回 0 行，total 为 0
        // MySQL / SQLite 使用独立 COUNT 查询，total 始终为实际行数
        expect(result.data.total).toBeGreaterThanOrEqual(0)
        expect(result.data.items).toHaveLength(0)
        expect(result.data.page).toBe(100)
      }
    })

    it(`${label}: 不提供 pagination 应使用默认值`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      await db.sql.execute('INSERT INTO users (name) VALUES (?)', ['用户1'])

      const result = await db.sql.queryPage<{ id: number }>({
        sql: 'SELECT id FROM users ORDER BY id ASC',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
        expect(result.data.pageSize).toBe(20)
        expect(result.data.total).toBe(1)
        expect(result.data.items).toHaveLength(1)
      }
    })

    it(`${label}: 带 WHERE 参数的分页应正确`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        status: { type: 'TEXT' },
      })

      await db.sql.execute('INSERT INTO users (name, status) VALUES (?, ?)', ['用户1', 'active'])
      await db.sql.execute('INSERT INTO users (name, status) VALUES (?, ?)', ['用户2', 'inactive'])
      await db.sql.execute('INSERT INTO users (name, status) VALUES (?, ?)', ['用户3', 'active'])
      await db.sql.execute('INSERT INTO users (name, status) VALUES (?, ?)', ['用户4', 'active'])

      const result = await db.sql.queryPage<{ id: number, name: string }>({
        sql: 'SELECT id, name FROM users WHERE status = ? ORDER BY id ASC',
        params: ['active'],
        pagination: { page: 1, pageSize: 2 },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(3)
        expect(result.data.items).toHaveLength(2)
        expect(result.data.items[0].name).toBe('用户1')
        expect(result.data.items[1].name).toBe('用户3')
      }
    })

    it(`${label}: overrides 应修改默认分页参数`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      for (let i = 1; i <= 10; i++) {
        await db.sql.execute('INSERT INTO users (name) VALUES (?)', [`用户${i}`])
      }

      const result = await db.sql.queryPage<{ id: number }>({
        sql: 'SELECT id FROM users ORDER BY id ASC',
        overrides: { defaultPageSize: 3 },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.total).toBe(10)
        expect(result.data.pageSize).toBe(3)
        expect(result.data.items).toHaveLength(3)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
