/**
 * =============================================================================
 * @hai/iam - 初始化与生命周期测试
 * =============================================================================
 *
 * 覆盖范围：
 * - 未初始化守卫：auth/user/authz/session/validatePassword 均返回 NOT_INITIALIZED
 * - 缺少依赖：cache 缺失时返回 CONFIG_ERROR
 * - 正常初始化、幂等 init、close 生命周期
 * - iam.create() 实例隔离
 * - client / errorCode 不依赖 init
 * - seedDefaultData: false 时不创建默认角色/权限
 * - 自定义密码配置后 config 反映正确值
 */

import { cache } from '@hai/cache'
import { db } from '@hai/db'
import { describe, expect, it } from 'vitest'
import { IamErrorCode } from '../src/iam-config.js'
import { iam } from '../src/index.js'
import { defineIamEnvSuite, postgresRedisEnv, sqliteMemoryEnv } from './helpers/iam-test-suite.js'

describe('iam.init', () => {
  const defineCommon = () => {
    it('未初始化时 isInitialized 应为 false', () => {
      const instance = iam.create()
      expect(instance.isInitialized).toBe(false)
    })

    it('未初始化时调用 auth 操作应返回 NOT_INITIALIZED', async () => {
      const instance = iam.create()
      const result = await instance.auth.login({ identifier: 'admin', password: 'x' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(IamErrorCode.NOT_INITIALIZED)
      }
    })

    it('未初始化时调用 user 操作应返回 NOT_INITIALIZED', async () => {
      const instance = iam.create()
      const result = await instance.user.register({
        username: 'test',
        password: 'x',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(IamErrorCode.NOT_INITIALIZED)
      }
    })

    it('未初始化时调用 authz 操作应返回 NOT_INITIALIZED', async () => {
      const instance = iam.create()
      const result = await instance.authz.checkPermission({ userId: 'x', roles: [] }, 'read')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(IamErrorCode.NOT_INITIALIZED)
      }
    })

    it('未初始化时调用 session 操作应返回 NOT_INITIALIZED', async () => {
      const instance = iam.create()
      const result = await instance.session.get('any-token')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(IamErrorCode.NOT_INITIALIZED)
      }
    })

    it('未初始化时 validatePassword 应返回 NOT_INITIALIZED', () => {
      const instance = iam.create()
      const result = instance.user.validatePassword('Password123')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(IamErrorCode.NOT_INITIALIZED)
      }
    })

    it('不传 cache 应返回 CONFIG_ERROR', async () => {
      const instance = iam.create()
      const result = await instance.init(db, {}, undefined as any)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(IamErrorCode.CONFIG_ERROR)
      }
    })

    it('正常初始化应成功', async () => {
      const instance = iam.create()
      const result = await instance.init(db, {}, { cache })
      expect(result.success).toBe(true)
      expect(instance.isInitialized).toBe(true)
      expect(instance.config).not.toBeNull()
      await instance.close()
    })

    it('重复初始化应幂等（直接返回 ok）', async () => {
      const instance = iam.create()
      await instance.init(db, {}, { cache })
      const result = await instance.init(db, {}, { cache })
      expect(result.success).toBe(true)
      await instance.close()
    })

    it('close 后应恢复未初始化状态', async () => {
      const instance = iam.create()
      await instance.init(db, {}, { cache })
      expect(instance.isInitialized).toBe(true)

      await instance.close()
      expect(instance.isInitialized).toBe(false)
      expect(instance.config).toBeNull()

      const result = await instance.auth.login({ identifier: 'x', password: 'x' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(IamErrorCode.NOT_INITIALIZED)
      }
    })

    it('iam.create() 应生成独立实例', async () => {
      const a = iam.create()
      const b = iam.create()
      await a.init(db, {}, { cache })
      expect(a.isInitialized).toBe(true)
      expect(b.isInitialized).toBe(false)
      await a.close()
    })

    it('client 操作无需 init 即可使用', () => {
      const instance = iam.create()
      expect(instance.client).toBeDefined()
      expect(typeof instance.client.create).toBe('function')
    })

    it('errorCode 属性应可访问', () => {
      const instance = iam.create()
      expect(instance.errorCode.INVALID_CREDENTIALS).toBe(IamErrorCode.INVALID_CREDENTIALS)
      expect(instance.errorCode.NOT_INITIALIZED).toBe(IamErrorCode.NOT_INITIALIZED)
    })

    it('seedDefaultData: false 时初始化应成功且不触发种子流程', async () => {
      const instance = iam.create()
      const result = await instance.init(db, { seedDefaultData: false }, { cache })
      expect(result.success).toBe(true)
      expect(instance.isInitialized).toBe(true)
      expect(instance.config?.seedDefaultData).toBe(false)

      const checkResult = await instance.authz.checkPermission(
        { userId: 'test-user', roles: [] },
        'any:perm',
      )
      expect(checkResult.success).toBe(true)
      await instance.close()
    })

    it('自定义密码配置后 config 应反映正确值', async () => {
      const instance = iam.create()
      const result = await instance.init(db, {
        password: { minLength: 12, requireUppercase: true, requireNumber: true },
      }, { cache })
      expect(result.success).toBe(true)
      expect(instance.config?.password.minLength).toBe(12)
      expect(instance.config?.password.requireUppercase).toBe(true)
      expect(instance.config?.password.requireNumber).toBe(true)
      await instance.close()
    })

    it('自定义 session 配置后 config 应反映正确值', async () => {
      const instance = iam.create()
      const result = await instance.init(db, {
        session: { maxAge: 7200, sliding: true },
      }, { cache })
      expect(result.success).toBe(true)
      expect(instance.config?.session.maxAge).toBe(7200)
      expect(instance.config?.session.sliding).toBe(true)
      await instance.close()
    })
  }

  defineIamEnvSuite('sqlite+memory', sqliteMemoryEnv(), () => defineCommon())
  defineIamEnvSuite('postgres+redis', postgresRedisEnv, () => defineCommon())
})
