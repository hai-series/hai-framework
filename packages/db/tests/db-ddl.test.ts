/**
 * =============================================================================
 * @hai/db - DDL 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.ddl', () => {
  const defineCommon = (options: {
    label: 'sqlite' | 'mysql' | 'postgresql'
    columnQuery: string
    indexQuery: string
  }) => {
    it(`${options.label}: createTable/addColumn/createIndex 应该生效`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const addColumn = await db.ddl.addColumn('users', 'email', { type: 'TEXT' })
      expect(addColumn.success).toBe(true)

      const createIndex = await db.ddl.createIndex('users', 'idx_users_email', {
        columns: ['email'],
        unique: true,
      })
      expect(createIndex.success).toBe(true)

      const columns = await db.sql.query<{ name: string }>(options.columnQuery)
      expect(columns.success).toBe(true)
      if (columns.success) {
        const names = columns.data.map(row => row.name)
        expect(names).toContain('email')
      }

      const index = await db.sql.get<{ name: string }>(options.indexQuery, ['idx_users_email'])
      expect(index.success).toBe(true)
      if (index.success) {
        expect(index.data?.name).toBe('idx_users_email')
      }
    })

    it(`${options.label}: raw DDL 应该可执行`, async () => {
      await db.ddl.dropTable('posts', true)
      const createTable = await db.ddl.createTable('posts', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        title: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const raw = await db.ddl.raw('ALTER TABLE posts ADD COLUMN status TEXT')
      expect(raw.success).toBe(true)
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon({
    label: 'sqlite',
    columnQuery: 'PRAGMA table_info(users)',
    indexQuery: 'SELECT name FROM sqlite_master WHERE type = \'index\' AND name = ?',
  }))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon({
    label: 'mysql',
    columnQuery: 'SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'users\'',
    indexQuery: 'SELECT INDEX_NAME as name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'users\' AND INDEX_NAME = ?',
  }))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon({
    label: 'postgresql',
    columnQuery: 'SELECT column_name as name FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = \'users\'',
    indexQuery: 'SELECT indexname as name FROM pg_indexes WHERE schemaname = \'public\' AND tablename = \'users\' AND indexname = ?',
  }))
})
