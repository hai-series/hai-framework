/**
 * =============================================================================
 * @hai/iam - 用户模块测试
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { DbService } from '@hai/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { iam } from '../src/index.js'
import { createMockCacheService, defaultTestConfig, setupTestDb, teardownTestDb } from './helpers/setup.js'

// 增加测试超时时间（密码哈希需要较长时间）
const SLOW_TIMEOUT = 30000

describe('user', () => {
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

  describe('register', () => {
    it('应该成功注册用户', async () => {
      const result = await iam.user.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.username).toBe('testuser')
        expect(result.data.user.email).toBe('test@example.com')
        expect(result.data.user.enabled).toBe(true)
      }
    }, SLOW_TIMEOUT)

    it('应该支持禁用注册', async () => {
      await iam.close()
      await iam.init(testDb, testCache, {
        ...defaultTestConfig,
        register: { enabled: false, defaultEnabled: false },
      })

      const result = await iam.user.register({
        username: 'disabled-user',
        password: 'Password123',
      })

      expect(result.success).toBe(false)
    }, SLOW_TIMEOUT)

    it('应该拒绝弱密码', async () => {
      const result = await iam.user.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'weak',
      })

      expect(result.success).toBe(false)
    })

    it('应该拒绝重复的用户名', async () => {
      await iam.user.register({
        username: 'testuser',
        email: 'test1@example.com',
        password: 'Password123',
      })

      const result = await iam.user.register({
        username: 'testuser',
        email: 'test2@example.com',
        password: 'Password456',
      })

      expect(result.success).toBe(false)
    }, SLOW_TIMEOUT)

    it('应该拒绝重复的邮箱', async () => {
      await iam.user.register({
        username: 'user1',
        email: 'same@example.com',
        password: 'Password123',
      })

      const result = await iam.user.register({
        username: 'user2',
        email: 'same@example.com',
        password: 'Password456',
      })

      expect(result.success).toBe(false)
    }, SLOW_TIMEOUT)

    it('应该支持不带邮箱的注册', async () => {
      const result = await iam.user.register({
        username: 'testuser',
        password: 'Password123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.username).toBe('testuser')
        expect(result.data.user.email).toBeUndefined()
      }
    }, SLOW_TIMEOUT)
  })

  describe('validatePassword', () => {
    it('应该通过有效密码', () => {
      const result = iam.user.validatePassword('Password123')
      expect(result.success).toBe(true)
    })

    it('应该拒绝太短的密码', () => {
      const result = iam.user.validatePassword('Pass1')
      expect(result.success).toBe(false)
    })

    it('应该拒绝没有大写字母的密码', () => {
      const result = iam.user.validatePassword('password123')
      expect(result.success).toBe(false)
    })

    it('应该拒绝没有小写字母的密码', () => {
      const result = iam.user.validatePassword('PASSWORD123')
      expect(result.success).toBe(false)
    })

    it('应该拒绝没有数字的密码', () => {
      const result = iam.user.validatePassword('PasswordABC')
      expect(result.success).toBe(false)
    })
  })

  describe('getCurrentUser', () => {
    it('应该获取当前用户', async () => {
      await iam.user.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123',
      })

      const loginResult = await iam.auth.login({
        identifier: 'testuser',
        password: 'Password123',
      })

      if (!loginResult.success) {
        throw new Error('登录失败')
      }

      const userResult = await iam.user.getCurrentUser(loginResult.data.accessToken)

      expect(userResult.success).toBe(true)
      if (userResult.success) {
        expect(userResult.data.username).toBe('testuser')
        expect(userResult.data.email).toBe('test@example.com')
      }
    }, SLOW_TIMEOUT)
  })

  describe('changePassword', () => {
    it('应该修改密码', async () => {
      const registerResult = await iam.user.register({
        username: 'testuser',
        password: 'Password123',
      })

      if (!registerResult.success) {
        throw new Error('注册失败')
      }

      const changeResult = await iam.user.changePassword(
        registerResult.data.user.id,
        'Password123',
        'NewPassword456',
      )

      expect(changeResult.success).toBe(true)

      // 使用新密码登录
      const loginResult = await iam.auth.login({
        identifier: 'testuser',
        password: 'NewPassword456',
      })

      expect(loginResult.success).toBe(true)
    }, SLOW_TIMEOUT)

    it('应该拒绝错误的原密码', async () => {
      const registerResult = await iam.user.register({
        username: 'testuser',
        password: 'Password123',
      })

      if (!registerResult.success) {
        throw new Error('注册失败')
      }

      const changeResult = await iam.user.changePassword(
        registerResult.data.user.id,
        'WrongPassword',
        'NewPassword456',
      )

      expect(changeResult.success).toBe(false)
    }, SLOW_TIMEOUT)

    it('应该拒绝弱新密码', async () => {
      const registerResult = await iam.user.register({
        username: 'testuser',
        password: 'Password123',
      })

      if (!registerResult.success) {
        throw new Error('注册失败')
      }

      const changeResult = await iam.user.changePassword(
        registerResult.data.user.id,
        'Password123',
        'weak',
      )

      expect(changeResult.success).toBe(false)
    }, SLOW_TIMEOUT)
  })

  describe('getUser', () => {
    it('应该获取用户信息', async () => {
      const registerResult = await iam.user.register({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123',
      })

      if (!registerResult.success) {
        throw new Error('注册失败')
      }

      const userResult = await iam.user.getUser(registerResult.data.user.id)

      expect(userResult.success).toBe(true)
      if (userResult.success && userResult.data) {
        expect(userResult.data.username).toBe('testuser')
        expect(userResult.data.email).toBe('test@example.com')
      }
    }, SLOW_TIMEOUT)

    it('应该返回 null 对于不存在的用户', async () => {
      const userResult = await iam.user.getUser('non-existent-id')

      expect(userResult.success).toBe(true)
      if (userResult.success) {
        expect(userResult.data).toBeNull()
      }
    })
  })

  describe('updateUser', () => {
    it('应该更新用户信息', async () => {
      const registerResult = await iam.user.register({
        username: 'testuser',
        password: 'Password123',
      })

      if (!registerResult.success) {
        throw new Error('注册失败')
      }

      const updateResult = await iam.user.updateUser(registerResult.data.user.id, {
        displayName: '测试用户',
      })

      expect(updateResult.success).toBe(true)
      if (updateResult.success) {
        expect(updateResult.data.displayName).toBe('测试用户')
      }
    }, SLOW_TIMEOUT)
  })
})
