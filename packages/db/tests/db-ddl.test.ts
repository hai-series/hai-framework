/**
 * =============================================================================
 * @hai/db - DDL 操作测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db, DbErrorCode } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.ddl', () => {
  const defineCommon = (options: {
    label: 'sqlite' | 'mysql' | 'postgresql'
    columnQuery: string
    indexQuery: string
    tableQuery: string
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

    it(`${options.label}: dropIndex 应该生效`, async () => {
      await db.ddl.dropTable('users', true)
      const createTable = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const createIndex = await db.ddl.createIndex('users', 'idx_users_email', {
        columns: ['name'],
        unique: true,
      })
      expect(createIndex.success).toBe(true)

      const dropIndex = await db.ddl.dropIndex('idx_users_email', true)
      expect(dropIndex.success).toBe(true)

      const index = await db.sql.get<{ name: string }>(options.indexQuery, ['idx_users_email'])
      expect(index.success).toBe(true)
      if (index.success) {
        expect(index.data).toBeNull()
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

    it(`${options.label}: renameTable 应该生效`, async () => {
      await db.ddl.dropTable('temp_table', true)
      await db.ddl.dropTable('renamed_table', true)

      const createTable = await db.ddl.createTable('temp_table', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })
      expect(createTable.success).toBe(true)

      const rename = await db.ddl.renameTable('temp_table', 'renamed_table')
      expect(rename.success).toBe(true)

      const check = await db.sql.get<{ name: string }>(options.tableQuery, ['renamed_table'])
      expect(check.success).toBe(true)
      if (check.success) {
        expect(check.data).not.toBeNull()
      }

      await db.ddl.dropTable('renamed_table', true)
    })

    it(`${options.label}: dropColumn 应该生效`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        age: { type: 'INTEGER' },
      })

      const drop = await db.ddl.dropColumn('users', 'age')
      expect(drop.success).toBe(true)

      const columns = await db.sql.query<{ name: string }>(options.columnQuery)
      expect(columns.success).toBe(true)
      if (columns.success) {
        const names = columns.data.map(row => row.name)
        expect(names).not.toContain('age')
        expect(names).toContain('name')
      }
    })

    it(`${options.label}: dropTable 不存在的表(ifExists=true)应成功`, async () => {
      const result = await db.ddl.dropTable('nonexistent_xyz', true)
      expect(result.success).toBe(true)
    })

    it(`${options.label}: createTable ifNotExists=true 重复建表应成功`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const duplicate = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      }, true)
      expect(duplicate.success).toBe(true)
    })

    it(`${options.label}: createTable ifNotExists=false 重复建表应返回 DDL_FAILED`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      })

      const duplicate = await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
      }, false)
      expect(duplicate.success).toBe(false)
      if (!duplicate.success) {
        expect(duplicate.error.code).toBe(DbErrorCode.DDL_FAILED)
      }
    })

    it(`${options.label}: createIndex 唯一索引应该生效`, async () => {
      await db.ddl.dropTable('users', true)
      await db.ddl.createTable('users', {
        id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
        name: { type: 'TEXT', notNull: true },
        email: { type: 'TEXT' },
      })

      const createIdx = await db.ddl.createIndex('users', 'idx_u_email_unique', {
        columns: ['email'],
        unique: true,
      })
      expect(createIdx.success).toBe(true)

      await db.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['用户1', 'a@test.com'])
      const dup = await db.sql.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['用户2', 'a@test.com'])
      expect(dup.success).toBe(false)
    })

    it(`${options.label}: raw DDL 无效语句应返回 DDL_FAILED`, async () => {
      const result = await db.ddl.raw('THIS IS NOT VALID SQL')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(DbErrorCode.DDL_FAILED)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon({
    label: 'sqlite',
    columnQuery: 'PRAGMA table_info(users)',
    indexQuery: 'SELECT name FROM sqlite_master WHERE type = \'index\' AND name = ?',
    tableQuery: 'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?',
  }))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon({
    label: 'mysql',
    columnQuery: 'SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'users\'',
    indexQuery: 'SELECT INDEX_NAME as name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'users\' AND INDEX_NAME = ?',
    tableQuery: 'SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
  }))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon({
    label: 'postgresql',
    columnQuery: 'SELECT column_name as name FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = \'users\'',
    indexQuery: 'SELECT indexname as name FROM pg_indexes WHERE schemaname = \'public\' AND tablename = \'users\' AND indexname = ?',
    tableQuery: 'SELECT tablename as name FROM pg_tables WHERE schemaname = \'public\' AND tablename = ?',
  }))
})
