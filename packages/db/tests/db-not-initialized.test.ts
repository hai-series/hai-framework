/**
 * =============================================================================
 * @hai/db - 未初始化行为测试
 * =============================================================================
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/index.js'

const NOT_INITIALIZED = 3010

describe.sequential('db (not initialized)', () => {
  beforeEach(async () => {
    await db.close()
  })

  it('ddl 操作应返回 NOT_INITIALIZED', async () => {
    const result = await db.ddl.createTable('users', {
      id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(NOT_INITIALIZED)
    }
  })

  it('sql 操作应返回 NOT_INITIALIZED', async () => {
    const result = await db.sql.query('SELECT 1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(NOT_INITIALIZED)
    }
  })

  it('tx 操作应返回 NOT_INITIALIZED', async () => {
    const result = await db.tx(async (tx) => {
      await tx.execute('INSERT INTO users (name) VALUES (?)', ['用户A'])
      return 1
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(NOT_INITIALIZED)
    }
  })
})
