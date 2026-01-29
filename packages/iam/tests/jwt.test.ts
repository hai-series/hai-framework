/**
 * =============================================================================
 * @hai/auth - JWT 令牌测试
 * =============================================================================
 */

import type { JWTManager } from '../src/jwt.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { createJWTManager } from '../src/jwt.js'

describe('jWTManager', () => {
  let manager: JWTManager

  const defaultConfig = {
    enabled: true,
    secret: 'test-secret-key-at-least-32-characters-long',
    algorithm: 'HS256' as const,
    accessTokenExpiry: 900, // 15 分钟
    refreshTokenExpiry: 604800, // 7 天
    issuer: 'hai-admin',
    audience: 'hai-admin-users',
  }

  beforeEach(() => {
    manager = createJWTManager(defaultConfig)
  })

  describe('generateAccessToken', () => {
    it('应该生成访问令牌', async () => {
      const result = await manager.generateAccessToken({
        sub: 'user-1',
        username: 'testuser',
        roles: ['admin'],
        permissions: ['read', 'write'],
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBeDefined()
        expect(typeof result.value).toBe('string')
        expect(result.value.split('.').length).toBe(3) // JWT 格式
      }
    })
  })

  describe('generateRefreshToken', () => {
    it('应该生成刷新令牌', async () => {
      const result = await manager.generateRefreshToken({
        sub: 'user-1',
        sessionId: 'session-1',
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBeDefined()
        expect(typeof result.value).toBe('string')
        expect(result.value.split('.').length).toBe(3)
      }
    })
  })

  describe('generateTokenPair', () => {
    it('应该生成令牌对', async () => {
      const result = await manager.generateTokenPair('user-1', 'session-1', {
        username: 'testuser',
        roles: ['admin'],
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.accessToken).toBeDefined()
        expect(result.value.refreshToken).toBeDefined()
        expect(result.value.accessTokenExpiresAt).toBeDefined()
        expect(result.value.refreshTokenExpiresAt).toBeDefined()

        // 刷新令牌过期时间应该更长
        expect(result.value.refreshTokenExpiresAt).toBeGreaterThan(
          result.value.accessTokenExpiresAt,
        )
      }
    })
  })

  describe('verifyAccessToken', () => {
    it('应该验证有效的访问令牌', async () => {
      // 生成令牌
      const generateResult = await manager.generateAccessToken({
        sub: 'user-1',
        username: 'testuser',
        roles: ['admin'],
      })

      expect(generateResult.ok).toBe(true)
      if (!generateResult.ok)
        return

      // 验证令牌
      const verifyResult = await manager.verifyAccessToken(generateResult.value)

      expect(verifyResult.ok).toBe(true)
      if (verifyResult.ok) {
        expect(verifyResult.value.sub).toBe('user-1')
        expect(verifyResult.value.username).toBe('testuser')
        expect(verifyResult.value.roles).toEqual(['admin'])
        expect(verifyResult.value.type).toBe('access')
      }
    })

    it('应该拒绝无效令牌', async () => {
      const result = await manager.verifyAccessToken('invalid-token')

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('TOKEN_VERIFICATION_FAILED')
      }
    })

    it('应该拒绝刷新令牌', async () => {
      // 生成刷新令牌
      const generateResult = await manager.generateRefreshToken({
        sub: 'user-1',
        sessionId: 'session-1',
      })

      expect(generateResult.ok).toBe(true)
      if (!generateResult.ok)
        return

      // 使用访问令牌验证方法验证刷新令牌应该失败
      const verifyResult = await manager.verifyAccessToken(generateResult.value)

      expect(verifyResult.ok).toBe(false)
      if (!verifyResult.ok) {
        expect(verifyResult.error.type).toBe('TOKEN_INVALID')
      }
    })
  })

  describe('verifyRefreshToken', () => {
    it('应该验证有效的刷新令牌', async () => {
      // 生成令牌
      const generateResult = await manager.generateRefreshToken({
        sub: 'user-1',
        sessionId: 'session-1',
      })

      expect(generateResult.ok).toBe(true)
      if (!generateResult.ok)
        return

      // 验证令牌
      const verifyResult = await manager.verifyRefreshToken(generateResult.value)

      expect(verifyResult.ok).toBe(true)
      if (verifyResult.ok) {
        expect(verifyResult.value.sub).toBe('user-1')
        expect(verifyResult.value.sessionId).toBe('session-1')
        expect(verifyResult.value.type).toBe('refresh')
      }
    })

    it('应该拒绝访问令牌', async () => {
      // 生成访问令牌
      const generateResult = await manager.generateAccessToken({
        sub: 'user-1',
      })

      expect(generateResult.ok).toBe(true)
      if (!generateResult.ok)
        return

      // 使用刷新令牌验证方法验证访问令牌应该失败
      const verifyResult = await manager.verifyRefreshToken(generateResult.value)

      expect(verifyResult.ok).toBe(false)
      if (!verifyResult.ok) {
        expect(verifyResult.error.type).toBe('TOKEN_INVALID')
      }
    })
  })

  describe('refreshAccessToken', () => {
    it('应该使用刷新令牌获取新的访问令牌', async () => {
      // 生成令牌对
      const tokenPairResult = await manager.generateTokenPair('user-1', 'session-1', {
        username: 'testuser',
        roles: ['admin'],
      })

      expect(tokenPairResult.ok).toBe(true)
      if (!tokenPairResult.ok)
        return

      // 刷新访问令牌
      const refreshResult = await manager.refreshAccessToken(
        tokenPairResult.value.refreshToken,
        {
          username: 'testuser',
          roles: ['admin'],
        },
      )

      expect(refreshResult.ok).toBe(true)
      if (refreshResult.ok) {
        expect(refreshResult.value.accessToken).toBeDefined()
        expect(refreshResult.value.expiresAt).toBeDefined()

        // 新令牌应该可以验证
        const verifyResult = await manager.verifyAccessToken(
          refreshResult.value.accessToken,
        )
        expect(verifyResult.ok).toBe(true)
      }
    })

    it('应该拒绝无效的刷新令牌', async () => {
      const result = await manager.refreshAccessToken('invalid-token')

      expect(result.ok).toBe(false)
    })
  })

  describe('token expiration', () => {
    it('应该在令牌过期后拒绝', async () => {
      // 创建一个过期时间极短的管理器
      const shortLivedManager = createJWTManager({
        ...defaultConfig,
        accessTokenExpiry: 0, // 立即过期
      })

      // 生成令牌
      const generateResult = await shortLivedManager.generateAccessToken({
        sub: 'user-1',
      })

      expect(generateResult.ok).toBe(true)
      if (!generateResult.ok)
        return

      // 等待一小段时间确保过期
      await new Promise(resolve => setTimeout(resolve, 1100))

      // 验证应该失败
      const verifyResult = await shortLivedManager.verifyAccessToken(
        generateResult.value,
      )

      expect(verifyResult.ok).toBe(false)
      if (!verifyResult.ok) {
        expect(verifyResult.error.type).toBe('TOKEN_EXPIRED')
      }
    })
  })
})

describe('jWTManager with different algorithms', () => {
  it('应该支持 HS384 算法', async () => {
    const manager = createJWTManager({
      enabled: true,
      secret: 'test-secret-key-at-least-32-characters-long',
      algorithm: 'HS384',
      accessTokenExpiry: 900,
      refreshTokenExpiry: 604800,
      issuer: 'hai-admin',
      audience: 'hai-admin-users',
    })

    const generateResult = await manager.generateAccessToken({
      sub: 'user-1',
    })

    expect(generateResult.ok).toBe(true)
    if (!generateResult.ok)
      return

    const verifyResult = await manager.verifyAccessToken(generateResult.value)
    expect(verifyResult.ok).toBe(true)
  })

  it('应该支持 HS512 算法', async () => {
    const manager = createJWTManager({
      enabled: true,
      secret: 'test-secret-key-at-least-32-characters-long',
      algorithm: 'HS512',
      accessTokenExpiry: 900,
      refreshTokenExpiry: 604800,
      issuer: 'hai-admin',
      audience: 'hai-admin-users',
    })

    const generateResult = await manager.generateAccessToken({
      sub: 'user-1',
    })

    expect(generateResult.ok).toBe(true)
    if (!generateResult.ok)
      return

    const verifyResult = await manager.verifyAccessToken(generateResult.value)
    expect(verifyResult.ok).toBe(true)
  })
})
