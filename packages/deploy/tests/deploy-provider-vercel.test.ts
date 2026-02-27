/**
 * =============================================================================
 * @h-ai/deploy - Vercel Provider 测试
 * =============================================================================
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVercelProvider } from '../src/providers/deploy-provider-vercel.js'

// mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response
}

beforeEach(() => {
  mockFetch.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createVercelProvider', () => {
  it('should create provider with name "vercel"', () => {
    const provider = createVercelProvider()
    expect(provider.name).toBe('vercel')
  })

  describe('authenticate', () => {
    it('should authenticate with valid token', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'testuser', email: 'test@example.com' } }),
      )

      const provider = createVercelProvider()
      const result = await provider.authenticate('vel_valid')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('testuser')
      }
    })

    it('should fail with invalid token', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'Unauthorized' }, 401),
      )

      const provider = createVercelProvider()
      const result = await provider.authenticate('vel_invalid')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(9005) // AUTH_FAILED
      }
    })
  })

  describe('createProject', () => {
    it('should return AUTH_REQUIRED when not authenticated', async () => {
      const provider = createVercelProvider()
      const result = await provider.createProject('my-app')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(9004) // AUTH_REQUIRED
      }
    })

    it('should find existing project', async () => {
      // authenticate
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'testuser', email: 'test@example.com' } }),
      )
      const provider = createVercelProvider()
      await provider.authenticate('vel_valid')

      // find existing project
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ id: 'prj_existing123' }),
      )

      const result = await provider.createProject('my-app')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('prj_existing123')
      }
    })

    it('should create new project when not found', async () => {
      // authenticate
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'testuser', email: 'test@example.com' } }),
      )
      const provider = createVercelProvider()
      await provider.authenticate('vel_valid')

      // project not found
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'Not Found' }, 404),
      )
      // create project
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ id: 'prj_new456' }),
      )

      const result = await provider.createProject('my-app')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('prj_new456')
      }
    })
  })

  describe('setEnvVars', () => {
    it('should return AUTH_REQUIRED when not authenticated', async () => {
      const provider = createVercelProvider()
      const result = await provider.setEnvVars('prj_123', { KEY: 'value' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(9004)
      }
    })

    it('should set env vars on project', async () => {
      // authenticate
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'testuser', email: 'test@example.com' } }),
      )
      const provider = createVercelProvider()
      await provider.authenticate('vel_valid')

      // set env vars
      mockFetch.mockResolvedValueOnce(mockJsonResponse({}))

      const result = await provider.setEnvVars('prj_123', {
        DB_URL: 'postgres://...',
        CACHE_URL: 'redis://...',
      })

      expect(result.success).toBe(true)
    })
  })
})
