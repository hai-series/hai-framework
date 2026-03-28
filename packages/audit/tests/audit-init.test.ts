/**
 * =============================================================================
 * @h-ai/audit - 初始化与生命周期测试
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

describe('audit.init / audit.close', () => {
  beforeEach(async () => {
    await setupDb()
  })

  afterEach(async () => {
    await audit.close()
    await reldb.close()
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
    const result = await audit.init()
    expect(result.success).toBe(true)
    expect(audit.isInitialized).toBe(true)
  })

  it('init 使用自定义用户表应初始化成功', async () => {
    await reldb.ddl.createTable('custom_users', {
      id: { type: 'TEXT', primaryKey: true },
      username: { type: 'TEXT', notNull: true },
    }, true)
    const result = await audit.init({
      userTable: 'custom_users',
      userIdColumn: 'id',
      userNameColumn: 'username',
    })
    expect(result.success).toBe(true)
    expect(audit.isInitialized).toBe(true)
  })

  // ─── 关闭 ───

  it('close 应将 isInitialized 设为 false', async () => {
    await audit.init()
    expect(audit.isInitialized).toBe(true)
    await audit.close()
    expect(audit.isInitialized).toBe(false)
  })

  // ─── 重新初始化 ───

  it('重复 init 应先关闭再重新初始化', async () => {
    await audit.init()
    await audit.log({ action: 'test', resource: 'test' })

    // 重新初始化
    const result = await audit.init()
    expect(result.success).toBe(true)
    expect(audit.isInitialized).toBe(true)
  })

  it('close 后再 init 应成功', async () => {
    await audit.init()
    await audit.close()
    const result = await audit.init()
    expect(result.success).toBe(true)
    expect(audit.isInitialized).toBe(true)
  })

  // ─── 配置校验 ───

  it('传入非法标识符应返回 CONFIG_ERROR', async () => {
    const result = await audit.init({ userTable: 'DROP TABLE; --' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(HaiAuditError.CONFIG_ERROR.code)
    }
  })

  // ─── 并发初始化防护 ───

  it('并发 init 应返回 INIT_IN_PROGRESS', async () => {
    // 先初始化一次，使重新初始化时触发 await audit.close()，产生真正的并发窗口
    await audit.init()

    const [r1, r2] = await Promise.all([
      audit.init(),
      audit.init(),
    ])

    // 其中一个成功，另一个返回 INIT_IN_PROGRESS
    const results = [r1, r2]
    const successes = results.filter(r => r.success)
    const failures = results.filter(r => !r.success)
    expect(successes.length).toBe(1)
    expect(failures.length).toBe(1)
    if (!failures[0].success) {
      expect(failures[0].error.code).toBe(HaiAuditError.INIT_IN_PROGRESS.code)
    }
  })
})
