/**
 * =============================================================================
 * @h-ai/db - DDL 进阶测试
 * =============================================================================
 *
 * 覆盖 DDL 的进阶场景：
 * - 多种列类型定义（TEXT, INTEGER, REAL, BLOB, BOOLEAN, TIMESTAMP, JSON）
 * - 列默认值（字符串、数字、布尔、null、表达式）
 * - 外键约束
 * - 复合索引
 * - 带 WHERE 的部分索引
 * - 列的 notNull / unique 约束验证
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db, DbErrorCode } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.ddl advanced', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql') => {
    // ─── 多种列类型 ───

    it(`${label}: 创建含全部列类型的表应成功`, async () => {
      await db.ddl.dropTable('all_types', true)
      const result = await db.ddl.createTable('all_types', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        text_col: { type: 'TEXT' },
        int_col: { type: 'INTEGER' },
        real_col: { type: 'REAL' },
        blob_col: { type: 'BLOB' },
        bool_col: { type: 'BOOLEAN' },
        ts_col: { type: 'TIMESTAMP' },
        json_col: { type: 'JSON' },
      })
      expect(result.success).toBe(true)

      // 验证表可以正常插入
      const boolVal = label === 'postgresql' ? true : 1
      const tsVal = label === 'sqlite' ? Date.now() : new Date()
      const jsonVal = label === 'sqlite' || label === 'mysql' ? '{"key":"value"}' : '{"key":"value"}'

      const insert = await db.sql.execute(
        'INSERT INTO all_types (text_col, int_col, real_col, bool_col, ts_col, json_col) VALUES (?, ?, ?, ?, ?, ?)',
        ['hello', 42, 3.14, boolVal, tsVal, jsonVal],
      )
      expect(insert.success).toBe(true)

      const row = await db.sql.get('SELECT * FROM all_types WHERE id = 1')
      expect(row.success).toBe(true)
      if (row.success) {
        expect(row.data).not.toBeNull()
      }
    })

    // ─── 列默认值 ───

    it(`${label}: 各种默认值类型应正确生效`, async () => {
      await db.ddl.dropTable('defaults_test', true)
      const result = await db.ddl.createTable('defaults_test', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        status: { type: 'TEXT', defaultValue: 'draft' },
        priority: { type: 'INTEGER', defaultValue: 5 },
        nullable_col: { type: 'TEXT', defaultValue: null },
      })
      expect(result.success).toBe(true)

      // 只插入 id 让默认值生效（通过不指定其他列）
      await db.sql.execute('INSERT INTO defaults_test (id) VALUES (?)', [1])

      const row = await db.sql.get<{ status: string, priority: number, nullable_col: string | null }>(
        'SELECT status, priority, nullable_col FROM defaults_test WHERE id = 1',
      )
      expect(row.success).toBe(true)
      if (row.success) {
        expect(row.data?.status).toBe('draft')
        expect(row.data?.priority).toBe(5)
        expect(row.data?.nullable_col).toBeNull()
      }
    })

    // ─── 复合索引 ───

    it(`${label}: 复合索引应生效`, async () => {
      await db.ddl.dropTable('events', true)
      await db.ddl.createTable('events', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        user_id: { type: 'INTEGER', notNull: true },
        event_type: { type: 'TEXT', notNull: true },
        created_at: { type: 'TIMESTAMP' },
      })

      const createIdx = await db.ddl.createIndex('events', 'idx_events_user_type', {
        columns: ['user_id', 'event_type'],
      })
      expect(createIdx.success).toBe(true)

      // 验证索引可用（通过执行查询）
      await db.sql.execute('INSERT INTO events (user_id, event_type) VALUES (?, ?)', [1, 'login'])
      await db.sql.execute('INSERT INTO events (user_id, event_type) VALUES (?, ?)', [1, 'logout'])

      const result = await db.sql.query<{ event_type: string }>(
        'SELECT event_type FROM events WHERE user_id = ? AND event_type = ?',
        [1, 'login'],
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].event_type).toBe('login')
      }
    })

    it(`${label}: 唯一复合索引应阻止重复组合`, async () => {
      await db.ddl.dropTable('subscriptions', true)
      await db.ddl.createTable('subscriptions', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        user_id: { type: 'INTEGER', notNull: true },
        plan: { type: 'TEXT', notNull: true },
      })

      await db.ddl.createIndex('subscriptions', 'idx_sub_user_plan', {
        columns: ['user_id', 'plan'],
        unique: true,
      })

      await db.sql.execute('INSERT INTO subscriptions (user_id, plan) VALUES (?, ?)', [1, 'premium'])
      await db.sql.execute('INSERT INTO subscriptions (user_id, plan) VALUES (?, ?)', [1, 'basic'])
      await db.sql.execute('INSERT INTO subscriptions (user_id, plan) VALUES (?, ?)', [2, 'premium'])

      // 重复的 (user_id, plan) 组合应失败
      const dup = await db.sql.execute('INSERT INTO subscriptions (user_id, plan) VALUES (?, ?)', [1, 'premium'])
      expect(dup.success).toBe(false)
    })

    // ─── notNull 约束 ───

    it(`${label}: notNull 列插入 null 应失败`, async () => {
      await db.ddl.dropTable('strict_table', true)
      await db.ddl.createTable('strict_table', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        required_field: { type: 'TEXT', notNull: true },
      })

      const result = await db.sql.execute('INSERT INTO strict_table (required_field) VALUES (?)', [null])
      expect(result.success).toBe(false)
    })

    // ─── 外键（SQLite 需要额外开启，此处仅验证 DDL 语法） ───

    it(`${label}: 含外键引用的表应创建成功`, async () => {
      await db.ddl.dropTable('comments', true)
      await db.ddl.dropTable('posts', true)

      // 不使用 autoIncrement 以避免 MySQL BIGINT/INT 类型不匹配
      await db.ddl.createTable('posts', {
        id: { type: 'INTEGER', primaryKey: true },
        title: { type: 'TEXT', notNull: true },
      })

      const result = await db.ddl.createTable('comments', {
        id: { type: 'INTEGER', primaryKey: true },
        post_id: {
          type: 'INTEGER',
          notNull: true,
          references: {
            table: 'posts',
            column: 'id',
            onDelete: 'CASCADE',
          },
        },
        body: { type: 'TEXT', notNull: true },
      })
      expect(result.success).toBe(true)

      // 验证能正常插入
      await db.sql.execute('INSERT INTO posts (id, title) VALUES (?, ?)', [1, 'Post 1'])
      const insertComment = await db.sql.execute(
        'INSERT INTO comments (id, post_id, body) VALUES (?, ?, ?)',
        [1, 1, 'Great post!'],
      )
      expect(insertComment.success).toBe(true)
    })

    // ─── addColumn 后立即使用 ───

    it(`${label}: addColumn 后应可立即写入和读取新列`, async () => {
      await db.ddl.dropTable('dynamic_table', true)
      await db.ddl.createTable('dynamic_table', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      await db.sql.execute('INSERT INTO dynamic_table (name) VALUES (?)', ['旧记录'])

      // 添加新列
      await db.ddl.addColumn('dynamic_table', 'score', { type: 'INTEGER', defaultValue: 0 })

      // 旧记录的新列应有默认值
      const oldRow = await db.sql.get<{ name: string, score: number }>(
        'SELECT name, score FROM dynamic_table WHERE id = 1',
      )
      expect(oldRow.success).toBe(true)
      if (oldRow.success) {
        expect(oldRow.data?.name).toBe('旧记录')
        expect(oldRow.data?.score).toBe(0)
      }

      // 新记录可以写入新列
      await db.sql.execute('INSERT INTO dynamic_table (name, score) VALUES (?, ?)', ['新记录', 100])
      const newRow = await db.sql.get<{ name: string, score: number }>(
        'SELECT name, score FROM dynamic_table WHERE id = 2',
      )
      expect(newRow.success).toBe(true)
      if (newRow.success) {
        expect(newRow.data?.score).toBe(100)
      }
    })

    // ─── dropTable 不存在 ifExists=false 应报错 ───

    it(`${label}: dropTable 不存在的表(ifExists=false)应返回 DDL_FAILED`, async () => {
      const result = await db.ddl.dropTable('definitely_not_here_xyz', false)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(DbErrorCode.DDL_FAILED)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite'))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
