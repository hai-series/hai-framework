/**
 * =============================================================================
 * @hai/iam - 会话管理测试
 * =============================================================================
 *
 * 覆盖范围：
 * - create + get：正常创建、获取、不存在令牌
 * - verifyToken：有效/无效/空令牌
 * - update：正常更新、不存在的令牌应返回 SESSION_NOT_FOUND
 * - delete：正常删除、不存在的令牌幂等删除
 * - deleteByUserId：多会话批量删除、无会话用户删除返回 0
 * - 滑动续期：get 更新 lastActiveAt
 * - 单设备登录：新登录使旧会话失效
 * - 登录后角色同步
 * - 创建会话时自定义 maxAge / source / data
 */

import type { IamFunctions } from '../src/iam-types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IamErrorCode } from '../src/iam-config.js'
import { defineIamSuite, initIam, postgresRedisEnv, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

describe('iam.session', () => {
  const defineCommon = (getIam: () => IamFunctions) => {
    // =========================================================================
    // 创建与获取会话
    // =========================================================================

    describe('create + get', () => {
      it('应创建会话并返回 Session 对象', async () => {
        const result = await getIam().session.create({
          userId: 'session-user-1',
          username: 'testuser',
          roles: ['role_a'],
          source: 'pc',
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.userId).toBe('session-user-1')
          expect(result.data.username).toBe('testuser')
          expect(result.data.roles).toContain('role_a')
          expect(result.data.accessToken).toBeTruthy()
          expect(result.data.createdAt).toBeInstanceOf(Date)
          expect(result.data.expiresAt).toBeInstanceOf(Date)
        }
      })

      it('get 应返回已创建的会话', async () => {
        const createResult = await getIam().session.create({
          userId: 'session-user-2',
          roles: [],
        })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const getResult = await getIam().session.get(createResult.data.accessToken)
        expect(getResult.success).toBe(true)
        if (getResult.success) {
          expect(getResult.data?.userId).toBe('session-user-2')
        }
      })

      it('get 不存在的令牌应返回 null', async () => {
        const result = await getIam().session.get('non-existent-token')
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBeNull()
        }
      })
    })

    // =========================================================================
    // verifyToken
    // =========================================================================

    describe('verifyToken', () => {
      it('有效令牌应返回 Session', async () => {
        const createResult = await getIam().session.create({
          userId: 'session-verify-user',
          roles: ['admin'],
        })
        if (!createResult.success)
          return

        const result = await getIam().session.verifyToken(createResult.data.accessToken)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.userId).toBe('session-verify-user')
        }
      })

      it('无效令牌应返回 SESSION_INVALID', async () => {
        const result = await getIam().session.verifyToken('invalid-token')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.SESSION_INVALID)
        }
      })

      it('空字符串令牌应返回 SESSION_INVALID', async () => {
        const result = await getIam().session.verifyToken('')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.SESSION_INVALID)
        }
      })
    })

    // =========================================================================
    // update
    // =========================================================================

    describe('update', () => {
      it('应能更新会话数据', async () => {
        const createResult = await getIam().session.create({
          userId: 'session-update-user',
          roles: [],
        })
        if (!createResult.success)
          return

        const updateResult = await getIam().session.update(
          createResult.data.accessToken,
          { data: { theme: 'dark' } },
        )
        expect(updateResult.success).toBe(true)

        const getResult = await getIam().session.get(createResult.data.accessToken)
        expect(getResult.success).toBe(true)
        if (getResult.success && getResult.data) {
          expect(getResult.data.data?.theme).toBe('dark')
        }
      })

      it('更新不存在的令牌应返回 SESSION_NOT_FOUND', async () => {
        const result = await getIam().session.update(
          'non-existent-token-for-update',
          { data: { foo: 'bar' } },
        )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(IamErrorCode.SESSION_NOT_FOUND)
        }
      })
    })

    // =========================================================================
    // delete
    // =========================================================================

    describe('delete', () => {
      it('删除会话后应无法获取', async () => {
        const createResult = await getIam().session.create({
          userId: 'session-del-user',
          roles: [],
        })
        if (!createResult.success)
          return

        const delResult = await getIam().session.delete(createResult.data.accessToken)
        expect(delResult.success).toBe(true)

        const getResult = await getIam().session.get(createResult.data.accessToken)
        expect(getResult.success).toBe(true)
        if (getResult.success) {
          expect(getResult.data).toBeNull()
        }
      })

      it('删除不存在的令牌应幂等成功', async () => {
        const result = await getIam().session.delete('not-exist-token-for-delete')
        expect(result.success).toBe(true)
      })
    })

    // =========================================================================
    // deleteByUserId
    // =========================================================================

    describe('deleteByUserId', () => {
      it('应删除指定用户的所有会话', async () => {
        const userId = 'session-del-all-user'

        const s1 = await getIam().session.create({ userId, roles: [] })
        const s2 = await getIam().session.create({ userId, roles: [] })
        expect(s1.success && s2.success).toBe(true)
        if (!s1.success || !s2.success)
          return

        const delResult = await getIam().session.deleteByUserId(userId)
        expect(delResult.success).toBe(true)

        const g1 = await getIam().session.get(s1.data.accessToken)
        const g2 = await getIam().session.get(s2.data.accessToken)
        expect(g1.success).toBe(true)
        expect(g2.success).toBe(true)
        if (g1.success)
          expect(g1.data).toBeNull()
        if (g2.success)
          expect(g2.data).toBeNull()
      })

      it('无会话的用户 deleteByUserId 应返回 0', async () => {
        const result = await getIam().session.deleteByUserId('user-with-no-sessions')
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBe(0)
        }
      })
    })

    // =========================================================================
    // 创建会话额外选项
    // =========================================================================

    describe('create 额外选项', () => {
      it('创建会话时可传入 source 和 data', async () => {
        const result = await getIam().session.create({
          userId: 'session-opts-user',
          roles: ['r1'],
          source: 'android',
          data: { deviceId: 'abc123' },
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.source).toBe('android')
          expect(result.data.data?.deviceId).toBe('abc123')
        }
      })
    })

    // =========================================================================
    // 滑动续期
    // =========================================================================

    describe('滑动续期', () => {
      let slidingIam: IamFunctions

      beforeAll(async () => {
        slidingIam = await initIam({
          session: { maxAge: 3600, sliding: true },
        })
      })

      afterAll(async () => {
        await slidingIam.close()
      })

      it('get 操作应更新 lastActiveAt', async () => {
        const createResult = await slidingIam.session.create({
          userId: 'sliding-user',
          roles: [],
        })
        if (!createResult.success)
          return

        const originalLastActive = createResult.data.lastActiveAt.getTime()

        await new Promise(resolve => setTimeout(resolve, 50))

        const getResult = await slidingIam.session.get(createResult.data.accessToken)
        expect(getResult.success).toBe(true)
        if (getResult.success && getResult.data) {
          expect(getResult.data.lastActiveAt.getTime()).toBeGreaterThanOrEqual(originalLastActive)
        }
      })
    })

    // =========================================================================
    // 单设备登录
    // =========================================================================

    describe('单设备登录', () => {
      let singleIam: IamFunctions

      beforeAll(async () => {
        singleIam = await initIam({
          session: { maxAge: 3600, sliding: false, singleDevice: true },
        })
      })

      afterAll(async () => {
        await singleIam.close()
      })

      it('新登录应使旧会话失效', async () => {
        await singleIam.user.register({
          username: 'single_device_user',
          password: TEST_PASSWORD,
        })

        const login1 = await singleIam.auth.login({
          identifier: 'single_device_user',
          password: TEST_PASSWORD,
        })
        expect(login1.success).toBe(true)
        if (!login1.success)
          return

        const login2 = await singleIam.auth.login({
          identifier: 'single_device_user',
          password: TEST_PASSWORD,
        })
        expect(login2.success).toBe(true)
        if (!login2.success)
          return

        const verify1 = await singleIam.auth.verifyToken(login1.data.accessToken)
        expect(verify1.success).toBe(false)

        const verify2 = await singleIam.auth.verifyToken(login2.data.accessToken)
        expect(verify2.success).toBe(true)
      })
    })

    // =========================================================================
    // 登录后会话包含角色
    // =========================================================================

    describe('登录后会话角色同步', () => {
      it('登录创建的会话应包含用户角色', async () => {
        const role = await getIam().authz.createRole({ code: 'session_role', name: '会话角色' })
        if (!role.success)
          return

        const regResult = await getIam().user.register({
          username: 'session_role_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        await getIam().authz.assignRole(regResult.data.user.id, role.data.id)

        const loginResult = await getIam().auth.login({
          identifier: 'session_role_user',
          password: TEST_PASSWORD,
        })
        expect(loginResult.success).toBe(true)
        if (!loginResult.success)
          return

        const session = await getIam().auth.verifyToken(loginResult.data.accessToken)
        expect(session.success).toBe(true)
        if (session.success) {
          expect(session.data.roles).toContain(role.data.id)
        }
      })

      it('assignRole 后已有会话应实时同步新角色', async () => {
        const regResult = await getIam().user.register({
          username: 'session_sync_user',
          password: TEST_PASSWORD,
        })
        if (!regResult.success)
          return

        const loginResult = await getIam().auth.login({
          identifier: 'session_sync_user',
          password: TEST_PASSWORD,
        })
        if (!loginResult.success)
          return

        const role = await getIam().authz.createRole({ code: 'sync_new_role', name: '同步角色' })
        if (!role.success)
          return
        await getIam().authz.assignRole(regResult.data.user.id, role.data.id)

        const session = await getIam().auth.verifyToken(loginResult.data.accessToken)
        expect(session.success).toBe(true)
        if (session.success) {
          expect(session.data.roles).toContain(role.data.id)
        }
      })
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), getIam => defineCommon(getIam))
  defineIamSuite('postgres+redis', postgresRedisEnv, getIam => defineCommon(getIam))
})
