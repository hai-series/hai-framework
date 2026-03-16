/**
 * =============================================================================
 * @h-ai/audit - 未初始化行为测试
 * =============================================================================
 */

import { describe, expect, it } from 'vitest'
import { audit, AuditErrorCode } from '../src/index.js'

describe('audit (not initialized)', () => {
  // ─── log ───

  it('log 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.log({ action: 'test', resource: 'test' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── list ───

  it('list 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.list()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── getUserRecent ───

  it('getUserRecent 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.getUserRecent('user_1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── cleanup ───

  it('cleanup 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.cleanup()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── getStats ───

  it('getStats 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.getStats()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  // ─── helper ───

  it('helper.login 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.helper.login('user_1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  it('helper.logout 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.helper.logout('user_1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  it('helper.register 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.helper.register('user_1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  it('helper.passwordResetRequest 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.helper.passwordResetRequest('test@example.com')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  it('helper.passwordResetComplete 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.helper.passwordResetComplete('user_1')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })

  it('helper.crud 应返回 NOT_INITIALIZED', async () => {
    const result = await audit.helper.crud({ userId: 'user_1', action: 'create', resource: 'users' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe(AuditErrorCode.NOT_INITIALIZED)
    }
  })
})
