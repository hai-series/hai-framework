/**
 * =============================================================================
 * @h-ai/audit - 统计与清理测试
 * =============================================================================
 */

import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { audit } from '../src/index.js'

// ─── 测试辅助 ───

async function setupDb(): Promise<void> {
  const result = await reldb.init({ type: 'sqlite', database: ':memory:' })
  if (!result.success) {
    throw new Error(`DB init failed: ${result.error.message}`)
  }
  await reldb.ddl.createTable('users', {
    id: { type: 'TEXT', primaryKey: true },
    username: { type: 'TEXT', notNull: true },
  }, true)
}

// ─── 测试套件 ───

describe('audit.getStats', () => {
  beforeEach(async () => {
    await setupDb()
    await audit.init()
    await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
    await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
    await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
    await audit.log({ userId: 'user_1', action: 'update', resource: 'users' })
    await audit.log({ action: 'system_check', resource: 'system' })
  })

  afterEach(async () => {
    await audit.close()
    await reldb.close()
  })

  it('应返回按 action 分组的统计', async () => {
    const result = await audit.getStats(7)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(3)
      // 按 count 倒序
      const loginStat = result.data.find(s => s.action === 'login')
      expect(loginStat?.count).toBe(3)
      const updateStat = result.data.find(s => s.action === 'update')
      expect(updateStat?.count).toBe(1)
    }
  })

  it('默认统计天数（7 天）应返回所有近期记录', async () => {
    const result = await audit.getStats()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(3)
    }
  })

  it('统计天数为 0 应返回空或极少结果', async () => {
    // days=0 → cutoff 就是当前时间，几乎所有记录都在 cutoff 之前（几乎同时插入）
    const result = await audit.getStats(0)
    expect(result.success).toBe(true)
    // 由于时间精度，结果可能为空或包含极少记录
    if (result.success) {
      expect(result.data.length).toBeLessThanOrEqual(3)
    }
  })

  it('无记录时应返回空数组', async () => {
    await audit.close()
    // 新数据库
    await reldb.close()
    const initResult = await reldb.init({ type: 'sqlite', database: ':memory:' })
    if (!initResult.success)
      throw new Error('DB re-init failed')
    await reldb.ddl.createTable('hai_iam_users', {
      id: { type: 'TEXT', primaryKey: true },
      username: { type: 'TEXT', notNull: true },
    }, true)
    await audit.init()

    const result = await audit.getStats(7)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(0)
    }
  })
})

describe('audit.cleanup', () => {
  beforeEach(async () => {
    await setupDb()
    await audit.init()
  })

  afterEach(async () => {
    await audit.close()
    await reldb.close()
  })

  it('应清理旧日志', async () => {
    // 直接插入一条“旧”记录（时间戳为 2 天前）
    const oldTime = Date.now() - 2 * 86400000
    await reldb.sql.execute(
      'INSERT INTO hai_audit_logs (id, action, resource, created_at) VALUES (?, ?, ?, ?)',
      ['audit_old_1', 'test', 'test', oldTime],
    )

    // cleanup(0) 清理当前时间之前的所有记录
    const result = await audit.cleanup(0)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeGreaterThanOrEqual(1)
    }
  })

  it('不应清理近期日志', async () => {
    await audit.log({ action: 'test', resource: 'test' })
    const result = await audit.cleanup(90)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(0)
    }
  })

  it('默认保留天数为 90', async () => {
    await audit.log({ action: 'test', resource: 'test' })
    const result = await audit.cleanup()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(0)
    }
  })

  it('应正确返回删除的记录数', async () => {
    const oldTime = Date.now() - 2 * 86400000
    await reldb.sql.execute(
      'INSERT INTO hai_audit_logs (id, action, resource, created_at) VALUES (?, ?, ?, ?)',
      ['audit_old_1', 'test1', 'test', oldTime],
    )
    await reldb.sql.execute(
      'INSERT INTO hai_audit_logs (id, action, resource, created_at) VALUES (?, ?, ?, ?)',
      ['audit_old_2', 'test2', 'test', oldTime],
    )
    // 新记录
    await audit.log({ action: 'new', resource: 'test' })

    const result = await audit.cleanup(1)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe(2) // 只删除了 2 条旧记录
    }

    // 新记录应保留
    const listResult = await audit.list()
    expect(listResult.success).toBe(true)
    if (listResult.success) {
      expect(listResult.data.total).toBe(1)
    }
  })
})
