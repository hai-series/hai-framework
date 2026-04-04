/**
 * =============================================================================
 * @h-ai/audit - 日志记录测试
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
}

// ─── 测试套件 ───

describe('audit.log', () => {
  beforeEach(async () => {
    await setupDb()
    await audit.init()
  })

  afterEach(async () => {
    await audit.close()
    await reldb.close()
  })

  // ─── 基本记录 ───

  it('应记录包含完整字段的审计日志', async () => {
    const result = await audit.log({
      userId: 'user_1',
      action: 'login',
      resource: 'auth',
      resourceId: 'sess_123',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toMatch(/^audit_/)
      expect(result.data.action).toBe('login')
      expect(result.data.resource).toBe('auth')
      expect(result.data.userId).toBe('user_1')
      expect(result.data.resourceId).toBe('sess_123')
      expect(result.data.ipAddress).toBe('127.0.0.1')
      expect(result.data.userAgent).toBe('Mozilla/5.0')
      expect(result.data.createdAt).toBeInstanceOf(Date)
    }
  })

  it('应记录包含 details 的日志', async () => {
    const details = { field: 'name', oldValue: 'Alice', newValue: 'Bob' }
    const result = await audit.log({
      action: 'update',
      resource: 'users',
      resourceId: 'user_1',
      details,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.details).toBeTruthy()
      const parsed = JSON.parse(result.data.details!)
      expect(parsed.field).toBe('name')
      expect(parsed.oldValue).toBe('Alice')
      expect(parsed.newValue).toBe('Bob')
    }
  })

  // ─── 可选字段 ───

  it('应处理仅必填字段的日志（userId 和其他可选字段为 null）', async () => {
    const result = await audit.log({
      action: 'system_check',
      resource: 'system',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.userId).toBeNull()
      expect(result.data.resourceId).toBeNull()
      expect(result.data.details).toBeNull()
      expect(result.data.ipAddress).toBeNull()
      expect(result.data.userAgent).toBeNull()
    }
  })

  it('应处理显式传入 null 的 details', async () => {
    const result = await audit.log({
      action: 'test',
      resource: 'test',
      details: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.details).toBeNull()
    }
  })

  it('应处理空 details 对象', async () => {
    const result = await audit.log({
      action: 'test',
      resource: 'test',
      details: {},
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.details).toBe('{}')
    }
  })

  // ─── 多条记录 ───

  it('应为每条日志生成不同的 ID', async () => {
    const result1 = await audit.log({ action: 'a1', resource: 'r1' })
    const result2 = await audit.log({ action: 'a2', resource: 'r2' })

    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)
    if (result1.success && result2.success) {
      expect(result1.data.id).not.toBe(result2.data.id)
    }
  })

  // ─── 输入校验 ───

  it('action 为空字符串时应返回 LOG_FAILED', async () => {
    const result = await audit.log({ action: '   ', resource: 'auth' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAuditError.LOG_FAILED.code)
    }
  })

  it('resource 超长时应返回 LOG_FAILED', async () => {
    const result = await audit.log({
      action: 'login',
      resource: 'a'.repeat(300),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAuditError.LOG_FAILED.code)
    }
  })
})
