/**
 * =============================================================================
 * @hai/iam - 用户管理测试
 * =============================================================================
 *
 * 覆盖范围：
 * - register：正常注册、重复用户名/邮箱、弱密码、可选字段、注册禁用
 * - validatePassword：强密码、弱密码、空密码、边界长度
 * - getUser / getCurrentUser / listUsers
 * - updateUser：正常更新、空更新、用户不存在
 * - changePassword：正确/错误旧密码、弱新密码、用户不存在
 * - requestPasswordReset / confirmPasswordReset：桩实现行为
 * - 自定义密码策略配置：requireSpecialChar、自定义 minLength
 */

import type { IamFunctions } from '../src/iam-types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IamErrorCode } from '../src/iam-config.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD, WEAK_PASSWORD } from './helpers/iam-test-suite.js'

describe('iam.user', () => {
  const defineCommon = (getIam: () => IamFunctions) => {
    // =========================================================================
    // 注册
    // =========================================================================

    describe('register', () => {
      it('正常注册应返回用户信息', async () => {
        const result = await getIam().user.register({
          username: 'user_reg_ok',
          email: 'user_reg_ok@test.com',
          password: TEST_PASSWORD,
          displayName: '注册测试',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.user.username).toBe('user_reg_ok')
          expect(result.data.user.email).toBe('user_reg_ok@test.com')
          expect(result.data.user.displayName).toBe('注册测试')
          expect(result.data.user.enabled).toBe(true)
          expect(result.data.user.id).toBeTruthy()
          expect(result.data.user.createdAt).toBeInstanceOf(Date)
          expect(result.data.user.updatedAt).toBeInstanceOf(Date)
        }
      })

      it('注册时可传入 phone 和 metadata', async () => {
        const result = await getIam().user.register({
          username: 'user_with_phone',
          password: TEST_PASSWORD,
          phone: '13800138000',
          metadata: { source: 'test' },
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.user.username).toBe('user_with_phone')
        }
      })

      it('重复用户名应返回 USER_ALREADY_EXISTS', async () => {
        await getIam().user.register({ username: 'user_dup', password: TEST_PASSWORD })
        const result = await getIam().user.register({ username: 'user_dup', password: TEST_PASSWORD })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.USER_ALREADY_EXISTS)
        }
      })

      it('重复邮箱应返回 USER_ALREADY_EXISTS', async () => {
        await getIam().user.register({
          username: 'user_dup_email_1',
          email: 'dup@test.com',
          password: TEST_PASSWORD,
        })
        const result = await getIam().user.register({
          username: 'user_dup_email_2',
          email: 'dup@test.com',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.USER_ALREADY_EXISTS)
        }
      })

      it('弱密码应返回 PASSWORD_POLICY_VIOLATION', async () => {
        const result = await getIam().user.register({
          username: 'user_weak_pwd',
          password: WEAK_PASSWORD,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('纯小写密码应返回 PASSWORD_POLICY_VIOLATION', async () => {
        const result = await getIam().user.register({
          username: 'user_lowercase_pwd',
          password: 'alllowercase1',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('无数字密码应返回 PASSWORD_POLICY_VIOLATION', async () => {
        const result = await getIam().user.register({
          username: 'user_nodigit_pwd',
          password: 'NoDigitPassword',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('不传 email 也应能注册成功', async () => {
        const result = await getIam().user.register({
          username: 'user_no_email',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.user.email).toBeUndefined()
        }
      })
    })

    // =========================================================================
    // 注册禁用
    // =========================================================================

    describe('register（禁用注册）', () => {
      let noRegIam: IamFunctions

      beforeAll(async () => {
        noRegIam = await initIam({
          register: { enabled: false, defaultEnabled: true },
        })
      })

      afterAll(async () => {
        await noRegIam.close()
      })

      it('注册关闭时应返回 REGISTER_DISABLED', async () => {
        const result = await noRegIam.user.register({
          username: 'noreg',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.REGISTER_DISABLED)
        }
      })
    })

    // =========================================================================
    // 注册默认禁用用户
    // =========================================================================

    describe('register（新用户默认禁用）', () => {
      let disabledByDefaultIam: IamFunctions

      beforeAll(async () => {
        disabledByDefaultIam = await initIam({
          register: { enabled: true, defaultEnabled: false },
        })
      })

      afterAll(async () => {
        await disabledByDefaultIam.close()
      })

      it('新注册用户 enabled 应为 false', async () => {
        const result = await disabledByDefaultIam.user.register({
          username: 'disabled_by_default',
          password: TEST_PASSWORD,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.user.enabled).toBe(false)
        }
      })
    })

    // =========================================================================
    // validatePassword
    // =========================================================================

    describe('validatePassword', () => {
      it('强密码应通过', () => {
        const result = getIam().user.validatePassword(TEST_PASSWORD)
        expect(result.success).toBe(true)
      })

      it('弱密码应返回 PASSWORD_POLICY_VIOLATION', () => {
        const result = getIam().user.validatePassword(WEAK_PASSWORD)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('空密码应不通过', () => {
        const result = getIam().user.validatePassword('')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('缺少大写字母应不通过', () => {
        const result = getIam().user.validatePassword('lowercase123')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('缺少小写字母应不通过', () => {
        const result = getIam().user.validatePassword('UPPERCASE123')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('缺少数字应不通过', () => {
        const result = getIam().user.validatePassword('NoDigitsHere')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('恰好满足最低长度(8)的密码应通过', () => {
        const result = getIam().user.validatePassword('Abcdef1x')
        expect(result.success).toBe(true)
      })

      it('长度不足应不通过', () => {
        const result = getIam().user.validatePassword('Ab1defg')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })
    })

    // =========================================================================
    // 自定义密码策略
    // =========================================================================

    describe('validatePassword（自定义密码策略）', () => {
      let specialCharIam: IamFunctions

      beforeAll(async () => {
        specialCharIam = await initIam({
          password: {
            minLength: 10,
            requireSpecialChar: true,
          },
        })
      })

      afterAll(async () => {
        await specialCharIam.close()
      })

      it('无特殊字符时应返回 PASSWORD_POLICY_VIOLATION', () => {
        const result = specialCharIam.user.validatePassword('TestPass123')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('包含特殊字符且满足长度应通过', () => {
        const result = specialCharIam.user.validatePassword('TestPass!23')
        expect(result.success).toBe(true)
      })

      it('长度不足 10 应不通过', () => {
        const result = specialCharIam.user.validatePassword('Test!2abc')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })
    })

    // =========================================================================
    // getUser
    // =========================================================================

    describe('getUser', () => {
      it('应能通过 ID 获取用户', async () => {
        const regResult = await getIam().user.register({
          username: 'user_get_by_id',
          password: TEST_PASSWORD,
        })
        expect(regResult.success).toBe(true)
        if (!regResult.success)
          return

        const result = await getIam().user.getUser(regResult.data.user.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data?.username).toBe('user_get_by_id')
        }
      })

      it('不存在的 ID 应返回 null', async () => {
        const result = await getIam().user.getUser('nonexistent-id')
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBeNull()
        }
      })

      it('返回的用户不应包含 passwordHash', async () => {
        const regResult = await getIam().user.register({
          username: 'user_no_hash',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        const result = await getIam().user.getUser(regResult.data.user.id)
        expect(result.success).toBe(true)
        if (result.success && result.data) {
          expect((result.data as any).passwordHash).toBeUndefined()
        }
      })
    })

    // =========================================================================
    // getCurrentUser
    // =========================================================================

    describe('getCurrentUser', () => {
      it('通过有效令牌应返回当前用户', async () => {
        await getIam().user.register({
          username: 'user_current',
          password: TEST_PASSWORD,
        })
        const loginResult = await getIam().auth.login({
          identifier: 'user_current',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        const result = await getIam().user.getCurrentUser(loginResult.data.accessToken)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.username).toBe('user_current')
          expect(result.data.id).toBeTruthy()
        }
      })

      it('无效令牌应返回错误', async () => {
        const result = await getIam().user.getCurrentUser('bad-token')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.SESSION_INVALID)
        }
      })

      it('空令牌应返回错误', async () => {
        const result = await getIam().user.getCurrentUser('')
        expect(result.success).toBe(false)
      })
    })

    // =========================================================================
    // listUsers
    // =========================================================================

    describe('listUsers', () => {
      it('应返回分页用户列表', async () => {
        const result = await getIam().user.listUsers({ page: 1, pageSize: 10 })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.items).toBeInstanceOf(Array)
          expect(typeof result.data.total).toBe('number')
          expect(result.data.total).toBeGreaterThan(0)
          expect(result.data.page).toBe(1)
          expect(result.data.pageSize).toBe(10)
        }
      })

      it('不传参数应使用默认分页', async () => {
        const result = await getIam().user.listUsers()
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.items).toBeInstanceOf(Array)
        }
      })

      it('返回的用户列表不应包含 passwordHash', async () => {
        const result = await getIam().user.listUsers({ page: 1, pageSize: 5 })
        expect(result.success).toBe(true)
        if (result.success) {
          for (const user of result.data.items) {
            expect((user as any).passwordHash).toBeUndefined()
          }
        }
      })
    })

    // =========================================================================
    // updateUser
    // =========================================================================

    describe('updateUser', () => {
      it('应能更新用户 displayName', async () => {
        const regResult = await getIam().user.register({
          username: 'user_update',
          password: TEST_PASSWORD,
        })
        expect(regResult.success).toBe(true)
        if (!regResult.success)
          return

        const result = await getIam().user.updateUser(regResult.data.user.id, {
          displayName: '新名称',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.displayName).toBe('新名称')
          expect(result.data.username).toBe('user_update')
        }
      })

      it('不存在的用户应返回 USER_NOT_FOUND', async () => {
        const result = await getIam().user.updateUser('nonexistent-user-id', {
          displayName: 'xxx',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.USER_NOT_FOUND)
        }
      })

      it('空更新应返回当前用户（无修改）', async () => {
        const regResult = await getIam().user.register({
          username: 'user_empty_update',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        const result = await getIam().user.updateUser(regResult.data.user.id, {})
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.username).toBe('user_empty_update')
        }
      })
    })

    // =========================================================================
    // changePassword
    // =========================================================================

    describe('changePassword', () => {
      it('正确旧密码应成功修改', async () => {
        const newPass = 'NewPassword456'
        const regResult = await getIam().user.register({
          username: 'user_chpwd',
          password: TEST_PASSWORD,
        })
        expect(regResult.success).toBe(true)
        if (!regResult.success)
          return

        const changeResult = await getIam().user.changePassword(
          regResult.data.user.id,
          TEST_PASSWORD,
          newPass,
        )
        expect(changeResult.success).toBe(true)

        const loginResult = await getIam().auth.login({
          identifier: 'user_chpwd',
          password: newPass,
        })
        expect(loginResult.success).toBe(true)
      })

      it('使用旧密码登录应失败', async () => {
        const regResult = await getIam().user.register({
          username: 'user_chpwd_old_fail',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        await getIam().user.changePassword(
          regResult.data.user.id,
          TEST_PASSWORD,
          'NewStrongPwd789',
        )

        const loginResult = await getIam().auth.login({
          identifier: 'user_chpwd_old_fail',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(false)
      })

      it('旧密码错误应返回 INVALID_CREDENTIALS', async () => {
        const regResult = await getIam().user.register({
          username: 'user_chpwd_wrong',
          password: TEST_PASSWORD,
        })
        expect(regResult.success).toBe(true)
        if (!regResult.success)
          return

        const result = await getIam().user.changePassword(
          regResult.data.user.id,
          'WrongOldPass123',
          'NewPassword789',
        )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.INVALID_CREDENTIALS)
        }
      })

      it('新密码不满足策略应返回 PASSWORD_POLICY_VIOLATION', async () => {
        const regResult = await getIam().user.register({
          username: 'user_chpwd_weak',
          password: TEST_PASSWORD,
        })
        expect(regResult.success).toBe(true)
        if (!regResult.success)
          return

        const result = await getIam().user.changePassword(
          regResult.data.user.id,
          TEST_PASSWORD,
          WEAK_PASSWORD,
        )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.PASSWORD_POLICY_VIOLATION)
        }
      })

      it('用户不存在应返回 USER_NOT_FOUND', async () => {
        const result = await getIam().user.changePassword(
          'nonexistent-user-id',
          TEST_PASSWORD,
          'NewPassword789',
        )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.USER_NOT_FOUND)
        }
      })
    })

    // =========================================================================
    // requestPasswordReset / confirmPasswordReset（桩实现）
    // =========================================================================

    describe('requestPasswordReset / confirmPasswordReset', () => {
      it('requestPasswordReset 应返回 ok（桩实现）', async () => {
        const result = await getIam().user.requestPasswordReset('any@test.com')
        expect(result.success).toBe(true)
      })

      it('confirmPasswordReset 应返回 INTERNAL_ERROR（未实现）', async () => {
        const result = await getIam().user.confirmPasswordReset('fake-token', 'NewPass123')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.INTERNAL_ERROR)
        }
      })
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCommon(getIam))
  defineIamSuite('postgres+redis', postgresRedisEnv, getIam => defineCommon(getIam))
})
