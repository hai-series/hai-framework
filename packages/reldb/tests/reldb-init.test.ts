/**
 * =============================================================================
 * @h-ai/reldb - 初始化与状态测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { HaiReldbError, reldb } from '../src/index.js'
import { defineDbSuite, mysqlDockerOpts, mysqlEnv, postgresDockerOpts, postgresEnv, sqliteMemoryEnv } from './helpers/reldb-test-suite.js'

describe('reldb.init', () => {
  const defineCommon = (label: 'sqlite' | 'mysql' | 'postgresql', options?: { database?: string }) => {
    it(`${label}: init 后应记录配置并处于已初始化状态`, async () => {
      expect(reldb.isInitialized).toBe(true)
      expect(reldb.config?.type).toBe(label)
      if (options?.database) {
        expect(reldb.config?.database).toBe(options.database)
      }
    })

    it(`${label}: close 后应恢复未初始化状态`, async () => {
      await reldb.close()
      expect(reldb.isInitialized).toBe(false)
      expect(reldb.config).toBeNull()

      const result = await reldb.sql.query('SELECT 1')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.NOT_INITIALIZED.code)
      }
    })

    it(`${label}: 重复 init 应自动关闭前一次连接`, async () => {
      expect(reldb.isInitialized).toBe(true)

      const secondInit = await reldb.init({ type: 'sqlite', database: ':memory:' })
      expect(secondInit.success).toBe(true)
      expect(reldb.isInitialized).toBe(true)
      expect(reldb.config?.type).toBe('sqlite')
    })

    it(`${label}: 无效配置应返回 CONFIG_ERROR`, async () => {
      await reldb.close()

      const result = await reldb.init({ type: 'invalid_type' } as never)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiReldbError.CONFIG_ERROR.code)
      }
    })

    it(`${label}: close 多次调用应安全`, async () => {
      await reldb.close()
      await reldb.close()
      await reldb.close()
      expect(reldb.isInitialized).toBe(false)
      expect(reldb.config).toBeNull()
    })
  }

  defineDbSuite('sqlite', sqliteMemoryEnv, () => defineCommon('sqlite', { database: ':memory:' }))

  defineDbSuite('mysql', mysqlEnv, () => defineCommon('mysql'), mysqlDockerOpts)

  defineDbSuite('postgresql', postgresEnv, () => defineCommon('postgresql'), postgresDockerOpts)
})
