/**
 * =============================================================================
 * @h-ai/audit - 初始化与生命周期测试
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
}

// ─── 测试套件 ───

describe('audit.init / audit.close', () => {
  beforeEach(async () => {
    await setupDb()
  })

  afterEach(async () => {
    await audit.close()
    await db.close()
  })

  // ─── 初始化前状态 ───

  it('isInitialized 初始化前应为 false', () => {
    expect(audit.isInitialized).toBe(false)
  })

  it('close 在未初始化时应安全调用', async () => {
    await audit.close()
    expect(audit.isInitialized).toBe(false)
  })

  // ─── 初始化 ───

  it('init 应初始化成功并更新状态', async () => {
    const result = await audit.init({ db })
    expect(result.success).toBe(true)
    expect(audit.isInitialized).toBe(true)
  })

  it('init 使用自定义表名应初始化成功', async () => {
    const result = await audit.init({
      db,
      tableName: 'custom_audit',
      userTable: 'users',
      userIdColumn: 'id',
      userNameColumn: 'username',
    })
    expect(result.success).toBe(true)
    expect(audit.isInitialized).toBe(true)
  })

  // ─── 关闭 ───

  it('close 应将 isInitialized 设为 false', async () => {
    await audit.init({ db })
    expect(audit.isInitialized).toBe(true)
    await audit.close()
    expect(audit.isInitialized).toBe(false)
  })

  // ─── 重新初始化 ───

  it('重复 init 应先关闭再重新初始化', async () => {
    await audit.init({ db })
    await audit.log({ action: 'test', resource: 'test' })

    // 重新初始化
    const result = await audit.init({ db })
    expect(result.success).toBe(true)
    expect(audit.isInitialized).toBe(true)
  })

  it('close 后再 init 应成功', async () => {
    await audit.init({ db })
    await audit.close()
    const result = await audit.init({ db })
    expect(result.success).toBe(true)
    expect(audit.isInitialized).toBe(true)
  })
})
