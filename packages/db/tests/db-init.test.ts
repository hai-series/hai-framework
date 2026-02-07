/**
 * =============================================================================
 * @hai/db - 初始化与状态测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { db } from '../src/index.js'
import { defineDbSuite, mysqlEnv, postgresEnv, sqliteMemoryEnv } from './helpers/db-test-suite.js'

const NOT_INITIALIZED = 3010

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

      const result = await db.sql.query('SELECT 1')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(NOT_INITIALIZED)
      }
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite', { database: ':memory:' }))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'))

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'))
})
