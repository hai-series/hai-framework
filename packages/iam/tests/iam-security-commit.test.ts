/** 最终存储条件拒绝迟到安全操作；不把 Promise 取消或返回失败当作提交保护。 */
import type { IamConfigInput, IamNotificationContext } from '../src/iam-types.js'
import type { User } from '../src/user/iam-user-types.js'
import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { afterEach, expect, it, vi } from 'vitest'
import { HaiIamError } from '../src/index.js'
import { defineIamSuite, initIam, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, release: () => resolve() }
}

defineIamSuite('security commits sqlite+memory', sqliteMemoryEnv(), () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('旧 OTP 发布暂停后不覆盖另一节点发布，且只发送获胜版本', async () => {
    const send = vi.fn(async () => {})
    const iam = await initIam({ otp: {}, onOtpSendEmail: send })
    const paused = deferred()
    const resume = deferred()
    const original = cache.kv.compareAndSwap.bind(cache.kv)
    let first = true
    vi.spyOn(cache.kv, 'compareAndSwap').mockImplementation(async (...args) => {
      if (args[0] === 'hai:iam:otp:publish@example.com' && first) {
        first = false
        paused.release()
        await resume.promise
      }
      return original(...args)
    })
    const late = iam.auth.sendOtp('publish@example.com')
    await paused.promise
    try {
      expect((await iam.auth.sendOtp('publish@example.com')).success).toBe(true)
    }
    finally { resume.release() }
    expect((await late).success).toBe(false)
    expect(send).toHaveBeenCalledOnce()
  })

  it('旧 OTP 消费暂停后不能删除新一代验证码或创建用户', async () => {
    let code = ''
    const iam = await initIam({ otp: { resendInterval: 30 }, onOtpSendEmail: async (_id, value) => {
      code = value
    } })
    await iam.auth.sendOtp('consume@example.com')
    const paused = deferred()
    const resume = deferred()
    const original = cache.kv.compareAndSwap.bind(cache.kv)
    let first = true
    vi.spyOn(cache.kv, 'compareAndSwap').mockImplementation(async (...args) => {
      if (args[0] === 'hai:iam:otp:consume@example.com' && first) {
        first = false
        paused.release()
        await resume.promise
      }
      return original(...args)
    })
    const late = iam.auth.loginWithOtp({ identifier: 'consume@example.com', code })
    await paused.promise
    try {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(Date.now() + 31_000)
      expect((await iam.auth.sendOtp('consume@example.com')).success).toBe(true)
    }
    finally { resume.release() }
    expect((await late).success).toBe(false)
    vi.useRealTimers()
    expect((await iam.auth.loginWithOtp({ identifier: 'consume@example.com', code })).success).toBe(true)
  })

  it('旧确认不能覆盖新令牌和接管节点的新密码', async () => {
    let token = ''
    const iam = await initIam({ onPasswordResetRequest: async (_user, value) => {
      token = value
    } })
    await iam.user.register({ username: 'reset-takeover', password: TEST_PASSWORD })
    await iam.user.requestPasswordReset('reset-takeover')
    const firstToken = token
    const paused = deferred()
    const resume = deferred()
    const original = reldb.sql.execute.bind(reldb.sql)
    let first = true
    vi.spyOn(reldb.sql, 'execute').mockImplementation(async (...args) => {
      if (args[0].startsWith('UPDATE hai_iam_users SET password_hash') && args[0].includes('reset_hash = ?') && first) {
        first = false
        paused.release()
        await resume.promise
      }
      return original(...args)
    })
    const late = iam.user.confirmPasswordReset(firstToken, 'OldPassword234')
    await paused.promise
    try {
      expect((await iam.user.requestPasswordReset('reset-takeover')).success).toBe(true)
      expect(token).not.toBe(firstToken)
      expect((await iam.user.confirmPasswordReset(token, 'NewPassword345')).success).toBe(true)
    }
    finally { resume.release() }
    expect((await late).success).toBe(false)
    expect((await iam.auth.login({ identifier: 'reset-takeover', password: 'NewPassword345' })).success).toBe(true)
    expect((await iam.auth.login({ identifier: 'reset-takeover', password: 'OldPassword234' })).success).toBe(false)
  })

  it('旧重置发布暂停后不能覆盖新发布，且不发送未提交的令牌', async () => {
    let token = ''
    const send = vi.fn(async (_user: User, value: string) => {
      token = value
    })
    const iam = await initIam({ onPasswordResetRequest: send })
    expect((await iam.user.register({ username: 'reset-publish-takeover', password: TEST_PASSWORD })).success).toBe(true)
    const paused = deferred()
    const resume = deferred()
    const original = reldb.sql.execute.bind(reldb.sql)
    let first = true
    vi.spyOn(reldb.sql, 'execute').mockImplementation(async (...args) => {
      if (args[0].startsWith('UPDATE hai_iam_users SET reset_hash') && first) {
        first = false
        paused.release()
        await resume.promise
      }
      return original(...args)
    })
    const late = iam.user.requestPasswordReset('reset-publish-takeover')
    await paused.promise
    try {
      expect((await iam.user.requestPasswordReset('reset-publish-takeover')).success).toBe(true)
    }
    finally { resume.release() }
    expect((await late).success).toBe(false)
    expect(send).toHaveBeenCalledOnce()
    expect((await iam.user.confirmPasswordReset(token, 'NewPassword345')).success).toBe(true)
  })

  it('最终 SQL 使用数据库时钟拒绝暂停期间到期的重置，不受应用旧时钟影响', async () => {
    let token = ''
    const iam = await initIam({ onPasswordResetRequest: async (_user, value) => {
      token = value
    } })
    await iam.user.register({ username: 'reset-expired-commit', password: TEST_PASSWORD })
    await iam.user.requestPasswordReset('reset-expired-commit')
    const original = reldb.sql.execute.bind(reldb.sql)
    let first = true
    vi.spyOn(reldb.sql, 'execute').mockImplementation(async (...args) => {
      if (args[0].startsWith('UPDATE hai_iam_users SET password_hash') && first) {
        first = false
        expect((await original('UPDATE hai_iam_users SET reset_expires_at = 1 WHERE username = ?', ['reset-expired-commit'])).success).toBe(true)
      }
      return original(...args)
    })
    expect((await iam.user.confirmPasswordReset(token, 'ExpiredPassword234')).success).toBe(false)
    expect((await iam.auth.login({ identifier: 'reset-expired-commit', password: TEST_PASSWORD })).success).toBe(true)
  })

  it('密码提交清除旧重置授权，并拒绝旧凭据快照的迟到改密', async () => {
    let token = ''
    const iam = await initIam({ onPasswordResetRequest: async (_user, value) => {
      token = value
    } })
    const registered = await iam.user.register({ username: 'password-takeover', password: TEST_PASSWORD })
    if (!registered.success)
      throw new Error('Test user missing')
    const userId = registered.data.user.id
    await iam.user.requestPasswordReset('password-takeover')
    const paused = deferred()
    const resume = deferred()
    const original = reldb.sql.execute.bind(reldb.sql)
    let first = true
    vi.spyOn(reldb.sql, 'execute').mockImplementation(async (...args) => {
      if (args[0].startsWith('UPDATE hai_iam_users SET password_hash') && first) {
        first = false
        paused.release()
        await resume.promise
      }
      return original(...args)
    })
    const delayed = iam.user.adminResetPassword(userId, 'OldPassword234')
    await paused.promise
    try {
      expect((await iam.user.adminResetPassword(userId, 'NewPassword345')).success).toBe(true)
    }
    finally { resume.release() }
    expect((await delayed).success).toBe(false)
    expect((await iam.user.confirmPasswordReset(token, 'ResetPassword456')).success).toBe(false)
    expect((await iam.auth.login({ identifier: 'password-takeover', password: 'NewPassword345' })).success).toBe(true)
  })

  it('通知提供稳定发布 ID，回调超时视为 unknown，保留凭据和冷却且不自动重发', async () => {
    let context: IamNotificationContext | undefined
    let code = ''
    const onOtpSendEmail: IamConfigInput['onOtpSendEmail'] = vi.fn(async (_id, value, notification) => {
      context = notification
      code = value
      throw new Error(`Provider may already have delivered ${value}`)
    })
    const iam = await initIam({ otp: {}, onOtpSendEmail })
    const result = await iam.auth.sendOtp('unknown@example.com')
    expect(result).toMatchObject({ success: false, error: { code: HaiIamError.INTERNAL_ERROR.code } })
    expect(JSON.stringify(result)).not.toContain(code)
    expect(context?.idempotencyKey).toMatch(/^iam-otp:/)
    expect(context?.idempotencyKey).not.toContain(code)
    const state = await cache.kv.get<{ version: string }>('hai:iam:otp:unknown@example.com')
    expect(state.success && `iam-otp:${state.data?.version}`).toBe(context?.idempotencyKey)
    expect((await iam.auth.sendOtp('unknown@example.com')).success).toBe(false)
    expect(onOtpSendEmail).toHaveBeenCalledOnce()
    expect((await iam.auth.loginWithOtp({ identifier: 'unknown@example.com', code })).success).toBe(true)
  })
})
