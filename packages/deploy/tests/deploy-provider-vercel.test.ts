/**
 * =============================================================================
 * @h-ai/deploy - Vercel Provider 测试
 * =============================================================================
 */

import { once } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HaiDeployError } from '../src/deploy-types.js'
import { createVercelProvider } from '../src/providers/deploy-provider-vercel.js'

// mock fetch
const nativeFetch = globalThis.fetch
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
    it.each(['authenticate', 'upload'] as const)('应拒绝%s重定向而不将请求转发至另一个入口', async (operation) => {
      let redirected = 0
      let outputDir: string | undefined
      const server = createServer((request, response) => {
        if (request.url === '/redirected') {
          redirected++
          response.end(JSON.stringify({
            user: { username: 'unexpected' },
          }))
          return
        }
        response.writeHead(302, {
          Location: '/redirected',
        }).end()
      })
      try {
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const address = server.address()
        if (!address || typeof address === 'string')
          throw new Error('Expected a loopback fixture address')
        const provider = createVercelProvider()
        if (operation === 'upload') {
          mockFetch.mockResolvedValueOnce(mockJsonResponse({
            user: { username: 'fixture-user' },
          }))
          expect((await provider.authenticate('fixture-token')).success).toBe(true)
          outputDir = mkdtempSync(join(tmpdir(), 'hai-vercel-redirect-'))
          writeFileSync(join(outputDir, 'config.json'), '{"version":3}')
        }
        mockFetch.mockImplementationOnce((_url, options) => nativeFetch(`http://127.0.0.1:${address.port}/start`, options))
        const result = outputDir
          ? await provider.deploy('fixture-project', outputDir)
          : await provider.authenticate('fixture-token')
        expect(result.success).toBe(false)
        expect(redirected).toBe(0)
      }
      finally {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => server.close(error => error
          ? reject(error)
          : resolve()))
        if (outputDir)
          rmSync(outputDir, { recursive: true, force: true })
      }
    })

    it.each(['headers', 'body'] as const)('请求在%s阶段停滞时应在总期限内失败', async (stage) => {
      const nativeTimeout = AbortSignal.timeout
      const deadlines: number[] = []
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
        deadlines.push(milliseconds)
        return nativeTimeout(5)
      })
      try {
        mockFetch.mockImplementationOnce((_url, options: RequestInit) => {
          const signal = options.signal
          if (!signal)
            throw new Error('Expected an explicit request deadline')
          if (stage === 'headers') {
            return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
          }
          return Promise.resolve(new Response(new ReadableStream({
            start(controller) {
              signal.addEventListener('abort', () => controller.error(signal.reason), { once: true })
            },
          })))
        })
        const completed = await createVercelProvider().authenticate('fixture-token')
        expect(completed.success).toBe(false)
        expect(deadlines).toEqual([30000])
        if (!completed.success)
          expect(completed.error.code).toBe(HaiDeployError.AUTH_FAILED.code)
      }
      finally {
        timeoutSpy.mockRestore()
      }
    })

    it('should authenticate with valid token', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          user: { username: 'testuser', email: 'test@example.com' },
        }),
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
        mockJsonResponse({
          user: { username: 'testuser', email: 'test@example.com' },
        }),
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
        mockJsonResponse({
          user: { username: 'testuser', email: 'test@example.com' },
        }),
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
        mockJsonResponse({
          user: { username: 'testuser', email: 'test@example.com' },
        }),
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
        mockJsonResponse({
          user: { username: 'testuser', email: 'test@example.com' },
        }),
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
        mockJsonResponse({
          user: { username: 'testuser', email: 'test@example.com' },
        }),
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
    it('文件上传停滞时应在请求期限内失败', async () => {
      const outputDir = mkdtempSync(join(tmpdir(), 'hai-vercel-upload-timeout-'))
      const nativeTimeout = AbortSignal.timeout
      try {
        writeFileSync(join(outputDir, 'config.json'), '{"version":3}')
        mockFetch.mockResolvedValueOnce(mockJsonResponse({
          user: { username: 'fixture-user' },
        }))
        const provider = createVercelProvider()
        expect((await provider.authenticate('fixture-token')).success).toBe(true)
        const deadlines: number[] = []
        vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
          deadlines.push(milliseconds)
          return nativeTimeout(5)
        })
        mockFetch.mockImplementationOnce((_url, options: RequestInit) => {
          const signal = options.signal
          if (!signal)
            throw new Error('Expected an explicit upload deadline')
          return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
        })
        const result = await provider.deploy('fixture-project', outputDir)
        expect(result.success).toBe(false)
        expect(deadlines).toEqual([30000])
        if (!result.success)
          expect(result.error.code).toBe(HaiDeployError.UPLOAD_FAILED.code)
      }
      finally {
        vi.restoreAllMocks()
        rmSync(outputDir, { recursive: true, force: true })
      }
    })

    it('should upload exact file bytes and use POSIX file paths', async () => {
      const outputDir = mkdtempSync(join(tmpdir(), 'hai-vercel-output-'))
      try {
        mkdirSync(join(outputDir, 'nested'), { recursive: true })
        writeFileSync(join(outputDir, 'nested', 'file.txt'), 'hello vercel', 'utf-8')
        writeFileSync(join(outputDir, 'config.json'), '{"version":3}')

        // authenticate
        mockFetch.mockResolvedValueOnce(
          mockJsonResponse({
            user: { username: 'testuser', email: 'test@example.com' },
          }),
        )
        const provider = createVercelProvider()
        await provider.authenticate('vel_valid')

        // 上传 config 与文件，创建 prebuilt 部署，再轮询状态。
        mockFetch.mockResolvedValueOnce(mockJsonResponse({}))
        mockFetch.mockResolvedValueOnce(mockJsonResponse({}))
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'dpl_123', url: 'my-app.vercel.app' }))
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ readyState: 'READY' }))

        const result = await provider.deploy('prj_123', outputDir)

        expect(result.success).toBe(true)
        const uploadOptions = mockFetch.mock.calls[2][1] as RequestInit
        const uploadBody = uploadOptions.body as Blob
        expect((await uploadBody.text())).toBe('hello vercel')

        const deployOptions = mockFetch.mock.calls[3][1] as RequestInit
        const deployBody = JSON.parse(deployOptions.body as string) as { files: Array<{ file: string }> }
        expect(deployBody.files.map(file => file.file)).toEqual(['.vercel/output/config.json', '.vercel/output/nested/file.txt'])
        expect(String(mockFetch.mock.calls[3][0])).toContain('?prebuilt=1')
        expect(deployBody).toMatchObject({
          version: 2,
          projectSettings: { framework: null, buildCommand: '', installCommand: '' },
        })
      }
      finally {
        rmSync(outputDir, { recursive: true, force: true })
      }
    })
  })
})
