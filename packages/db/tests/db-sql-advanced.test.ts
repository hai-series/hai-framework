/**
 * =============================================================================
 * @h-ai/db - SQL 操作进阶测试
 * =============================================================================
 *
 * 覆盖 db.sql 的进阶场景：
 * - INSERT 后 lastInsertRowid 验证
 * - UPDATE/DELETE 的 changes 精确验证
 * - 约束违反（NOT NULL、UNIQUE）
 * - batch 混合操作与失败回滚
 * - 多种列类型的读写
 * - queryPage 的 overrides.maxPageSize 截断
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.sql advanced', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    // ─── lastInsertRowid ───

    it(`${label}: execute INSERT 应返回 lastInsertRowid`, async () => {
      await db.ddl.dropTable('items', true)
      await db.ddl.createTable('items', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        title: { type: 'TEXT', notNull: true },
      })

      const r1 = await db.sql.execute('INSERT INTO items (title) VALUES (?)', ['Item A'])
      expect(r1.success).toBe(true)
      if (r1.success) {
        expect(r1.data.changes).toBe(1)
        // PostgreSQL 驱动不返回 lastInsertRowid
        if (label !== 'postgresql') {
          expect(r1.data.lastInsertRowid).toBeTruthy()
        }
      }

      const r2 = await db.sql.execute('INSERT INTO items (title) VALUES (?)', ['Item B'])
      expect(r2.success).toBe(true)
      if (r2.success) {
        // PostgreSQL 驱动不返回 lastInsertRowid，跳过此断言
        if (label !== 'postgresql') {
          expect(Number(r2.data.lastInsertRowid)).toBeGreaterThan(Number(r1.success && r1.data.lastInsertRowid))
        }
      }
    })

    // ─── changes 精确验证 ───

    it(`${label}: UPDATE 多行应返回正确 changes`, async () => {
      await db.ddl.dropTable('items', true)
      await db.ddl.createTable('items', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        title: { type: 'TEXT', notNull: true },
        status: { type: 'TEXT' },
      })

      await db.sql.execute('INSERT INTO items (title, status) VALUES (?, ?)', ['A', 'draft'])
      await db.sql.execute('INSERT INTO items (title, status) VALUES (?, ?)', ['B', 'draft'])
      await db.sql.execute('INSERT INTO items (title, status) VALUES (?, ?)', ['C', 'published'])

      const result = await db.sql.execute(
        'UPDATE items SET status = ? WHERE status = ?',
        ['archived', 'draft'],
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.changes).toBe(2)
      }
    })

    it(`${label}: DELETE 多行应返回正确 changes`, async () => {
      await db.ddl.dropTable('items', true)
      await db.ddl.createTable('items', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        title: { type: 'TEXT', notNull: true },
      })

      await db.sql.execute('INSERT INTO items (title) VALUES (?)', ['A'])
      await db.sql.execute('INSERT INTO items (title) VALUES (?)', ['B'])
      await db.sql.execute('INSERT INTO items (title) VALUES (?)', ['C'])

      const result = await db.sql.execute('DELETE FROM items WHERE id <= ?', [2])
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.changes).toBe(2)
      }

      // 验证只剩 1 条
      const remaining = await db.sql.query('SELECT * FROM items')
      expect(remaining.success).toBe(true)
      if (remaining.success) {
        expect(remaining.data).toHaveLength(1)
      }
    })

    // ─── 约束违反 ───

    it(`${label}: 违反 NOT NULL 约束应返回失败`, async () => {
      await db.ddl.dropTable('items', true)
      await db.ddl.createTable('items', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        title: { type: 'TEXT', notNull: true },
      })

      const result = await db.sql.execute('INSERT INTO items (title) VALUES (?)', [null])
      expect(result.success).toBe(false)
    })

    it(`${label}: 违反 UNIQUE 约束应返回失败`, async () => {
      await db.ddl.dropTable('items', true)
      await db.ddl.createTable('items', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        code: { type: 'TEXT', unique: true },
      })

      await db.sql.execute('INSERT INTO items (code) VALUES (?)', ['CODE-001'])
      const dup = await db.sql.execute('INSERT INTO items (code) VALUES (?)', ['CODE-001'])
      expect(dup.success).toBe(false)
    })

    // ─── batch 混合操作 ───

    it(`${label}: batch 混合 INSERT/UPDATE/DELETE 应全部生效`, async () => {
      await db.ddl.dropTable('items', true)
      await db.ddl.createTable('items', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        title: { type: 'TEXT', notNull: true },
        status: { type: 'TEXT' },
      })

      // 先插入两条基础数据
      await db.sql.execute('INSERT INTO items (title, status) VALUES (?, ?)', ['Alpha', 'draft'])
      await db.sql.execute('INSERT INTO items (title, status) VALUES (?, ?)', ['Beta', 'draft'])

      // batch: 插入 + 更新 + 删除
      const result = await db.sql.batch([
        { sql: 'INSERT INTO items (title, status) VALUES (?, ?)', params: ['Gamma', 'published'] },
        { sql: 'UPDATE items SET status = ? WHERE title = ?', params: ['archived', 'Alpha'] },
        { sql: 'DELETE FROM items WHERE title = ?', params: ['Beta'] },
      ])
      expect(result.success).toBe(true)

      const rows = await db.sql.query<{ title: string, status: string }>(
        'SELECT title, status FROM items ORDER BY title ASC',
      )
      expect(rows.success).toBe(true)
      if (rows.success) {
        expect(rows.data).toHaveLength(2)
        expect(rows.data[0]).toEqual({ title: 'Alpha', status: 'archived' })
        expect(rows.data[1]).toEqual({ title: 'Gamma', status: 'published' })
      }
    })

    it(`${label}: batch 包含无效 SQL 应整体失败`, async () => {
      await db.ddl.dropTable('items', true)
      await db.ddl.createTable('items', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        title: { type: 'TEXT', notNull: true },
      })

      await db.sql.execute('INSERT INTO items (title) VALUES (?)', ['Original'])

      const result = await db.sql.batch([
        { sql: 'INSERT INTO items (title) VALUES (?)', params: ['Valid'] },
        { sql: 'INSERT INTO nonexistent_table_xyz (col) VALUES (?)', params: ['Invalid'] },
      ])
      expect(result.success).toBe(false)

      // 由于 batch 在事务中，失败应回滚 "Valid" 这条
      const items = await db.sql.query<{ title: string }>('SELECT title FROM items')
      expect(items.success).toBe(true)
      if (items.success) {
        expect(items.data).toHaveLength(1)
        expect(items.data[0].title).toBe('Original')
      }
    })

    // ─── 多种列类型读写 ───

    it(`${label}: REAL 类型应正确存取浮点数`, async () => {
      await db.ddl.dropTable('metrics', true)
      await db.ddl.createTable('metrics', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        value: { type: 'REAL', notNull: true },
      })

      await db.sql.execute('INSERT INTO metrics (value) VALUES (?)', [3.14159])

      const result = await db.sql.get<{ value: number }>('SELECT value FROM metrics WHERE id = 1')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.value).toBeCloseTo(3.14159, 4)
      }
    })

    it(`${label}: 列默认值应在未提供值时生效`, async () => {
      await db.ddl.dropTable('configs', true)
      await db.ddl.createTable('configs', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        config_key: { type: 'TEXT', notNull: true },
        value: { type: 'TEXT', defaultValue: 'default_value' },
        priority: { type: 'INTEGER', defaultValue: 0 },
      })

      await db.sql.execute('INSERT INTO configs (config_key) VALUES (?)', ['test_key'])

      const result = await db.sql.get<{ config_key: string, value: string, priority: number }>(
        'SELECT config_key, value, priority FROM configs WHERE id = 1',
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.config_key).toBe('test_key')
        expect(result.data?.value).toBe('default_value')
        expect(result.data?.priority).toBe(0)
      }
    })

    // ─── queryPage maxPageSize 截断 ───

    it(`${label}: queryPage overrides.maxPageSize 应截断超大 pageSize`, async () => {
      await db.ddl.dropTable('items', true)
      await db.ddl.createTable('items', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        title: { type: 'TEXT', notNull: true },
      })

      for (let i = 1; i <= 5; i++) {
        await db.sql.execute('INSERT INTO items (title) VALUES (?)', [`Item ${i}`])
      }

      const result = await db.sql.queryPage<{ id: number }>({
        sql: 'SELECT id FROM items ORDER BY id ASC',
        pagination: { page: 1, pageSize: 1000 },
        overrides: { maxPageSize: 3 },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.pageSize).toBe(3)
        expect(result.data.items).toHaveLength(3)
        expect(result.data.total).toBe(5)
      }
    })

    // ─── query 返回多列类型 ───

    it(`${label}: 查询结果应正确返回多列不同类型`, async () => {
      await db.ddl.dropTable('products', true)
      await db.ddl.createTable('products', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        price: { type: 'REAL' },
        active: { type: 'BOOLEAN' },
      })

      const activeVal = label === 'postgresql' ? true : 1
      await db.sql.execute(
        'INSERT INTO products (name, price, active) VALUES (?, ?, ?)',
        ['Widget', 9.99, activeVal],
      )

      const result = await db.sql.get<{ id: number, name: string, price: number, active: number | boolean }>(
        'SELECT * FROM products WHERE id = 1',
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data?.name).toBe('Widget')
        expect(result.data?.price).toBeCloseTo(9.99, 2)
        // BOOLEAN 实际存储因驱动而异（SQLite: 1, PG: true, MySQL: 1）
        expect(result.data?.active).toBeTruthy()
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
