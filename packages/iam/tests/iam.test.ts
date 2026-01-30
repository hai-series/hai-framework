/**
 * =============================================================================
 * @hai/iam - IAM 核心测试（初始化/关闭）
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { DbService } from '@hai/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { iam } from '../src/index.js'
import { createMockCacheService, defaultTestConfig, setupTestDb, teardownTestDb } from './helpers/setup.js'

describe('iam', () => {
  let testDb: DbService
  let testCache: CacheService

  beforeEach(async () => {
    testDb = await setupTestDb()
    testCache = createMockCacheService()
  })

  afterEach(async () => {
    await iam.close()
    await teardownTestDb()
  })

  describe('init/close', () => {
    it('应该成功初始化', async () => {
      const result = await iam.init(testDb, testCache, defaultTestConfig)
      expect(result.success).toBe(true)
      expect(iam.isInitialized).toBe(true)
    })

    it('应该成功关闭', async () => {
      await iam.init(testDb, testCache, defaultTestConfig)
      const result = await iam.close()
      expect(result.success).toBe(true)
      expect(iam.isInitialized).toBe(false)
    })

    it('重复初始化应该安全', async () => {
      await iam.init(testDb, testCache, defaultTestConfig)
      const result = await iam.init(testDb, testCache, defaultTestConfig)
      expect(result.success).toBe(true)
    })

    it('应该支持默认配置', async () => {
      const result = await iam.init(testDb, testCache)
      expect(result.success).toBe(true)
      expect(iam.config).toBeTruthy()
    })

    it('未初始化时调用方法应该返回错误', async () => {
      const loginResult = await iam.auth.login({
        identifier: 'test',
        password: 'test',
      })
      expect(loginResult.success).toBe(false)

      const registerResult = await iam.user.register({
        username: 'test',
        password: 'test',
      })
      expect(registerResult.success).toBe(false)
    })
  })

  describe('config', () => {
    it('应该返回当前配置', async () => {
      await iam.init(testDb, testCache, defaultTestConfig)
      expect(iam.config).toBeTruthy()
      expect(iam.config?.strategies).toContain('password')
    })

    it('应该支持自定义密码策略配置', async () => {
      await iam.init(testDb, testCache, {
        strategies: ['password'],
        password: {
          minLength: 12,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSymbols: true,
        },
      })

      // 验证密码强度要求生效
      const weakResult = iam.user.validatePassword('Passw0rd')
      expect(weakResult.success).toBe(false)

      const strongResult = iam.user.validatePassword('Passw0rd!@#$')
      expect(strongResult.success).toBe(true)
    })

    it('应该支持 JWT 会话配置', async () => {
      await iam.init(testDb, testCache, {
        strategies: ['password'],
        session: {
          type: 'jwt',
          jwt: {
            secret: 'custom-secret-key-must-be-at-least-32-characters',
            algorithm: 'HS256',
            accessTokenExpiresIn: 300,
            refreshTokenExpiresIn: 86400,
          },
        },
      })

      expect(iam.session.type).toBe('jwt')
    })

    it('应该支持有状态会话配置', async () => {
      await iam.init(testDb, testCache, {
        strategies: ['password'],
        session: {
          type: 'stateful',
          jwt: {
            secret: 'custom-secret-key-must-be-at-least-32-characters',
          },
          maxAge: 3600,
        },
      })

      expect(iam.session.type).toBe('stateful')
    })
  })

  describe('authz manager', () => {
    it('应该返回授权管理器', async () => {
      await iam.init(testDb, testCache, defaultTestConfig)
      expect(iam.authz).toBeTruthy()
      expect(typeof iam.authz.checkPermission).toBe('function')
      expect(typeof iam.authz.createRole).toBe('function')
      expect(typeof iam.authz.createPermission).toBe('function')
    })
  })

  describe('session manager', () => {
    it('应该返回会话管理器', async () => {
      await iam.init(testDb, testCache, defaultTestConfig)
      expect(iam.session).toBeTruthy()
      expect(typeof iam.session.create).toBe('function')
      expect(typeof iam.session.verifyToken).toBe('function')
    })
  })
})
