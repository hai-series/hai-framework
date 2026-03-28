/**
 * =============================================================================
 * @h-ai/deploy - 主模块测试
 * =============================================================================
 *
 * 通过 mock 验证 deploy 单例的 init / close / provisionAll / deployApp 流程。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deploy } from '../src/deploy-main.js'
import { HaiDeployError } from '../src/deploy-types.js'

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

afterEach(async () => {
  await deploy.close()
  vi.restoreAllMocks()
})

describe('deploy singleton', () => {
  describe('init', () => {
    it('应返回 CONFIG_ERROR 当配置不合法时', async () => {
      const result = await deploy.init({
        provider: { type: 'vercel' as const, token: '' },
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.CONFIG_ERROR.code)
      }
    })

    it('应使用 camelCase 凭证完成 Provider + Provisioner 初始化', async () => {
      // Vercel authenticate
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'testuser', email: 'test@example.com' } }),
      )
      // Neon authenticate
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      // Upstash authenticate
      mockFetch.mockResolvedValueOnce(mockJsonResponse([]))

      const result = await deploy.init({
        provider: { type: 'vercel', token: 'vel_test' },
        services: {
          db: { provisioner: 'neon', apiKey: 'neon_key' },
          cache: { provisioner: 'upstash', email: 'a@b.com', apiKey: 'up_key' },
        },
      })

      expect(result.success).toBe(true)
      expect(deploy.isInitialized).toBe(true)
      expect(deploy.config).not.toBeNull()
    })

    it('应返回 AUTH_FAILED 当 provider 认证失败时', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'Unauthorized' }, 401),
      )

      const result = await deploy.init({
        provider: { type: 'vercel', token: 'vel_invalid' },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.AUTH_FAILED.code)
      }
    })
  })

  describe('close', () => {
    it('关闭后 isInitialized 应为 false', async () => {
      // 初始化
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'u', email: 'e' } }),
      )
      await deploy.init({ provider: { type: 'vercel', token: 'vel_t' } })
      expect(deploy.isInitialized).toBe(true)

      await deploy.close()
      expect(deploy.isInitialized).toBe(false)
      expect(deploy.config).toBeNull()
    })

    it('重复关闭不应抛错', async () => {
      await deploy.close()
      await deploy.close()
    })
  })

  describe('provisionAll', () => {
    it('未初始化时应返回 NOT_INITIALIZED', async () => {
      const result = await deploy.provisionAll('app')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.NOT_INITIALIZED.code)
      }
    })

    it('初始化后应成功开通所有服务', async () => {
      // init: Vercel auth + Neon auth
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'u', email: 'e' } }),
      )
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      await deploy.init({
        provider: { type: 'vercel', token: 'vel_t' },
        services: {
          db: { provisioner: 'neon', apiKey: 'neon_k' },
        },
      })

      // provision: Neon create
      mockFetch.mockResolvedValueOnce(mockJsonResponse({
        connection_uris: [{ connection_uri: 'postgres://u:p@h/d' }],
        project: { id: 'prj_1' },
      }))

      const result = await deploy.provisionAll('my-app')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].serviceType).toBe('db')
        expect(result.data[0].envVars.HAI_RELDB_URL).toBe('postgres://u:p@h/d')
      }
    })
  })

  describe('scan', () => {
    it('scan 不需要初始化即可使用', async () => {
      // scan 使用的是文件系统，传入一个不存在的目录应返回 SCAN_FAILED
      const result = await deploy.scan('/nonexistent/path')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.SCAN_FAILED.code)
      }
    })
  })

  describe('deployApp', () => {
    it('未初始化时应返回 NOT_INITIALIZED', async () => {
      const result = await deploy.deployApp('/some/app')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.NOT_INITIALIZED.code)
      }
    })
  })
})
