/**
 * @h-ai/iam — 初始化与生命周期测试
 *
 * 覆盖范围：
 * - 未初始化守卫：auth/user/authz/session/apiKey/ticket 均返回 NOT_INITIALIZED
 * - 缺少依赖：db/cache 缺失时返回 CONFIG_ERROR
 * - 正常初始化、重复 init 重建状态、close 生命周期
 * - seedDefaultData: false 时不创建默认角色/权限
 * - 自定义密码/session 配置后 config 反映正确值
 */

import { cache } from '@h-ai/cache'
import { reldb } from '@h-ai/reldb'
import { describe, expect, it } from 'vitest'
import { HaiIamError } from '../src/iam-types.js'
import { iam } from '../src/index.js'
import { defineIamEnvSuite, sqliteMemoryEnv } from './helpers/iam-test-suite.js'

describe('iam.init', () => {
  const defineCommon = () => {
    it('未初始化时全部业务入口返回 NOT_INITIALIZED', async () => {
      await iam.close()
      expect(iam.isInitialized).toBe(false)
      expect(iam.config).toBeNull()
      const results = await Promise.all([
        iam.auth.login({ identifier: 'admin', password: 'x' }),
        iam.user.register({ username: 'test', password: 'x' }),
        iam.authz.checkPermission('x', 'read'),
        iam.session.get('any-token'),
        iam.user.validatePassword('Password123'),
        iam.apiKey.verifyApiKey('any-key'),
        iam.ticket.issue({ subjectId: 'test', purpose: 'test' }),
      ])
      for (const result of results) {
        expect(result).toMatchObject({ success: false, error: { code: HaiIamError.NOT_INITIALIZED.code } })
      }
    })

    it('缺少任一依赖都拒绝初始化，依赖恢复后可重试', async () => {
      await iam.close()
      await cache.close()
      await reldb.close()
      expect(await iam.init({})).toMatchObject({ success: false, error: { code: HaiIamError.CONFIG_ERROR.code } })
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
      expect(await iam.init({})).toMatchObject({ success: false, error: { code: HaiIamError.CONFIG_ERROR.code } })
      expect(iam.isInitialized).toBe(false)
      await reldb.close()
      expect((await cache.init({ type: 'memory' })).success).toBe(true)
      expect(await iam.init({})).toMatchObject({ success: false, error: { code: HaiIamError.CONFIG_ERROR.code } })
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
      expect((await iam.init({})).success).toBe(true)
      await iam.close()
    })

    it('正常初始化应成功', async () => {
      await iam.close()
      const result = await iam.init({})
      expect(result.success).toBe(true)
      expect(iam.isInitialized).toBe(true)
      expect(iam.config).not.toBeNull()
      await iam.close()
    })

    it('重复初始化应重新建立可用的模块状态', async () => {
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
      await reldb.close()
      expect((await reldb.init({ type: 'sqlite', database: ':memory:' })).success).toBe(true)
      const result = await iam.init({ seedDefaultData: false })
      expect(result.success).toBe(true)
      expect(iam.isInitialized).toBe(true)
      expect(iam.config?.seedDefaultData).toBe(false)
      const roles = await iam.authz.getAllRoles()
      const permissions = await iam.authz.getAllPermissions()
      expect(roles.success).toBe(true)
      expect(permissions.success).toBe(true)
      if (roles.success)
        expect(roles.data.items).toEqual([])
      if (permissions.success)
        expect(permissions.data.items).toEqual([])
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

    it('ldap 配置快照应脱敏 URL 凭证与 bindPassword', async () => {
      await iam.close()
      const result = await iam.init({
        ldap: {
          url: 'ldap://admin:secret@ldap.example.com:389',
          bindDn: 'cn=admin,dc=example,dc=com',
          bindPassword: 'bind-secret',
          searchBase: 'ou=users,dc=example,dc=com',
        },
      })

      expect(result.success).toBe(true)
      expect(iam.config?.ldap?.url).toBe('ldap://[REDACTED]:[REDACTED]@ldap.example.com:389')
      expect(iam.config?.ldap?.bindPassword).toBe('[REDACTED]')
      await iam.close()
    })
  }

  defineIamEnvSuite('sqlite+memory', sqliteMemoryEnv(), () => defineCommon())
})
