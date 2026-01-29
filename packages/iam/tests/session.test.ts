/**
 * =============================================================================
 * @hai/auth - 会话管理测试
 * =============================================================================
 */

import type { SessionData } from '../src/session.js'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createSessionManager,
  MemorySessionStore,

} from '../src/session.js'

describe('sessionManager', () => {
  let store: MemorySessionStore
  let manager: ReturnType<typeof createSessionManager>

  const defaultConfig = {
    name: 'session',
    maxAge: 3600, // 1 小时
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
  }

  beforeEach(() => {
    store = new MemorySessionStore()
    manager = createSessionManager(store, defaultConfig)
  })

  describe('createSession', () => {
    it('应该创建新会话', async () => {
      const result = await manager.createSession({
        userId: 'user-1',
        userAgent: 'Test Browser',
        ipAddress: '127.0.0.1',
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.userId).toBe('user-1')
        expect(result.value.token).toBeDefined()
        expect(result.value.tokenHash).toBeDefined()
        expect(result.value.userAgent).toBe('Test Browser')
        expect(result.value.ipAddress).toBe('127.0.0.1')
        expect(result.value.createdAt).toBeInstanceOf(Date)
        expect(result.value.expiresAt).toBeInstanceOf(Date)
      }
    })

    it('应该使用自定义过期时间', async () => {
      const result = await manager.createSession({
        userId: 'user-1',
        maxAge: 7200, // 2 小时
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        const expectedExpiry = result.value.createdAt.getTime() + 7200 * 1000
        expect(result.value.expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3)
      }
    })
  })

  describe('validateSession', () => {
    it('应该验证有效会话', async () => {
      // 创建会话
      const createResult = await manager.createSession({
        userId: 'user-1',
      })

      expect(createResult.ok).toBe(true)
      if (!createResult.ok)
        return

      const token = createResult.value.token!

      // 验证会话
      const validateResult = await manager.validateSession(token)

      expect(validateResult.ok).toBe(true)
      if (validateResult.ok) {
        expect(validateResult.value.userId).toBe('user-1')
      }
    })

    it('应该拒绝无效令牌', async () => {
      const result = await manager.validateSession('invalid-token')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SESSION_NOT_FOUND')
      }
    })

    it('应该拒绝过期会话', async () => {
      // 创建一个已过期的会话（使用极短的过期时间）
      const shortLivedManager = createSessionManager(store, {
        ...defaultConfig,
        maxAge: 0, // 立即过期
      })

      const createResult = await shortLivedManager.createSession({
        userId: 'user-1',
      })

      expect(createResult.ok).toBe(true)
      if (!createResult.ok)
        return

      const token = createResult.value.token!

      // 等待一小段时间确保过期
      await new Promise(resolve => setTimeout(resolve, 10))

      const validateResult = await manager.validateSession(token)

      expect(validateResult.ok).toBe(false)
      if (!validateResult.ok) {
        expect(validateResult.error.type).toBe('SESSION_EXPIRED')
      }
    })
  })

  describe('refreshSession', () => {
    it('应该刷新会话过期时间', async () => {
      // 创建会话
      const createResult = await manager.createSession({
        userId: 'user-1',
      })

      expect(createResult.ok).toBe(true)
      if (!createResult.ok)
        return

      const originalExpiresAt = createResult.value.expiresAt

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 100))

      // 刷新会话
      const refreshResult = await manager.refreshSession(createResult.value.id)

      expect(refreshResult.ok).toBe(true)
      if (refreshResult.ok) {
        expect(refreshResult.value.expiresAt.getTime()).toBeGreaterThan(
          originalExpiresAt.getTime(),
        )
      }
    })

    it('应该返回错误如果会话不存在', async () => {
      const result = await manager.refreshSession('non-existent-id')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('SESSION_NOT_FOUND')
      }
    })
  })

  describe('destroySession', () => {
    it('应该销毁会话', async () => {
      // 创建会话
      const createResult = await manager.createSession({
        userId: 'user-1',
      })

      expect(createResult.ok).toBe(true)
      if (!createResult.ok)
        return

      const token = createResult.value.token!

      // 销毁会话
      const destroyResult = await manager.destroySession(createResult.value.id)
      expect(destroyResult.ok).toBe(true)

      // 验证会话应该失败
      const validateResult = await manager.validateSession(token)
      expect(validateResult.ok).toBe(false)
    })
  })

  describe('destroyUserSessions', () => {
    it('应该销毁用户的所有会话', async () => {
      // 创建多个会话
      await manager.createSession({ userId: 'user-1' })
      await manager.createSession({ userId: 'user-1' })
      await manager.createSession({ userId: 'user-2' })

      // 销毁 user-1 的所有会话
      const result = await manager.destroyUserSessions('user-1')

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(2)
      }
    })
  })

  describe('cleanupExpiredSessions', () => {
    it('应该清理过期会话', async () => {
      // 创建一个已过期的会话
      const shortLivedManager = createSessionManager(store, {
        ...defaultConfig,
        maxAge: 0,
      })

      await shortLivedManager.createSession({ userId: 'user-1' })

      // 等待一小段时间确保过期
      await new Promise(resolve => setTimeout(resolve, 10))

      // 清理过期会话
      const result = await manager.cleanupExpiredSessions()

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBeGreaterThanOrEqual(1)
      }
    })
  })

  describe('getCookieOptions', () => {
    it('应该返回正确的 Cookie 配置', () => {
      const options = manager.getCookieOptions()

      expect(options).toEqual({
        name: 'session',
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 3600,
      })
    })
  })
})

describe('memorySessionStore', () => {
  let store: MemorySessionStore

  beforeEach(() => {
    store = new MemorySessionStore()
  })

  it('应该存储和检索会话', async () => {
    const sessionData: Omit<SessionData, 'token'> = {
      id: 'session-1',
      userId: 'user-1',
      tokenHash: 'hash-1',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000),
    }

    await store.create(sessionData)
    const result = await store.get('session-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value?.id).toBe('session-1')
      expect(result.value?.userId).toBe('user-1')
    }
  })

  it('应该通过令牌哈希检索会话', async () => {
    const sessionData: Omit<SessionData, 'token'> = {
      id: 'session-1',
      userId: 'user-1',
      tokenHash: 'unique-hash',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + 3600 * 1000),
    }

    await store.create(sessionData)
    const result = await store.getByTokenHash('unique-hash')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value?.id).toBe('session-1')
    }
  })
})
