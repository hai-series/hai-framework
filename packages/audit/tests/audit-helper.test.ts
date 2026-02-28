/**
 * =============================================================================
 * @h-ai/audit - 便捷记录器测试
 * =============================================================================
 */

import { db } from '@h-ai/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { audit } from '../src/index.js'

// ─── 测试辅助 ───

async function setupDb(): Promise<void> {
  const result = await db.init({ type: 'sqlite', database: ':memory:' })
  if (!result.success) {
    throw new Error(`DB init failed: ${result.error.message}`)
  }
  await db.ddl.createTable('users', {
    id: { type: 'TEXT', primaryKey: true },
    username: { type: 'TEXT', notNull: true },
  }, true)
  await db.sql.execute(
    'INSERT INTO users (id, username) VALUES (?, ?)',
    ['user_1', 'testuser'],
  )
}

// ─── 测试套件 ───

describe('audit.helper', () => {
  beforeEach(async () => {
    await setupDb()
    await audit.init({ db })
  })

  afterEach(async () => {
    await audit.close()
    await db.close()
  })

  // ─── login ───

  it('login 应记录登录日志（含 IP 和 UA）', async () => {
    const result = await audit.helper.login('user_1', '192.168.1.1', 'Mozilla/5.0')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'login' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items.length).toBe(1)
      expect(logs.data.items[0].userId).toBe('user_1')
      expect(logs.data.items[0].resource).toBe('auth')
      expect(logs.data.items[0].ipAddress).toBe('192.168.1.1')
      expect(logs.data.items[0].userAgent).toBe('Mozilla/5.0')
    }
  })

  it('login 不传 IP 和 UA 也应成功', async () => {
    const result = await audit.helper.login('user_1')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'login' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items[0].ipAddress).toBeNull()
      expect(logs.data.items[0].userAgent).toBeNull()
    }
  })

  // ─── logout ───

  it('logout 应记录登出日志', async () => {
    const result = await audit.helper.logout('user_1', '10.0.0.1')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'logout' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items.length).toBe(1)
      expect(logs.data.items[0].resource).toBe('auth')
    }
  })

  // ─── register ───

  it('register 应记录注册日志（resourceId 为 userId）', async () => {
    const result = await audit.helper.register('user_new')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'register' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items.length).toBe(1)
      expect(logs.data.items[0].resourceId).toBe('user_new')
    }
  })

  // ─── passwordResetRequest ───

  it('passwordResetRequest 应记录密码重置请求（details 含 email）', async () => {
    const result = await audit.helper.passwordResetRequest('test@example.com', '127.0.0.1')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'password_reset_request' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items.length).toBe(1)
      expect(logs.data.items[0].userId).toBeNull()
      const details = JSON.parse(logs.data.items[0].details!)
      expect(details.email).toBe('test@example.com')
    }
  })

  // ─── passwordResetComplete ───

  it('passwordResetComplete 应记录密码重置完成', async () => {
    const result = await audit.helper.passwordResetComplete('user_1')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'password_reset' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items.length).toBe(1)
      expect(logs.data.items[0].userId).toBe('user_1')
    }
  })

  // ─── crud ───

  it('crud create 应记录创建操作', async () => {
    const result = await audit.helper.crud('user_1', 'create', 'users', 'user_2', { name: 'Bob' })
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'create' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items.length).toBe(1)
      expect(logs.data.items[0].resource).toBe('users')
      expect(logs.data.items[0].resourceId).toBe('user_2')
    }
  })

  it('crud update 应记录更新操作', async () => {
    const result = await audit.helper.crud('user_1', 'update', 'roles', 'role_1', { name: 'admin' })
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'update' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items.length).toBe(1)
      expect(logs.data.items[0].resource).toBe('roles')
    }
  })

  it('crud delete 应记录删除操作', async () => {
    const result = await audit.helper.crud('user_1', 'delete', 'permissions', 'perm_1')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'delete' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items.length).toBe(1)
    }
  })

  it('crud 不传 resourceId 和 details 也应成功', async () => {
    const result = await audit.helper.crud('user_1', 'read', 'reports')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'read' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items[0].resourceId).toBeNull()
    }
  })

  it('crud 系统操作（userId 为 null）应成功', async () => {
    const result = await audit.helper.crud(null, 'create', 'system', 'job_1')
    expect(result.success).toBe(true)

    const logs = await audit.list({ action: 'create' })
    expect(logs.success).toBe(true)
    if (logs.success) {
      expect(logs.data.items[0].userId).toBeNull()
    }
  })
})
