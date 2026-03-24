/**
 * =============================================================================
 * @h-ai/iam - 认证操作测试
 * =============================================================================
 *
 * 覆盖范围：
 * - login：用户名/邮箱、密码错误、用户不存在、空 identifier、空密码
 * - loginWithOtp / loginWithLdap：无策略时应返回 STRATEGY_NOT_SUPPORTED
 * - sendOtp：无策略时应返回 STRATEGY_NOT_SUPPORTED
 * - login 禁用配置：关闭密码登录后应返回 LOGIN_DISABLED
 * - verifyToken：有效/无效/空令牌、登出后令牌验证、Session 含 roles/permissions/displayName
 * - logout：正常登出、令牌失效、重复登出、不存在令牌幂等
 * - logout 吊销 refreshToken：登出后 refreshToken 不可用
 * - 禁用用户登录：register(defaultEnabled:false) → login 应返回 USER_DISABLED
 * - 账户锁定：超过最大尝试次数后锁定
 * - 登录结果中的 agreements
 */

import type { IamFunctions } from '../src/iam-types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HaiIamError } from '../src/iam-types.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

describe('iam.auth', () => {
  const defineCommon = (getIam: () => IamFunctions) => {
    // =========================================================================
    // 辅助：注册测试用户
    // =========================================================================

    async function registerUser(username: string, email?: string) {
      const result = await getIam().user.register({
        username,
        email: email ?? `${username}@test.com`,
        password: TEST_PASSWORD,
      })
      expect(result.success).toBe(true)
      return result.success ? result.data.user : null!
    }

    // =========================================================================
    // 密码登录
    // =========================================================================

    describe('login（密码登录）', () => {
      it('使用 username 登录应返回 user + accessToken', async () => {
        await registerUser('auth_login_user')

        const result = await getIam().auth.login({
          identifier: 'auth_login_user',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.user.username).toBe('auth_login_user')
          expect(result.data.tokens.accessToken).toBeTruthy()
          expect(result.data.tokens.expiresIn).toBeTypeOf('number')
        }
      })

      it('使用 email 登录应成功', async () => {
        await registerUser('auth_email_user', 'auth_email@test.com')

        const result = await getIam().auth.login({
          identifier: 'auth_email@test.com',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.user.username).toBe('auth_email_user')
        }
      })

      it('密码错误应返回 INVALID_CREDENTIALS', async () => {
        await registerUser('auth_wrong_pwd')

        const result = await getIam().auth.login({
          identifier: 'auth_wrong_pwd',
          password: 'WrongPassword123',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.INVALID_CREDENTIALS.code)
        }
      })

      it('用户不存在应返回 INVALID_CREDENTIALS（防止用户枚举）', async () => {
        const result = await getIam().auth.login({
          identifier: 'nonexistent_user',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.INVALID_CREDENTIALS.code)
        }
      })

      it('identifier 为空字符串应返回 INVALID_CREDENTIALS', async () => {
        const result = await getIam().auth.login({
          identifier: '',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.INVALID_CREDENTIALS.code)
        }
      })

      it('空密码应返回 INTERNAL_ERROR', async () => {
        await registerUser('auth_empty_pwd_user')
        const result = await getIam().auth.login({
          identifier: 'auth_empty_pwd_user',
          password: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.INTERNAL_ERROR.code)
        }
      })
    })

    // =========================================================================
    // 令牌验证
    // =========================================================================

    describe('verifyToken', () => {
      it('有效令牌应返回 Session', async () => {
        await registerUser('auth_verify_user')
        const loginResult = await getIam().auth.login({
          identifier: 'auth_verify_user',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        const verifyResult = await getIam().auth.verifyToken(loginResult.data.tokens.accessToken)
        expect(verifyResult.success).toBe(true)
        if (verifyResult.success) {
          expect(verifyResult.data.userId).toBeTruthy()
          expect(verifyResult.data.accessToken).toBe(loginResult.data.tokens.accessToken)
        }
      })

      it('无效令牌应返回 SESSION_INVALID', async () => {
        const result = await getIam().auth.verifyToken('invalid-token-xxx')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.SESSION_INVALID.code)
        }
      })

      it('空字符串令牌应返回错误', async () => {
        const result = await getIam().auth.verifyToken('')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.SESSION_INVALID.code)
        }
      })

      it('登出后的令牌 verifyToken 应返回 SESSION_INVALID', async () => {
        await registerUser('auth_verify_after_logout')
        const loginResult = await getIam().auth.login({
          identifier: 'auth_verify_after_logout',
          password: TEST_PASSWORD,
        })
        if (!loginResult.success)
          return

        await getIam().auth.logout(loginResult.data.tokens.accessToken)
        const result = await getIam().auth.verifyToken(loginResult.data.tokens.accessToken)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.SESSION_INVALID.code)
        }
      })
    })

    // =========================================================================
    // verifyToken 会话字段（roles / permissions / displayName）
    // =========================================================================

    describe('verifyToken session fields', () => {
      it('有效令牌应返回 Session 含 roles / permissions', async () => {
        await registerUser('auth_resolve_user')
        const loginResult = await getIam().auth.login({
          identifier: 'auth_resolve_user',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        const result = await getIam().auth.verifyToken(loginResult.data.tokens.accessToken)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.userId).toBeTruthy()
          expect(result.data.username).toBe('auth_resolve_user')
          expect(Array.isArray(result.data.roles)).toBe(true)
          expect(Array.isArray(result.data.permissions)).toBe(true)
        }
      })

      it('登出后 verifyToken 应返回 SESSION_INVALID', async () => {
        await registerUser('auth_resolve_after_logout')
        const loginResult = await getIam().auth.login({
          identifier: 'auth_resolve_after_logout',
          password: TEST_PASSWORD,
        })
        if (!loginResult.success)
          return

        await getIam().auth.logout(loginResult.data.tokens.accessToken)
        const result = await getIam().auth.verifyToken(loginResult.data.tokens.accessToken)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.SESSION_INVALID.code)
        }
      })

      it('返回的 Session 应包含 displayName（登录时写入缓存）', async () => {
        await registerUser('auth_resolve_display')

        // 设置 displayName
        await getIam().user.updateCurrentUser(
          (await getIam().auth.login({ identifier: 'auth_resolve_display', password: TEST_PASSWORD }))
            .data!.tokens.accessToken,
          { displayName: 'Test Display Name' },
        )

        // 重新登录，使 session 包含最新的 displayName
        const loginResult = await getIam().auth.login({
          identifier: 'auth_resolve_display',
          password: TEST_PASSWORD,
        })
        if (!loginResult.success)
          return

        const result = await getIam().auth.verifyToken(loginResult.data.tokens.accessToken)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.displayName).toBe('Test Display Name')
        }
      })
    })

    // =========================================================================
    // 登出
    // =========================================================================

    describe('logout', () => {
      it('登出后令牌应失效', async () => {
        await registerUser('auth_logout_user')
        const loginResult = await getIam().auth.login({
          identifier: 'auth_logout_user',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        const logoutResult = await getIam().auth.logout(loginResult.data.tokens.accessToken)
        expect(logoutResult.success).toBe(true)

        const verifyResult = await getIam().auth.verifyToken(loginResult.data.tokens.accessToken)
        expect(verifyResult.success).toBe(false)
      })

      it('已登出的令牌再次登出不应抛异常', async () => {
        await registerUser('auth_double_logout')
        const loginResult = await getIam().auth.login({
          identifier: 'auth_double_logout',
          password: TEST_PASSWORD,
        })
        if (!loginResult.success)
          return

        await getIam().auth.logout(loginResult.data.tokens.accessToken)
        const result = await getIam().auth.logout(loginResult.data.tokens.accessToken)
        expect(result.success).toBe(true)
      })

      it('不存在的令牌登出应成功（幂等）', async () => {
        const result = await getIam().auth.logout('completely-nonexistent-token')
        expect(result.success).toBe(true)
      })
    })

    // =========================================================================
    // loginWithOtp / loginWithLdap / sendOtp（无策略场景）
    // =========================================================================

    describe('loginWithOtp（无 OTP 策略）', () => {
      it('未配置 OTP 策略时应返回 STRATEGY_NOT_SUPPORTED', async () => {
        const result = await getIam().auth.loginWithOtp({
          identifier: 'any@test.com',
          code: '123456',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.STRATEGY_NOT_SUPPORTED.code)
        }
      })
    })

    describe('loginWithLdap（无 LDAP 策略）', () => {
      it('未配置 LDAP 策略时应返回 STRATEGY_NOT_SUPPORTED', async () => {
        const result = await getIam().auth.loginWithLdap({
          username: 'admin',
          password: 'secret',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.STRATEGY_NOT_SUPPORTED.code)
        }
      })
    })

    describe('sendOtp（无 OTP 策略）', () => {
      it('未配置 OTP 策略时应返回 STRATEGY_NOT_SUPPORTED', async () => {
        const result = await getIam().auth.sendOtp('any@test.com')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.STRATEGY_NOT_SUPPORTED.code)
        }
      })
    })

    // =========================================================================
    // 登录方式禁用
    // =========================================================================

    describe('login 禁用配置', () => {
      let loginDisabledIam: IamFunctions

      beforeAll(async () => {
        loginDisabledIam = await initIam({
          login: { password: false, otp: false, ldap: false },
        })
      })

      afterAll(async () => {
        await initIam()
      })

      it('密码登录禁用时应返回 LOGIN_DISABLED', async () => {
        const result = await loginDisabledIam.auth.login({
          identifier: 'any',
          password: 'any',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.LOGIN_DISABLED.code)
        }
      })

      it('otp 登录禁用时 sendOtp 应返回 LOGIN_DISABLED', async () => {
        const result = await loginDisabledIam.auth.sendOtp('any@test.com')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.LOGIN_DISABLED.code)
        }
      })
    })

    // =========================================================================
    // 禁用用户登录
    // =========================================================================

    describe('禁用用户登录', () => {
      let disabledUserIam: IamFunctions

      beforeAll(async () => {
        disabledUserIam = await initIam({
          register: { enabled: true, defaultEnabled: false },
        })
        await disabledUserIam.user.register({
          username: 'disabled_user',
          password: TEST_PASSWORD,
        })
      })

      afterAll(async () => {
        await initIam()
      })

      it('禁用用户登录应返回 USER_DISABLED', async () => {
        const result = await disabledUserIam.auth.login({
          identifier: 'disabled_user',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.USER_DISABLED.code)
        }
      })
    })

    // =========================================================================
    // 账户锁定
    // =========================================================================

    describe('账户锁定', () => {
      let lockIam: IamFunctions

      beforeAll(async () => {
        lockIam = await initIam({
          security: { maxLoginAttempts: 3, lockoutDuration: 60 },
        })
      })

      afterAll(async () => {
        await initIam()
      })

      it('超过最大登录失败次数后应锁定账户', async () => {
        await lockIam.user.register({
          username: 'lock_user',
          password: TEST_PASSWORD,
        })

        for (let i = 0; i < 3; i++) {
          await lockIam.auth.login({
            identifier: 'lock_user',
            password: 'WrongPass999',
          })
        }

        const result = await lockIam.auth.login({
          identifier: 'lock_user',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.USER_LOCKED.code)
        }
      })

      it('未达到锁定次数时密码正确应成功', async () => {
        await lockIam.user.register({
          username: 'lock_user_recover',
          password: TEST_PASSWORD,
        })

        for (let i = 0; i < 2; i++) {
          await lockIam.auth.login({
            identifier: 'lock_user_recover',
            password: 'WrongPass999',
          })
        }

        const result = await lockIam.auth.login({
          identifier: 'lock_user_recover',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(true)
      })
    })

    // =========================================================================
    // 登录结果中的 agreements
    // =========================================================================

    describe('登录返回 agreements', () => {
      let agreementIam: IamFunctions

      beforeAll(async () => {
        agreementIam = await initIam({
          agreements: {
            userAgreementUrl: 'https://example.com/terms',
            privacyPolicyUrl: 'https://example.com/privacy',
            showOnLogin: true,
            showOnRegister: true,
          },
        })
        await agreementIam.user.register({
          username: 'agreement_user',
          password: TEST_PASSWORD,
        })
      })

      afterAll(async () => {
        await initIam()
      })

      it('配置 agreements 且 showOnLogin 时登录结果应包含协议信息', async () => {
        const result = await agreementIam.auth.login({
          identifier: 'agreement_user',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.agreements).toBeDefined()
          expect(result.data.agreements?.userAgreementUrl).toBe('https://example.com/terms')
          expect(result.data.agreements?.privacyPolicyUrl).toBe('https://example.com/privacy')
        }
      })
    })

    // =========================================================================
    // 登出吊销 refreshToken
    // =========================================================================

    describe('logout 吊销 refreshToken', () => {
      it('登出后 refreshToken 应不可用', async () => {
        await registerUser('auth_logout_refresh')
        const loginResult = await getIam().auth.login({
          identifier: 'auth_logout_refresh',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        const { accessToken: _accessToken, refreshToken } = loginResult.data.tokens

        // refreshToken 在登出前应有效
        const refreshBefore = await getIam().session.refresh(refreshToken)
        // refresh 会 rotate（创建新 session），此时旧 accessToken 已失效
        expect(refreshBefore.success).toBe(true)
        if (!refreshBefore.success)
          return

        // 用新 accessToken 登出
        const logoutResult = await getIam().auth.logout(refreshBefore.data.accessToken)
        expect(logoutResult.success).toBe(true)

        // 登出后 refreshToken 应被吊销（新 refreshToken 也应被吊销）
        const refreshAfter = await getIam().session.refresh(refreshBefore.data.refreshToken)
        expect(refreshAfter.success).toBe(false)
        if (!refreshAfter.success) {
          expect(refreshAfter.error.code).toBe(HaiIamError.TOKEN_EXPIRED.code)
        }
      })

      it('登出后原始 refreshToken 也应不可用（旧 token 已被 rotation 删除）', async () => {
        await registerUser('auth_logout_refresh2')
        const loginResult = await getIam().auth.login({
          identifier: 'auth_logout_refresh2',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        const { accessToken, refreshToken } = loginResult.data.tokens

        // 直接登出（不先 refresh）
        const logoutResult = await getIam().auth.logout(accessToken)
        expect(logoutResult.success).toBe(true)

        // 登出后 refreshToken 应被吊销
        const refreshAfter = await getIam().session.refresh(refreshToken)
        expect(refreshAfter.success).toBe(false)
        if (!refreshAfter.success) {
          expect(refreshAfter.error.code).toBe(HaiIamError.TOKEN_EXPIRED.code)
        }
      })
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCommon(getIam))
  defineIamSuite('postgres+redis', postgresRedisEnv, getIam => defineCommon(getIam))
})
