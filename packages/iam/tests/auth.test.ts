/**
 * =============================================================================
 * @hai/iam - 认证模块测试
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { DbService } from '@hai/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { iam } from '../src/index.js'
import { createMockCacheService, defaultTestConfig, setupTestDb, teardownTestDb } from './helpers/setup.js'

// 增加测试超时时间（密码哈希需要较长时间）
const SLOW_TIMEOUT = 30000

describe('auth', () => {
  let testDb: DbService
  let testCache: CacheService

  beforeEach(async () => {
    testDb = await setupTestDb()
    testCache = createMockCacheService()
    await iam.init(testDb, testCache, defaultTestConfig)
  })

  afterEach(async () => {
    await iam.close()
    await teardownTestDb()
  })

  describe('login', () => {
    beforeEach(async () => {
      await iam.user.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123',
      })
    }, SLOW_TIMEOUT)

    it('应该使用用户名登录成功', async () => {
      const result = await iam.auth.login({
        identifier: 'testuser',
        password: 'Password123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.username).toBe('testuser')
        expect(result.data.accessToken).toBeTruthy()
        expect(result.data.refreshToken).toBeTruthy()
      }
    }, SLOW_TIMEOUT)

    it('应该使用邮箱登录成功', async () => {
      const result = await iam.auth.login({
        identifier: 'test@example.com',
        password: 'Password123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.email).toBe('test@example.com')
      }
    }, SLOW_TIMEOUT)

    it('应该拒绝错误的密码', async () => {
      const result = await iam.auth.login({
        identifier: 'testuser',
        password: 'WrongPassword123',
      })

      expect(result.success).toBe(false)
    }, SLOW_TIMEOUT)

    it('应该拒绝不存在的用户', async () => {
      const result = await iam.auth.login({
        identifier: 'nonexistent',
        password: 'Password123',
      })

      expect(result.success).toBe(false)
    }, SLOW_TIMEOUT)
  })

  describe('verifyToken', () => {
    it('应该验证有效令牌', async () => {
      await iam.user.register({
        username: 'testuser',
        password: 'Password123',
      })

      const loginResult = await iam.auth.login({
        identifier: 'testuser',
        password: 'Password123',
      })

      if (!loginResult.success) {
        throw new Error('登录失败')
      }

      const verifyResult = await iam.auth.verifyToken(loginResult.data.accessToken)

      expect(verifyResult.success).toBe(true)
      if (verifyResult.success) {
        expect(verifyResult.data.username).toBe('testuser')
        expect(verifyResult.data.type).toBe('access')
      }
    }, SLOW_TIMEOUT)

    it('应该拒绝无效令牌', async () => {
      const result = await iam.auth.verifyToken('invalid-token')
      expect(result.success).toBe(false)
    })
  })

  describe('refresh', () => {
    it('应该刷新令牌', async () => {
      await iam.user.register({
        username: 'testuser',
        password: 'Password123',
      })

      const loginResult = await iam.auth.login({
        identifier: 'testuser',
        password: 'Password123',
      })

      if (!loginResult.success || !loginResult.data.refreshToken) {
        throw new Error('登录失败')
      }

      const refreshResult = await iam.auth.refresh(loginResult.data.refreshToken)

      expect(refreshResult.success).toBe(true)
      if (refreshResult.success) {
        expect(refreshResult.data.accessToken).toBeTruthy()
      }
    }, SLOW_TIMEOUT)
  })

  describe('logout', () => {
    it('应该成功登出', async () => {
      await iam.user.register({
        username: 'testuser',
        password: 'Password123',
      })

      const loginResult = await iam.auth.login({
        identifier: 'testuser',
        password: 'Password123',
      })

      if (!loginResult.success) {
        throw new Error('登录失败')
      }

      const logoutResult = await iam.auth.logout(loginResult.data.accessToken)
      expect(logoutResult.success).toBe(true)
    }, SLOW_TIMEOUT)
  })
})
