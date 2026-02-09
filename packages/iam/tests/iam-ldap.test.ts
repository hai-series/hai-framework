/**
 * =============================================================================
 * @hai/iam - LDAP 认证集成测试
 * =============================================================================
 *
 * 使用 OpenLDAP 容器实现真正的 LDAP 认证测试。
 *
 * 覆盖范围：
 * - LDAP 登录：正确凭证、错误密码、不存在用户
 * - 用户同步：首次登录同步、重复登录不重复创建
 * - 本地用户状态：禁用用户拒绝 LDAP 登录
 * - 账户锁定：LDAP 登录同样受锁定策略约束
 * - LDAP 配置缺失时行为
 */

import type { IamFunctions } from '../src/iam-types.js'
import type { LdapContainerLease } from './helpers/ldap-container.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IamErrorCode } from '../src/iam-config.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'
import { acquireLdapContainer } from './helpers/ldap-container.js'

describe('iam.ldap', () => {
  // LDAP 容器在所有环境套件之间共享
  let ldapLease: LdapContainerLease

  beforeAll(async () => {
    ldapLease = await acquireLdapContainer()
  }, 300_000)

  afterAll(async () => {
    await ldapLease?.release()
  }, 300_000)

  const defineCommon = (getIam: () => IamFunctions) => {
    // =========================================================================
    // LDAP 登录
    // =========================================================================

    describe('loginWithLdap', () => {
      it('使用正确 LDAP 凭证登录应成功', async () => {
        const result = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.user.username).toBe(ldapLease.testUser.username)
          expect(result.data.accessToken).toBeTruthy()
          expect(result.data.accessTokenExpiresAt).toBeInstanceOf(Date)
        }
      })

      it('lDAP 登录成功后应能通过 verifyToken 验证', async () => {
        const loginResult = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        const verifyResult = await getIam().auth.verifyToken(loginResult.data.accessToken)
        expect(verifyResult.success).toBe(true)
        if (verifyResult.success) {
          expect(verifyResult.data.userId).toBeTruthy()
        }
      })

      it('lDAP 密码错误应返回 INVALID_CREDENTIALS', async () => {
        const result = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: 'WrongPassword999',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.INVALID_CREDENTIALS)
        }
      })

      it('lDAP 中不存在的用户应返回错误', async () => {
        const result = await getIam().auth.loginWithLdap({
          username: 'nonexistent_ldap_user',
          password: 'AnyPassword123',
        })
        expect(result.success).toBe(false)
      })
    })

    // =========================================================================
    // 用户同步
    // =========================================================================

    describe('lDAP 用户同步', () => {
      it('首次 LDAP 登录应同步创建本地用户', async () => {
        const loginResult = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        // 通过本地 API 查询用户
        const userResult = await getIam().user.getUser(loginResult.data.user.id)
        expect(userResult.success).toBe(true)
        if (userResult.success && userResult.data) {
          expect(userResult.data.username).toBe(ldapLease.testUser.username)
        }
      })

      it('重复 LDAP 登录不应创建重复本地用户', async () => {
        // 第一次登录
        const login1 = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(login1.success).toBe(true)
        if (!login1.success)
          return

        // 第二次登录
        const login2 = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(login2.success).toBe(true)
        if (!login2.success)
          return

        // 用户 ID 应相同
        expect(login2.data.user.id).toBe(login1.data.user.id)
      })

      it('lDAP 登录后用户应出现在 listUsers 中', async () => {
        await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })

        const listResult = await getIam().user.listUsers({ page: 1, pageSize: 100 })
        expect(listResult.success).toBe(true)
        if (listResult.success) {
          const ldapUser = listResult.data.items.find(u => u.username === ldapLease.testUser.username)
          expect(ldapUser).toBeDefined()
        }
      })
    })

    // =========================================================================
    // LDAP + 本地账户状态
    // =========================================================================

    describe('lDAP 本地账户状态', () => {
      it('本地禁用的 LDAP 用户不应能登录', async () => {
        // 先通过 LDAP 登录创建本地用户
        const loginResult = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        // 禁用该本地用户
        const updateResult = await getIam().user.updateUser(loginResult.data.user.id, {
          enabled: false,
        })
        expect(updateResult.success).toBe(true)

        // 再次 LDAP 登录应失败
        const retryResult = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(retryResult.success).toBe(false)
        if (!retryResult.success) {
          expect(retryResult.error.code).toBe(IamErrorCode.USER_DISABLED)
        }

        // 恢复用户状态，避免影响后续测试
        await getIam().user.updateUser(loginResult.data.user.id, { enabled: true })
      })
    })

    // =========================================================================
    // 密码登录 + LDAP 共存
    // =========================================================================

    describe('密码登录 + LDAP 共存', () => {
      it('本地密码用户和 LDAP 用户可以共存', async () => {
        // 注册本地用户
        const regResult = await getIam().user.register({
          username: 'local_coexist_user',
          password: TEST_PASSWORD,
        })
        expect(regResult.success).toBe(true)

        // 本地用户密码登录
        const localLogin = await getIam().auth.login({
          identifier: 'local_coexist_user',
          password: TEST_PASSWORD,
        })
        expect(localLogin.success).toBe(true)

        // LDAP 用户登录
        const ldapLogin = await getIam().auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(ldapLogin.success).toBe(true)

        // 两个用户应是不同的
        if (localLogin.success && ldapLogin.success) {
          expect(localLogin.data.user.id).not.toBe(ldapLogin.data.user.id)
        }
      })
    })

    // =========================================================================
    // LDAP + 账户锁定（放在最后，因为锁定状态会影响后续 LDAP 登录）
    // =========================================================================

    describe('lDAP 账户锁定', () => {
      let lockIam: IamFunctions

      beforeAll(async () => {
        lockIam = await initIam({
          security: { maxLoginAttempts: 3, lockoutDuration: 60 },
          login: { password: true, ldap: true },
          ldap: ldapLease.ldapConfig,
          ldapClientFactory: ldapLease.ldapClientFactory,
        })
      })

      afterAll(async () => {
        await lockIam.close()
      })

      it('lDAP 登录超过最大失败次数后应锁定账户', async () => {
        // 先成功登录一次以创建本地用户
        const firstLogin = await lockIam.auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(firstLogin.success).toBe(true)

        // 连续错误密码 3 次
        for (let i = 0; i < 3; i++) {
          await lockIam.auth.loginWithLdap({
            username: ldapLease.testUser.username,
            password: 'WrongPassword999',
          })
        }

        // 即使密码正确也应被锁定
        const result = await lockIam.auth.loginWithLdap({
          username: ldapLease.testUser.username,
          password: ldapLease.testUser.password,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.USER_LOCKED)
        }
      })
    })
  }

  // 两种环境均需启用 LDAP 登录
  defineIamSuite(
    'sqlite+memory+ldap',
    sqliteMemoryEnv(),
    getIam => defineCommon(getIam),
    () => ({
      login: { password: true, ldap: true },
      ldap: ldapLease.ldapConfig,
      ldapClientFactory: ldapLease.ldapClientFactory,
    }),
  )

  defineIamSuite(
    'postgres+redis+ldap',
    postgresRedisEnv,
    getIam => defineCommon(getIam),
    () => ({
      login: { password: true, ldap: true },
      ldap: ldapLease.ldapConfig,
      ldapClientFactory: ldapLease.ldapClientFactory,
    }),
  )
})
