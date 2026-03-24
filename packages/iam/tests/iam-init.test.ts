/**
 * @h-ai/iam — 初始化与生命周期测试
 *
 * 覆盖范围：
 * - 未初始化守卫：auth/user/authz/session/validatePassword 均返回 NOT_INITIALIZED
 * - 缺少依赖：db/cache 缺失时返回 CONFIG_ERROR
 * - 正常初始化、幂等 init、close 生命周期
 * - client 不依赖 init
 * - seedDefaultData: false 时不创建默认角色/权限
 * - 自定义密码/session 配置后 config 反映正确值
 */

import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { describe, expect, it } from 'vitest'
import { HaiIamError } from '../src/iam-types.js'
import { iam } from '../src/index.js'
import { defineIamEnvSuite, postgresRedisEnv, sqliteMemoryEnv } from './helpers/iam-test-suite.js'

describe('iam.init', () => {
  const defineCommon = () => {
    it('未初始化时 isInitialized 应为 false', async () => {
      await iam.close()
      expect(iam.isInitialized).toBe(false)
    })

    it('未初始化时调用 auth 操作应返回 NOT_INITIALIZED', async () => {
      await iam.close()
      const result = await iam.auth.login({ identifier: 'admin', password: 'x' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.NOT_INITIALIZED.code)
      }
    })

    it('未初始化时调用 user 操作应返回 NOT_INITIALIZED', async () => {
      await iam.close()
      const result = await iam.user.register({
        username: 'test',
        password: 'x',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.NOT_INITIALIZED.code)
      }
    })

    it('未初始化时调用 authz 操作应返回 NOT_INITIALIZED', async () => {
      await iam.close()
      const result = await iam.authz.checkPermission('x', 'read')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.NOT_INITIALIZED.code)
      }
    })

    it('未初始化时调用 session 操作应返回 NOT_INITIALIZED', async () => {
      await iam.close()
      const result = await iam.session.get('any-token')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.NOT_INITIALIZED.code)
      }
    })

    it('未初始化时 validatePassword 应返回 NOT_INITIALIZED', async () => {
      await iam.close()
      const result = iam.user.validatePassword('Password123')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.NOT_INITIALIZED.code)
      }
    })

    it('依赖未初始化时应返回 CONFIG_ERROR', async () => {
      await iam.close()
      // 暂时关闭 reldb/cache 以模拟依赖未初始化
      await cache.close()
      await reldb.close()
      const result = await iam.init({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.CONFIG_ERROR.code)
      }
      // 恢复依赖以免影响后续测试
      await reldb.init({ type: 'sqlite', database: ':memory:' })
      await cache.init({ type: 'memory' })
    })

    it('正常初始化应成功', async () => {
      await iam.close()
      const result = await iam.init({})
      expect(result.success).toBe(true)
      expect(iam.isInitialized).toBe(true)
      expect(iam.config).not.toBeNull()
      await iam.close()
    })

    it('重复初始化应幂等（直接返回 ok）', async () => {
      await iam.close()
      await iam.init({})
      const result = await iam.init({})
      expect(result.success).toBe(true)
      await iam.close()
    })

    it('close 后应恢复未初始化状态', async () => {
      await iam.init({})
      expect(iam.isInitialized).toBe(true)

      await iam.close()
      expect(iam.isInitialized).toBe(false)
      expect(iam.config).toBeNull()

      const result = await iam.auth.login({ identifier: 'x', password: 'x' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.NOT_INITIALIZED.code)
      }
    })

    it('seedDefaultData: false 时初始化应成功且不触发种子流程', async () => {
      await iam.close()
      const result = await iam.init({ seedDefaultData: false })
      expect(result.success).toBe(true)
      expect(iam.isInitialized).toBe(true)
      expect(iam.config?.seedDefaultData).toBe(false)

      const checkResult = await iam.authz.checkPermission(
        'test-user',
        'any:perm',
      )
      expect(checkResult.success).toBe(true)
      await iam.close()
    })

    it('自定义密码配置后 config 应反映正确值', async () => {
      await iam.close()
      const result = await iam.init({
        password: { minLength: 12, requireUppercase: true, requireNumber: true },
      })
      expect(result.success).toBe(true)
      expect(iam.config?.password.minLength).toBe(12)
      expect(iam.config?.password.requireUppercase).toBe(true)
      expect(iam.config?.password.requireNumber).toBe(true)
      await iam.close()
    })

    it('自定义 session 配置后 config 应反映正确值', async () => {
      await iam.close()
      const result = await iam.init({
        session: { maxAge: 7200, sliding: true },
      })
      expect(result.success).toBe(true)
      expect(iam.config?.session.maxAge).toBe(7200)
      expect(iam.config?.session.sliding).toBe(true)
      await iam.close()
    })
  }

  defineIamEnvSuite('sqlite+memory', sqliteMemoryEnv(), () => defineCommon())
  defineIamEnvSuite('postgres+redis', postgresRedisEnv, () => defineCommon())
})
