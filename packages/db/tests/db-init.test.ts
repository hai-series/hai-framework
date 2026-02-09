/**
 * =============================================================================
 * @hai/db - 初始化与状态测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db, DbErrorCode } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

describe('db.init', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql', options?: { database?: string }) => {
    it(`${label}: init 后应记录配置并处于已初始化状态`, async () => {
      expect(db.isInitialized).toBe(true)
      expect(db.config?.type).toBe(label)
      if (options?.database) {
        expect(db.config?.database).toBe(options.database)
      }
    })

    it(`${label}: close 后应恢复未初始化状态`, async () => {
      await db.close()
      expect(db.isInitialized).toBe(false)
      expect(db.config).toBeNull()

      const result = await db.sql.query('SELECT 1')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(DbErrorCode.NOT_INITIALIZED)
      }
    })

    it(`${label}: 重复 init 应自动关闭前一次连接`, async () => {
      expect(db.isInitialized).toBe(true)

      const secondInit = await db.init({ type: 'sqlite', database: ':memory:' })
      expect(secondInit.success).toBe(true)
      expect(db.isInitialized).toBe(true)
      expect(db.config?.type).toBe('sqlite')
    })

    it(`${label}: 无效配置应返回 CONNECTION_FAILED`, async () => {
      await db.close()

      const result = await db.init({ type: 'invalid_type' } as never)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(DbErrorCode.CONNECTION_FAILED)
      }
    })

    it(`${label}: close 多次调用应安全`, async () => {
      await db.close()
      await db.close()
      await db.close()
      expect(db.isInitialized).toBe(false)
      expect(db.config).toBeNull()
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite', { database: ':memory:' }))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
