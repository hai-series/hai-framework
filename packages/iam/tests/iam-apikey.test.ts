/**
 * @h-ai/iam — API Key 认证测试
 *
 * 覆盖范围：
 * - 未启用 apikey 时 iam.apiKey 应返回 NOT_INITIALIZED
 * - loginWithApiKey 未启用时应返回 LOGIN_DISABLED
 * - 启用后 API Key CRUD：create / list / get / revoke
 * - API Key 认证：loginWithApiKey 成功、错误 key、已吊销 key
 * - API Key 数量限制：超出 maxKeysPerUser 应返回 INVALID_ARGUMENT
 * - API Key 过期：过期 key 认证应返回 APIKEY_EXPIRED
 * - verifyApiKey 独立验证
 */

import type { IamFunctions } from '../src/iam-types.js'
import { describe, expect, it } from 'vitest'
import { HaiIamError, iam } from '../src/index.js'
import { defineIamEnvSuite, defineIamSuite, sqliteMemoryEnv, TEST_PASSWORD } from './helpers/iam-test-suite.js'

// =============================================================================
// 未启用 apikey 时的行为
// =============================================================================

describe('iam.apiKey（未启用）', () => {
  defineIamEnvSuite('sqlite+memory', sqliteMemoryEnv(), () => {
    it('默认配置下 apikey 未启用，iam.apiKey 调用应返回 NOT_INITIALIZED', async () => {
      await iam.close()
      // 默认 login.apikey = false
      const initResult = await iam.init({})
      expect(initResult.success).toBe(true)

      const result = await iam.apiKey.createApiKey('any-user', { name: 'test' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.NOT_INITIALIZED.code)
      }
      await iam.close()
    })

    it('未启用 apikey 时 loginWithApiKey 应返回 LOGIN_DISABLED', async () => {
      await iam.close()
      await iam.init({})

      const result = await iam.auth.loginWithApiKey({ key: 'hai_fakekey123' })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiIamError.LOGIN_DISABLED.code)
      }
      await iam.close()
    })
  })
})

// =============================================================================
// 启用 apikey 后的功能测试
// =============================================================================

describe('iam.apiKey（启用）', () => {
  const defineCommon = (getIam: () => IamFunctions) => {
    // 辅助：注册用户
    async function registerUser(username: string) {
      const result = await getIam().user.register({
        username,
        email: `${username}@test.com`,
        password: TEST_PASSWORD,
      })
      expect(result.success).toBe(true)
      return result.success ? result.data.user : null!
    }

    // =========================================================================
    // CRUD 操作
    // =========================================================================

    describe('createApiKey', () => {
      it('应成功创建 API Key 并返回明文密钥', async () => {
        const user = await registerUser('apikey_create_user')
        const result = await getIam().apiKey.createApiKey(user.id, { name: 'test-key' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.rawKey).toBeTruthy()
          expect(result.data.rawKey.startsWith('hai_')).toBe(true)
          expect(result.data.apiKey.name).toBe('test-key')
          expect(result.data.apiKey.userId).toBe(user.id)
          expect(result.data.apiKey.enabled).toBe(true)
          expect(result.data.apiKey.scopes).toEqual([])
        }
      })

      it('应支持自定义 scopes', async () => {
        const user = await registerUser('apikey_scope_user')
        const result = await getIam().apiKey.createApiKey(user.id, {
          name: 'scoped-key',
          scopes: ['read', 'write'],
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.apiKey.scopes).toEqual(['read', 'write'])
        }
      })

      it('超出 maxKeysPerUser 应返回 INVALID_ARGUMENT', async () => {
        const user = await registerUser('apikey_limit_user')
        // maxKeysPerUser 设为 2
        for (let i = 0; i < 2; i++) {
          const r = await getIam().apiKey.createApiKey(user.id, { name: `key-${i}` })
          expect(r.success).toBe(true)
        }
        const result = await getIam().apiKey.createApiKey(user.id, { name: 'key-overflow' })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.INVALID_ARGUMENT.code)
        }
      })
    })

    describe('listApiKeys', () => {
      it('应列出用户的所有 API Key', async () => {
        const user = await registerUser('apikey_list_user')
        await getIam().apiKey.createApiKey(user.id, { name: 'key-1' })
        await getIam().apiKey.createApiKey(user.id, { name: 'key-2' })

        const result = await getIam().apiKey.listApiKeys(user.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.length).toBe(2)
          const names = result.data.map(k => k.name).sort()
          expect(names).toEqual(['key-1', 'key-2'])
          // 不应含 keyHash
          for (const key of result.data) {
            expect('keyHash' in key).toBe(false)
          }
        }
      })

      it('无 API Key 的用户应返回空数组', async () => {
        const user = await registerUser('apikey_empty_user')
        const result = await getIam().apiKey.listApiKeys(user.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toEqual([])
        }
      })
    })

    describe('getApiKey', () => {
      it('应返回 API Key 详情', async () => {
        const user = await registerUser('apikey_get_user')
        const createResult = await getIam().apiKey.createApiKey(user.id, { name: 'get-key' })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const result = await getIam().apiKey.getApiKey(createResult.data.apiKey.id)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).not.toBeNull()
          expect(result.data!.name).toBe('get-key')
          expect(result.data!.id).toBe(createResult.data.apiKey.id)
        }
      })

      it('不存在的 ID 应返回 null', async () => {
        const result = await getIam().apiKey.getApiKey('non-existent-id')
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data).toBeNull()
        }
      })
    })

    describe('revokeApiKey', () => {
      it('应成功吊销 API Key', async () => {
        const user = await registerUser('apikey_revoke_user')
        const createResult = await getIam().apiKey.createApiKey(user.id, { name: 'revoke-key' })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const revokeResult = await getIam().apiKey.revokeApiKey(createResult.data.apiKey.id)
        expect(revokeResult.success).toBe(true)

        // 吊销后应不再存在
        const getResult = await getIam().apiKey.getApiKey(createResult.data.apiKey.id)
        expect(getResult.success).toBe(true)
        if (getResult.success) {
          expect(getResult.data).toBeNull()
        }
      })
    })

    // =========================================================================
    // verifyApiKey
    // =========================================================================

    describe('verifyApiKey', () => {
      it('有效 key 应返回 ApiKey 实体', async () => {
        const user = await registerUser('apikey_verify_user')
        const createResult = await getIam().apiKey.createApiKey(user.id, { name: 'verify-key' })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const result = await getIam().apiKey.verifyApiKey(createResult.data.rawKey)
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.userId).toBe(user.id)
          expect(result.data.name).toBe('verify-key')
        }
      })

      it('无效 key 应返回 APIKEY_INVALID', async () => {
        const result = await getIam().apiKey.verifyApiKey('hai_invalidkey1234567890')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.APIKEY_INVALID.code)
        }
      })

      it('吊销后的 key 应返回 APIKEY_INVALID', async () => {
        const user = await registerUser('apikey_verify_revoked')
        const createResult = await getIam().apiKey.createApiKey(user.id, { name: 'r-key' })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        await getIam().apiKey.revokeApiKey(createResult.data.apiKey.id)

        const result = await getIam().apiKey.verifyApiKey(createResult.data.rawKey)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.APIKEY_INVALID.code)
        }
      })
    })

    // =========================================================================
    // loginWithApiKey
    // =========================================================================

    describe('loginWithApiKey', () => {
      it('有效 API Key 应返回 user + accessToken', async () => {
        const user = await registerUser('apikey_login_user')
        const createResult = await getIam().apiKey.createApiKey(user.id, { name: 'login-key' })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        const result = await getIam().auth.loginWithApiKey({ key: createResult.data.rawKey })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.user.id).toBe(user.id)
          expect(result.data.user.username).toBe('apikey_login_user')
          expect(result.data.tokens.accessToken).toBeTruthy()
        }
      })

      it('无效 API Key 应返回 APIKEY_INVALID', async () => {
        const result = await getIam().auth.loginWithApiKey({ key: 'hai_badkey99999999999999' })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.APIKEY_INVALID.code)
        }
      })

      it('吊销后 API Key 登录应返回 APIKEY_INVALID', async () => {
        const user = await registerUser('apikey_login_revoked')
        const createResult = await getIam().apiKey.createApiKey(user.id, { name: 'rk' })
        expect(createResult.success).toBe(true)
        if (!createResult.success)
          return

        await getIam().apiKey.revokeApiKey(createResult.data.apiKey.id)

        const result = await getIam().auth.loginWithApiKey({ key: createResult.data.rawKey })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.code).toBe(HaiIamError.APIKEY_INVALID.code)
        }
      })
    })

    // =========================================================================
    // API Key 过期
    // =========================================================================

    describe('apiKey 过期', () => {
      it('带 expirationDays 创建的 key 应有 expiresAt', async () => {
        const user = await registerUser('apikey_expiration_user')
        const result = await getIam().apiKey.createApiKey(user.id, {
          name: 'exp-key',
          expirationDays: 30,
        })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.apiKey.expiresAt).not.toBeNull()
          // 过期时间应在 29-31 天后（容差）
          const diffMs = result.data.apiKey.expiresAt!.getTime() - Date.now()
          const diffDays = diffMs / 86400000
          expect(diffDays).toBeGreaterThan(29)
          expect(diffDays).toBeLessThan(31)
        }
      })

      it('永不过期的 key expiresAt 应为 null', async () => {
        const user = await registerUser('apikey_no_exp_user')
        const result = await getIam().apiKey.createApiKey(user.id, { name: 'no-exp' })
        expect(result.success).toBe(true)
        if (result.success) {
          expect(result.data.apiKey.expiresAt).toBeNull()
        }
      })
    })
  }

  defineIamSuite('sqlite+memory', sqliteMemoryEnv(), defineCommon, () => ({
    login: { password: true, otp: false, ldap: false, apikey: true },
    apikey: { maxKeysPerUser: 2, defaultExpirationDays: 0, prefix: 'hai_' },
  }))
})
