/**
 * =============================================================================
 * @hai/iam - IAM Client 测试
 * =============================================================================
 */

import { describe, expect, it, vi } from 'vitest'
import { createIamClient } from '../src/client/iam-client.js'

describe('iamClient', () => {
  /**
   * 创建模拟 fetch
   */
  function createMockFetch(responses: Map<string, { status: number, body: unknown }>) {
    return vi.fn(async (url: string, options?: RequestInit) => {
      const path = url.replace('/api/iam', '')
      const key = `${options?.method || 'GET'}:${path.split('?')[0]}`
      const response = responses.get(key)

      if (!response) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ code: 'NOT_FOUND', message: '未找到' }),
        } as Response
      }

      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        json: async () => response.body,
      } as Response
    })
  }

  describe('login', () => {
    it('应该成功登录', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/auth/login', {
          status: 200,
          body: {
            user: {
              id: 'user-1',
              username: 'testuser',
              email: 'test@example.com',
              enabled: true,
              emailVerified: false,
              phoneVerified: false,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt: '2024-01-01T01:00:00.000Z',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.login({
        identifier: 'testuser',
        password: 'Password123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.username).toBe('testuser')
        expect(result.data.accessToken).toBe('access-token')
        expect(result.data.expiresAt).toBeInstanceOf(Date)
      }

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/iam/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            identifier: 'testuser',
            password: 'Password123',
          }),
        }),
      )
    })

    it('应该处理登录失败', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/auth/login', {
          status: 401,
          body: {
            code: 'INVALID_CREDENTIALS',
            message: '用户名或密码错误',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.login({
        identifier: 'testuser',
        password: 'wrong-password',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CREDENTIALS')
        expect(result.error.status).toBe(401)
      }
    })

    it('应该在登录成功后调用 onTokenRefresh', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/auth/login', {
          status: 200,
          body: {
            user: {
              id: 'user-1',
              username: 'testuser',
              enabled: true,
              emailVerified: false,
              phoneVerified: false,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt: '2024-01-01T01:00:00.000Z',
          },
        }],
      ]))

      const onTokenRefresh = vi.fn()

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        onTokenRefresh,
      })

      await client.login({
        identifier: 'testuser',
        password: 'Password123',
      })

      expect(onTokenRefresh).toHaveBeenCalledWith({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: expect.any(Date),
      })
    })
  })

  describe('logout', () => {
    it('应该成功登出', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/auth/logout', { status: 200, body: null }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        getAccessToken: () => 'access-token',
      })

      const result = await client.logout()

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/iam/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer access-token',
          }),
        }),
      )
    })
  })

  describe('refreshToken', () => {
    it('应该成功刷新令牌', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/auth/refresh', {
          status: 200,
          body: {
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
          },
        }],
      ]))

      const onTokenRefresh = vi.fn()

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        onTokenRefresh,
      })

      const result = await client.refreshToken('old-refresh-token')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.accessToken).toBe('new-access-token')
      }
      expect(onTokenRefresh).toHaveBeenCalledWith({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      })
    })
  })

  describe('register', () => {
    it('应该成功注册用户', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/user/register', {
          status: 200,
          body: {
            user: {
              id: 'user-1',
              username: 'newuser',
              email: 'new@example.com',
              enabled: true,
              emailVerified: false,
              phoneVerified: false,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.register({
        username: 'newuser',
        email: 'new@example.com',
        password: 'Password123',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.username).toBe('newuser')
        expect(result.data.user.createdAt).toBeInstanceOf(Date)
      }
    })

    it('应该处理用户名重复错误', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/user/register', {
          status: 409,
          body: {
            code: 'USER_EXISTS',
            message: '用户名已存在',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.register({
        username: 'existing',
        password: 'Password123',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('USER_EXISTS')
      }
    })
  })

  describe('getCurrentUser', () => {
    it('应该获取当前用户', async () => {
      const mockFetch = createMockFetch(new Map([
        ['GET:/user/me', {
          status: 200,
          body: {
            id: 'user-1',
            username: 'testuser',
            email: 'test@example.com',
            displayName: '测试用户',
            enabled: true,
            emailVerified: true,
            phoneVerified: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        getAccessToken: () => 'access-token',
      })

      const result = await client.getCurrentUser()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.username).toBe('testuser')
        expect(result.data.displayName).toBe('测试用户')
      }
    })

    it('应该在未认证时返回错误', async () => {
      const mockFetch = createMockFetch(new Map([
        ['GET:/user/me', {
          status: 401,
          body: {
            code: 'UNAUTHORIZED',
            message: '未认证',
          },
        }],
      ]))

      const onAuthError = vi.fn()

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        onAuthError,
      })

      const result = await client.getCurrentUser()

      expect(result.success).toBe(false)
      expect(onAuthError).toHaveBeenCalledWith({
        code: 'UNAUTHORIZED',
        message: '未认证',
        status: 401,
      })
    })
  })

  describe('updateUser', () => {
    it('应该更新用户信息', async () => {
      const mockFetch = createMockFetch(new Map([
        ['PUT:/user/me', {
          status: 200,
          body: {
            id: 'user-1',
            username: 'testuser',
            displayName: '新名称',
            avatarUrl: 'https://example.com/avatar.png',
            enabled: true,
            emailVerified: false,
            phoneVerified: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-02T00:00:00.000Z',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        getAccessToken: () => 'access-token',
      })

      const result = await client.updateUser({
        displayName: '新名称',
        avatarUrl: 'https://example.com/avatar.png',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.displayName).toBe('新名称')
      }
    })
  })

  describe('changePassword', () => {
    it('应该成功修改密码', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/user/password', { status: 200, body: null }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        getAccessToken: () => 'access-token',
      })

      const result = await client.changePassword({
        oldPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
      })

      expect(result.success).toBe(true)
    })

    it('应该处理原密码错误', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/user/password', {
          status: 400,
          body: {
            code: 'INVALID_PASSWORD',
            message: '原密码错误',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        getAccessToken: () => 'access-token',
      })

      const result = await client.changePassword({
        oldPassword: 'wrong-password',
        newPassword: 'NewPassword123',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PASSWORD')
      }
    })
  })

  describe('validatePassword', () => {
    it('应该验证密码强度', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/user/validate-password', { status: 200, body: null }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.validatePassword('StrongPassword123')

      expect(result.success).toBe(true)
    })

    it('应该拒绝弱密码', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/user/validate-password', {
          status: 400,
          body: {
            code: 'WEAK_PASSWORD',
            message: '密码必须包含大写字母',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.validatePassword('weak')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('WEAK_PASSWORD')
      }
    })
  })

  describe('sendOtp', () => {
    it('应该发送验证码', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/auth/otp/send', {
          status: 200,
          body: {
            expiresAt: '2024-01-01T00:05:00.000Z',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.sendOtp('test@example.com')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.expiresAt).toBeInstanceOf(Date)
      }
    })
  })

  describe('loginWithOtp', () => {
    it('应该使用验证码登录', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/auth/login/otp', {
          status: 200,
          body: {
            user: {
              id: 'user-1',
              username: 'test@example.com',
              email: 'test@example.com',
              enabled: true,
              emailVerified: true,
              phoneVerified: false,
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
            accessToken: 'access-token',
            expiresAt: '2024-01-01T01:00:00.000Z',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.loginWithOtp({
        identifier: 'test@example.com',
        code: '123456',
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.user.email).toBe('test@example.com')
      }
    })
  })

  describe('getOAuthUrl', () => {
    it('应该获取 OAuth 授权 URL', async () => {
      const mockFetch = createMockFetch(new Map([
        ['GET:/auth/oauth/url', {
          status: 200,
          body: {
            url: 'https://github.com/login/oauth/authorize?client_id=xxx&state=yyy',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.getOAuthUrl('github')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.url).toContain('github.com')
      }
    })
  })

  describe('网络错误处理', () => {
    it('应该处理网络错误', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
      })

      const result = await client.login({
        identifier: 'test',
        password: 'test',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NETWORK_ERROR')
        expect(result.error.message).toBe('Network error')
      }
    })
  })

  describe('认证头', () => {
    it('应该自动附加认证头', async () => {
      const mockFetch = createMockFetch(new Map([
        ['GET:/user/me', {
          status: 200,
          body: {
            id: 'user-1',
            username: 'testuser',
            enabled: true,
            emailVerified: false,
            phoneVerified: false,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        getAccessToken: () => 'my-token',
      })

      await client.getCurrentUser()

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/iam/user/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        }),
      )
    })

    it('应该在没有 token 时不附加认证头', async () => {
      const mockFetch = createMockFetch(new Map([
        ['POST:/auth/login', {
          status: 200,
          body: {
            user: { id: '1', username: 'test', enabled: true, emailVerified: false, phoneVerified: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            accessToken: 'token',
            expiresAt: new Date().toISOString(),
          },
        }],
      ]))

      const client = createIamClient({
        baseUrl: '/api/iam',
        fetch: mockFetch,
        getAccessToken: () => null,
      })

      await client.login({ identifier: 'test', password: 'test' })

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/iam/auth/login',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.anything(),
          }),
        }),
      )
    })
  })
})
