/**
 * =============================================================================
 * @h-ai/deploy - Vercel Provider 测试
 * =============================================================================
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiDeployError } from '../src/deploy-types.js'
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
        expect(result.error.code).toBe(HaiDeployError.AUTH_FAILED.code)
      }
    })
  })

  describe('createProject', () => {
    it('should return AUTH_REQUIRED when not authenticated', async () => {
      const provider = createVercelProvider()
      const result = await provider.createProject('my-app')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.AUTH_REQUIRED.code)
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

    it('should reuse project when create returns conflict', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'testuser', email: 'test@example.com' } }),
      )
      const provider = createVercelProvider()
      await provider.authenticate('vel_valid')

      // first lookup says not found
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'Not Found' }, 404),
      )
      // create hits duplicate-name conflict
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'Conflict' }, 409),
      )
      // re-lookup finds the concurrent project
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ id: 'prj_conflict789' }),
      )

      const result = await provider.createProject('my-app')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('prj_conflict789')
      }
    })

    it('should not create project when lookup fails with non-404 error', async () => {
      // authenticate
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'testuser', email: 'test@example.com' } }),
      )
      const provider = createVercelProvider()
      await provider.authenticate('vel_valid')

      // lookup fails with server error
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'Server Error' }, 500),
      )

      const result = await provider.createProject('my-app')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.PROJECT_CREATE_FAILED.code)
      }
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('setEnvVars', () => {
    it('should return AUTH_REQUIRED when not authenticated', async () => {
      const provider = createVercelProvider()
      const result = await provider.setEnvVars('prj_123', { KEY: 'value' })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.AUTH_REQUIRED.code)
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
      expect(String(mockFetch.mock.calls[1][0])).toContain('/v10/projects/prj_123/env?upsert=true')
    })
  })

  describe('deploy', () => {
    it('should upload exact file bytes and use POSIX file paths', async () => {
      const outputDir = mkdtempSync(join(tmpdir(), 'hai-vercel-output-'))
      try {
        mkdirSync(join(outputDir, 'nested'), { recursive: true })
        writeFileSync(join(outputDir, 'nested', 'file.txt'), 'hello vercel', 'utf-8')

        // authenticate
        mockFetch.mockResolvedValueOnce(
          mockJsonResponse({ user: { username: 'testuser', email: 'test@example.com' } }),
        )
        const provider = createVercelProvider()
        await provider.authenticate('vel_valid')

        // upload file, create deployment, poll status
        mockFetch.mockResolvedValueOnce(mockJsonResponse({}))
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'dpl_123', url: 'my-app.vercel.app' }))
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ readyState: 'READY' }))

        const result = await provider.deploy('prj_123', outputDir)

        expect(result.success).toBe(true)
        const uploadOptions = mockFetch.mock.calls[1][1] as RequestInit
        const uploadBody = uploadOptions.body as Blob
        expect((await uploadBody.text())).toBe('hello vercel')

        const deployOptions = mockFetch.mock.calls[2][1] as RequestInit
        const deployBody = JSON.parse(deployOptions.body as string) as { files: Array<{ file: string }> }
        expect(deployBody.files[0]?.file).toBe('nested/file.txt')
      }
      finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    })
  })
})
