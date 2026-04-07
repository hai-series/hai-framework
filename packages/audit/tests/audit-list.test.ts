/**
 * =============================================================================
 * @h-ai/audit - 列表查询与用户最近活动测试
 * =============================================================================
 */

import { reldb } from '@h-ai/reldb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { audit, HaiAuditError } from '../src/index.js'

// ─── 测试辅助 ───

async function setupDb(): Promise<void> {
  const result = await reldb.init({ type: 'sqlite', database: ':memory:' })
  if (!result.success) {
    throw new Error(`DB init failed: ${result.error.message}`)
  }
  await reldb.ddl.createTable('hai_iam_users', {
    id: { type: 'TEXT', primaryKey: true },
    username: { type: 'TEXT', notNull: true },
  }, true)
  await reldb.sql.execute(
    'INSERT INTO hai_iam_users (id, username) VALUES (?, ?)',
    ['user_1', 'testuser'],
  )
  await reldb.sql.execute(
    'INSERT INTO hai_iam_users (id, username) VALUES (?, ?)',
    ['user_2', 'anotheruser'],
  )
}

// ─── 测试套件 ───

describe('audit.list', () => {
  beforeEach(async () => {
    await setupDb()
    await audit.init()
    // 插入测试数据
    await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
    await audit.log({ userId: 'user_1', action: 'update', resource: 'users', resourceId: 'user_2' })
    await audit.log({ action: 'system_check', resource: 'system' })
  })

  afterEach(async () => {
    await audit.close()
    await reldb.close()
  })

  // ─── 分页 ───

  it('应返回分页结果（含 total）', async () => {
    const result = await audit.list({ pageSize: 2 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(2)
      expect(result.data.total).toBe(3)
    }
  })

  it('默认 pageSize 应返回所有记录（不超过 20）', async () => {
    const result = await audit.list()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(3)
      expect(result.data.total).toBe(3)
    }
  })

  it('第二页应返回剩余记录', async () => {
    const result = await audit.list({ page: 2, pageSize: 2 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(1)
      expect(result.data.total).toBe(3)
    }
  })

  // ─── 用户名 JOIN ───

  it('应通过 JOIN 获取用户名', async () => {
    const result = await audit.list({ userId: 'user_1' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(2)
      expect(result.data.items[0].username).toBe('testuser')
    }
  })

  it('无 userId 的日志应返回 username 为 null', async () => {
    const result = await audit.list({ resource: 'system' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(1)
      expect(result.data.items[0].username).toBeNull()
    }
  })

  // ─── 过滤条件 ───

  it('应按 action 过滤', async () => {
    const result = await audit.list({ action: 'login' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(1)
      expect(result.data.items[0].action).toBe('login')
    }
  })

  it('应按 resource 过滤', async () => {
    const result = await audit.list({ resource: 'system' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(1)
      expect(result.data.items[0].resource).toBe('system')
    }
  })

  it('不存在的 action 应返回空列表', async () => {
    const result = await audit.list({ action: 'nonexistent' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(0)
      expect(result.data.total).toBe(0)
    }
  })

  it('应按日期范围过滤', async () => {
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 86400000)
    const yesterday = new Date(now.getTime() - 86400000)

    // 所有记录在 yesterday~tomorrow 之间
    const result = await audit.list({ startDate: yesterday, endDate: tomorrow })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.length).toBe(3)
    }

    // 未来的起始时间应不返回任何记录
    const emptyResult = await audit.list({ startDate: tomorrow })
    expect(emptyResult.success).toBe(true)
    if (emptyResult.success) {
      expect(emptyResult.data.items.length).toBe(0)
    }
  })

  it('startDate 晚于 endDate 时应返回 QUERY_FAILED', async () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000)
    const result = await audit.list({ startDate: now, endDate: yesterday })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAuditError.QUERY_FAILED.code)
    }
  })

  // ─── 排序 ───

  it('应按 createdAt 倒序排列', async () => {
    const result = await audit.list()
    expect(result.success).toBe(true)
    if (result.success) {
      // 验证结果是按时间倒序（或至少相等时间不报错）
      for (let i = 1; i < result.data.items.length; i++) {
        const prev = new Date(result.data.items[i - 1].createdAt).getTime()
        const curr = new Date(result.data.items[i].createdAt).getTime()
        expect(prev).toBeGreaterThanOrEqual(curr)
      }
    }
  })
})

describe('audit.getUserRecent', () => {
  beforeEach(async () => {
    await setupDb()
    await audit.init()
    await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
    await audit.log({ userId: 'user_1', action: 'update', resource: 'users' })
    await audit.log({ userId: 'user_1', action: 'logout', resource: 'auth' })
    await audit.log({ userId: 'user_2', action: 'login', resource: 'auth' })
  })

  afterEach(async () => {
    await audit.close()
    await reldb.close()
  })

  it('应返回指定用户的活动记录', async () => {
    const result = await audit.getUserRecent('user_1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(3)
      // 所有记录都属于 user_1
      result.data.forEach(log => expect(log.userId).toBe('user_1'))
    }
  })

  it('应遵守 limit 限制', async () => {
    const result = await audit.getUserRecent('user_1', 2)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(2)
    }
  })

  it('不存在的用户应返回空数组', async () => {
    const result = await audit.getUserRecent('nonexistent')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.length).toBe(0)
    }
  })

  it('limit=0 应返回 QUERY_FAILED', async () => {
    const result = await audit.getUserRecent('user_1', 0)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAuditError.QUERY_FAILED.code)
    }
  })

  it('空 userId 应返回 QUERY_FAILED', async () => {
    const result = await audit.getUserRecent('   ', 5)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAuditError.QUERY_FAILED.code)
    }
  })
})
