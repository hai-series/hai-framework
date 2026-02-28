/**
 * =============================================================================
 * @h-ai/audit - 基础功能测试
 * =============================================================================
 */

import { db } from '@h-ai/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuditErrorCode } from '../src/audit-config.js'
import { audit } from '../src/audit-main.js'

// =============================================================================
// 测试辅助
// =============================================================================

async function setupDb(): Promise<void> {
  const result = await db.init({ type: 'sqlite', database: ':memory:' })
  if (!result.success) {
    throw new Error(`DB init failed: ${result.error.message}`)
  }
  // 创建 users 表（审计 list 需要 JOIN）
  await db.ddl.createTable('users', {
    id: { type: 'TEXT', primaryKey: true },
    username: { type: 'TEXT', notNull: true },
  }, true)
  // 插入测试用户
  await db.sql.execute(
    'INSERT INTO users (id, username) VALUES (?, ?)',
    ['user_1', 'testuser'],
  )
}

// =============================================================================
// 测试套件
// =============================================================================

describe('@h-ai/audit', () => {
  beforeEach(async () => {
    await setupDb()
  })

  afterEach(async () => {
    await audit.close()
    await db.close()
  })

  // ─── 初始化 ───

  describe('init / close', () => {
    it('should initialize successfully', async () => {
      const result = await audit.init({ db })
      expect(result.success).toBe(true)
      expect(audit.isInitialized).toBe(true)
    })

    it('should close cleanly', async () => {
      await audit.init({ db })
      await audit.close()
      expect(audit.isInitialized).toBe(false)
    })

    it('should reinitialize safely', async () => {
      await audit.init({ db })
      const result = await audit.init({ db })
      expect(result.success).toBe(true)
      expect(audit.isInitialized).toBe(true)
    })
  })

  // ─── 未初始化 ───

  describe('not initialized', () => {
    it('should return NOT_INITIALIZED error for log', async () => {
      const result = await audit.log({ action: 'test', resource: 'test' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
      }
    })

    it('should return NOT_INITIALIZED error for list', async () => {
      const result = await audit.list()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
      }
    })

    it('should return NOT_INITIALIZED error for helper', async () => {
      const result = await audit.helper.login('user_1')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
      }
    })
  })

  // ─── 日志记录 ───

  describe('log', () => {
    beforeEach(async () => {
      await audit.init({ db })
    })

    it('should record an audit log', async () => {
      const result = await audit.log({
        userId: 'user_1',
        action: 'login',
        resource: 'auth',
        ipAddress: '127.0.0.1',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.action).toBe('login')
        expect(result.data.resource).toBe('auth')
        expect(result.data.userId).toBe('user_1')
        expect(result.data.id).toMatch(/^audit_/)
      }
    })

    it('should record log with details', async () => {
      const result = await audit.log({
        action: 'update',
        resource: 'users',
        resourceId: 'user_1',
        details: { field: 'name', oldValue: 'Alice', newValue: 'Bob' },
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.details).toBeTruthy()
      }
    })

    it('should record log with nullable fields', async () => {
      const result = await audit.log({
        action: 'system_check',
        resource: 'system',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.userId).toBeNull()
        expect(result.data.resourceId).toBeNull()
      }
    })
  })

  // ─── 列表查询 ───

  describe('list', () => {
    beforeEach(async () => {
      await audit.init({ db })
      // 插入测试数据
      await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
      await audit.log({ userId: 'user_1', action: 'update', resource: 'users', resourceId: 'user_2' })
      await audit.log({ action: 'system_check', resource: 'system' })
    })

    it('should list logs with pagination', async () => {
      const result = await audit.list({ pageSize: 2 })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.items.length).toBe(2)
        expect(result.data.total).toBe(3)
      }
    })

    it('should include username from JOIN', async () => {
      const result = await audit.list({ userId: 'user_1' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.items.length).toBe(2)
        expect(result.data.items[0].username).toBe('testuser')
      }
    })

    it('should filter by action', async () => {
      const result = await audit.list({ action: 'login' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.items.length).toBe(1)
        expect(result.data.items[0].action).toBe('login')
      }
    })

    it('should filter by resource', async () => {
      const result = await audit.list({ resource: 'system' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.items.length).toBe(1)
      }
    })
  })

  // ─── 用户最近活动 ───

  describe('getUserRecent', () => {
    beforeEach(async () => {
      await audit.init({ db })
      await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
      await audit.log({ userId: 'user_1', action: 'update', resource: 'users' })
      await audit.log({ userId: 'user_1', action: 'logout', resource: 'auth' })
    })

    it('should return recent activities for user', async () => {
      const result = await audit.getUserRecent('user_1')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBe(3)
      }
    })

    it('should respect limit', async () => {
      const result = await audit.getUserRecent('user_1', 2)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBe(2)
      }
    })
  })

  // ─── 统计 ───

  describe('getStats', () => {
    beforeEach(async () => {
      await audit.init({ db })
      await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
      await audit.log({ userId: 'user_1', action: 'login', resource: 'auth' })
      await audit.log({ userId: 'user_1', action: 'update', resource: 'users' })
    })

    it('should return action statistics', async () => {
      const result = await audit.getStats(7)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBe(2)
        const loginStat = result.data.find(s => s.action === 'login')
        expect(loginStat?.count).toBe(2)
      }
    })
  })

  // ─── 清理 ───

  describe('cleanup', () => {
    beforeEach(async () => {
      await audit.init({ db })
    })

    it('should cleanup old logs', async () => {
      // 直接插入一条"旧"记录（时间戳为 1 天前）
      const oldTime = Date.now() - 86400000
      await db.sql.execute(
        'INSERT INTO audit_logs (id, action, resource, created_at) VALUES (?, ?, ?, ?)',
        ['audit_old', 'test', 'test', oldTime],
      )
      const result = await audit.cleanup(0)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBeGreaterThanOrEqual(1)
      }
    })

    it('should not cleanup recent logs', async () => {
      await audit.log({ action: 'test', resource: 'test' })
      const result = await audit.cleanup(90)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(0)
      }
    })
  })

  // ─── 便捷记录器 ───

  describe('helper', () => {
    beforeEach(async () => {
      await audit.init({ db })
    })

    it('should record login', async () => {
      const result = await audit.helper.login('user_1', '127.0.0.1', 'Mozilla/5.0')
      expect(result.success).toBe(true)

      const logs = await audit.list({ action: 'login' })
      expect(logs.success).toBe(true)
      if (logs.success) {
        expect(logs.data.items.length).toBe(1)
        expect(logs.data.items[0].ipAddress).toBe('127.0.0.1')
      }
    })

    it('should record logout', async () => {
      const result = await audit.helper.logout('user_1')
      expect(result.success).toBe(true)
    })

    it('should record register', async () => {
      const result = await audit.helper.register('user_1')
      expect(result.success).toBe(true)
    })

    it('should record password reset request', async () => {
      const result = await audit.helper.passwordResetRequest('test@example.com')
      expect(result.success).toBe(true)
    })

    it('should record password reset complete', async () => {
      const result = await audit.helper.passwordResetComplete('user_1')
      expect(result.success).toBe(true)
    })

    it('should record CRUD operation', async () => {
      const result = await audit.helper.crud('user_1', 'create', 'users', 'user_2', { name: 'Bob' })
      expect(result.success).toBe(true)

      const logs = await audit.list({ action: 'create' })
      expect(logs.success).toBe(true)
      if (logs.success) {
        expect(logs.data.items.length).toBe(1)
        expect(logs.data.items[0].resource).toBe('users')
      }
    })
  })
})
