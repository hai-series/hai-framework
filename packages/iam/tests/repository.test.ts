/**
 * =============================================================================
 * @hai/iam - Repository 模块测试
 * =============================================================================
 */

import type { CacheService } from '@hai/cache'
import type { DbService } from '@hai/db'
import { ok } from '@hai/core'
import { db } from '@hai/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createCachePermissionCache,
  createDbOAuthStateStore,
  createDbOtpStore,
  createDbPermissionRepository,
  createDbRoleRepository,
  createDbSessionRepository,
  createDbUserRepository,
} from '../src/repository/index.js'

describe('repository', () => {
  let testDb: DbService

  beforeEach(async () => {
    const result = await db.init({ type: 'sqlite', database: ':memory:' })
    if (!result.success) {
      throw new Error(`初始化测试数据库失败: ${result.error.message}`)
    }
    testDb = db
  })

  afterEach(async () => {
    await db.close()
  })

  describe('userRepository', () => {
    it('应该创建用户', async () => {
      const repo = await createDbUserRepository(testDb)

      const result = await repo.create({
        username: 'testuser',
        email: 'test@example.com',
        enabled: true,
        emailVerified: false,
        phoneVerified: false,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.username).toBe('testuser')
        expect(result.data.email).toBe('test@example.com')
        expect(result.data.id).toBeTruthy()
      }
    })

    it('应该按 ID 查找用户', async () => {
      const repo = await createDbUserRepository(testDb)

      const createResult = await repo.create({
        username: 'testuser',
        enabled: true,
        emailVerified: false,
        phoneVerified: false,
      })

      if (!createResult.success) {
        throw new Error('创建用户失败')
      }

      const findResult = await repo.findById(createResult.data.id)

      expect(findResult.success).toBe(true)
      if (findResult.success && findResult.data) {
        expect(findResult.data.username).toBe('testuser')
      }
    })

    it('应该按用户名查找用户', async () => {
      const repo = await createDbUserRepository(testDb)

      await repo.create({
        username: 'testuser',
        enabled: true,
        emailVerified: false,
        phoneVerified: false,
      })

      const findResult = await repo.findByUsername('testuser')

      expect(findResult.success).toBe(true)
      if (findResult.success && findResult.data) {
        expect(findResult.data.username).toBe('testuser')
      }
    })

    it('应该按邮箱查找用户', async () => {
      const repo = await createDbUserRepository(testDb)

      await repo.create({
        username: 'testuser',
        email: 'test@example.com',
        enabled: true,
        emailVerified: false,
        phoneVerified: false,
      })

      const findResult = await repo.findByEmail('test@example.com')

      expect(findResult.success).toBe(true)
      if (findResult.success && findResult.data) {
        expect(findResult.data.email).toBe('test@example.com')
      }
    })

    it('应该更新用户', async () => {
      const repo = await createDbUserRepository(testDb)

      const createResult = await repo.create({
        username: 'testuser',
        enabled: true,
        emailVerified: false,
        phoneVerified: false,
      })

      if (!createResult.success) {
        throw new Error('创建用户失败')
      }

      const updateResult = await repo.update(createResult.data.id, {
        displayName: '测试用户',
      })

      expect(updateResult.success).toBe(true)
      if (updateResult.success) {
        expect(updateResult.data.displayName).toBe('测试用户')
      }
    })

    it('应该删除用户', async () => {
      const repo = await createDbUserRepository(testDb)

      const createResult = await repo.create({
        username: 'testuser',
        enabled: true,
        emailVerified: false,
        phoneVerified: false,
      })

      if (!createResult.success) {
        throw new Error('创建用户失败')
      }

      const deleteResult = await repo.delete(createResult.data.id)
      expect(deleteResult.success).toBe(true)

      const findResult = await repo.findById(createResult.data.id)
      expect(findResult.success).toBe(true)
      if (findResult.success) {
        expect(findResult.data).toBeNull()
      }
    })
  })

  describe('roleRepository', () => {
    it('应该创建角色', async () => {
      const repo = await createDbRoleRepository(testDb)

      const result = await repo.create({
        code: 'admin',
        name: '管理员',
        description: '系统管理员',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.code).toBe('admin')
        expect(result.data.name).toBe('管理员')
      }
    })

    it('应该按代码查找角色', async () => {
      const repo = await createDbRoleRepository(testDb)

      await repo.create({
        code: 'admin',
        name: '管理员',
      })

      const findResult = await repo.findByCode('admin')

      expect(findResult.success).toBe(true)
      if (findResult.success && findResult.data) {
        expect(findResult.data.name).toBe('管理员')
      }
    })

    it('应该获取所有角色', async () => {
      const repo = await createDbRoleRepository(testDb)

      await repo.create({ code: 'admin', name: '管理员' })
      await repo.create({ code: 'user', name: '普通用户' })

      const result = await repo.findAll()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.length).toBe(2)
      }
    })
  })

  describe('permissionRepository', () => {
    it('应该创建权限', async () => {
      const repo = await createDbPermissionRepository(testDb)

      const result = await repo.create({
        code: 'users:read',
        name: '读取用户',
        description: '查看用户列表',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.code).toBe('users:read')
        expect(result.data.name).toBe('读取用户')
      }
    })

    it('应该按代码查找权限', async () => {
      const repo = await createDbPermissionRepository(testDb)

      await repo.create({
        code: 'users:read',
        name: '读取用户',
      })

      const findResult = await repo.findByCode('users:read')

      expect(findResult.success).toBe(true)
      if (findResult.success && findResult.data) {
        expect(findResult.data.name).toBe('读取用户')
      }
    })
  })

  describe('otpStore', () => {
    it('应该存储和获取 OTP', async () => {
      const store = await createDbOtpStore(testDb)

      const setResult = await store.set('test@example.com', '123456', 300)
      expect(setResult.success).toBe(true)

      const getResult = await store.get('test@example.com')
      expect(getResult.success).toBe(true)
      if (getResult.success && getResult.data) {
        expect(getResult.data.code).toBe('123456')
        expect(getResult.data.attempts).toBe(0)
      }
    })

    it('应该增加尝试次数', async () => {
      const store = await createDbOtpStore(testDb)

      await store.set('test@example.com', '123456', 300)
      await store.incrementAttempts('test@example.com')

      const getResult = await store.get('test@example.com')
      expect(getResult.success).toBe(true)
      if (getResult.success && getResult.data) {
        expect(getResult.data.attempts).toBe(1)
      }
    })

    it('应该删除 OTP', async () => {
      const store = await createDbOtpStore(testDb)

      await store.set('test@example.com', '123456', 300)
      await store.delete('test@example.com')

      const getResult = await store.get('test@example.com')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data).toBeNull()
      }
    })
  })

  describe('oAuthStateStore', () => {
    it('应该存储和获取 OAuth 状态', async () => {
      const store = await createDbOAuthStateStore(testDb)

      const state = {
        state: 'random-state',
        codeVerifier: 'code-verifier',
        returnUrl: 'https://example.com/callback',
        expiresAt: new Date(Date.now() + 300000),
      }

      const setResult = await store.set('random-state', state)
      expect(setResult.success).toBe(true)

      const getResult = await store.get('random-state')
      expect(getResult.success).toBe(true)
      if (getResult.success && getResult.data) {
        expect(getResult.data.state).toBe('random-state')
        expect(getResult.data.codeVerifier).toBe('code-verifier')
      }
    })
  })

  describe('sessionRepository', () => {
    it('应该创建会话', async () => {
      const repo = await createDbSessionRepository(testDb)

      const result = await repo.create({
        userId: 'user-1',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.userId).toBe('user-1')
        expect(result.data.accessToken).toBe('access-token')
      }
    })

    it('应该按 accessToken 查找会话', async () => {
      const repo = await createDbSessionRepository(testDb)

      await repo.create({
        userId: 'user-1',
        accessToken: 'access-token',
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      })

      const findResult = await repo.findByAccessToken('access-token')

      expect(findResult.success).toBe(true)
      if (findResult.success && findResult.data) {
        expect(findResult.data.userId).toBe('user-1')
      }
    })
  })

  describe('permissionCache', () => {
    /**
     * 创建内存 Cache Mock
     */
    function createMockCacheService(): CacheService {
      const store = new Map<string, { value: unknown, expiresAt?: number }>()

      return {
        isConnected: true,
        async get<T>(key: string) {
          const entry = store.get(key)
          if (!entry) {
            return ok(undefined as T | undefined)
          }
          // 检查过期
          if (entry.expiresAt && Date.now() > entry.expiresAt) {
            store.delete(key)
            return ok(undefined as T | undefined)
          }
          return ok(entry.value as T)
        },
        async set(key: string, value: unknown, options?: { ex?: number }) {
          const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : undefined
          store.set(key, { value, expiresAt })
          return ok(undefined)
        },
        async del(key: string) {
          store.delete(key)
          return ok(1)
        },
        async exists(key: string) {
          return ok(store.has(key) ? 1 : 0)
        },
        async expire(key: string, seconds: number) {
          const entry = store.get(key)
          if (entry) {
            entry.expiresAt = Date.now() + seconds * 1000
            return ok(true)
          }
          return ok(false)
        },
        async ttl(key: string) {
          const entry = store.get(key)
          if (!entry || !entry.expiresAt) {
            return ok(-1)
          }
          return ok(Math.ceil((entry.expiresAt - Date.now()) / 1000))
        },
        async keys(_pattern: string) {
          return ok([...store.keys()])
        },
        async flushdb() {
          store.clear()
          return ok(undefined)
        },
        async ping() {
          return ok('PONG')
        },
        async close() {
          return ok(undefined)
        },
      }
    }

    it('应该存储和获取权限缓存', async () => {
      const mockCache = createMockCacheService()
      const cache = createCachePermissionCache(mockCache)

      const permissions = [
        {
          id: 'perm-1',
          code: 'users:read',
          name: '读取用户',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const setResult = await cache.setUserPermissions('user-1', permissions, 3600)
      expect(setResult.success).toBe(true)

      const getResult = await cache.getUserPermissions('user-1')
      expect(getResult.success).toBe(true)
      if (getResult.success && getResult.data) {
        expect(getResult.data.length).toBe(1)
        expect(getResult.data[0].code).toBe('users:read')
      }
    })

    it('应该清除权限缓存', async () => {
      const mockCache = createMockCacheService()
      const cache = createCachePermissionCache(mockCache)

      const permissions = [
        {
          id: 'perm-1',
          code: 'users:read',
          name: '读取用户',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await cache.setUserPermissions('user-1', permissions, 3600)
      await cache.clearUserPermissions('user-1')

      const getResult = await cache.getUserPermissions('user-1')
      expect(getResult.success).toBe(true)
      if (getResult.success) {
        expect(getResult.data).toBeNull()
      }
    })

    it('应该在缓存过期后返回 null', async () => {
      const mockCache = createMockCacheService()
      const cache = createCachePermissionCache(mockCache)

      const permissions = [
        {
          id: 'perm-1',
          code: 'users:read',
          name: '读取用户',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      // 设置 1 秒过期
      await cache.setUserPermissions('user-1', permissions, 1)

      // 立即获取应该存在
      const getResult1 = await cache.getUserPermissions('user-1')
      expect(getResult1.success).toBe(true)
      if (getResult1.success) {
        expect(getResult1.data).not.toBeNull()
      }

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 1100))

      // 过期后应该返回 null
      const getResult2 = await cache.getUserPermissions('user-1')
      expect(getResult2.success).toBe(true)
      if (getResult2.success) {
        expect(getResult2.data).toBeNull()
      }
    })
  })
})
