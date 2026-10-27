/**
 * =============================================================================
 * @h-ai/deploy - 主模块测试
 * =============================================================================
 *
 * 通过 mock 验证 deploy 单例的 init / close / provisionAll / deployApp 流程。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

    it('应无需远程连接即可初始化 docker-ssh Provider', async () => {
      const result = await deploy.init({
        provider: {
          type: 'docker-ssh',
          ssh: { host: '10.0.0.10', username: 'deploy' },
          expose: { type: 'port', hostPort: 18080 },
        },
      })

      expect(result.success).toBe(true)
      expect(deploy.isInitialized).toBe(true)
      expect(deploy.config?.provider.type).toBe('docker-ssh')
      // 未发起任何网络请求（容器 Provider 在部署时才连接远程）
      expect(mockFetch).not.toHaveBeenCalled()

      await deploy.close()
      expect(deploy.isInitialized).toBe(false)
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

    it('应返回 AUTH_FAILED 当已配置的 provisioner 认证失败时', async () => {
      // Vercel authenticate succeeds
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ user: { username: 'u', email: 'e' } }),
      )
      // Neon authenticate fails
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: 'Unauthorized' }, 401),
      )

      const result = await deploy.init({
        provider: { type: 'vercel', token: 'vel_t' },
        services: {
          db: { provisioner: 'neon', apiKey: 'bad_neon' },
        },
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.AUTH_FAILED.code)
      }
      expect(deploy.isInitialized).toBe(false)
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

      // provision: Neon list existing -> create
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ projects: [] }))
      mockFetch.mockResolvedValueOnce(mockJsonResponse({
        connection_uris: [{ connection_uri: 'postgres://u:p@h/d' }],
        project: { id: 'prj_1' },
      }))

      const result = await deploy.provisionAll('my-app')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].serviceType).toBe('db')
        expect(JSON.parse(result.data[0].envVars.HAI_DB).url).toBe('postgres://u:p@h/d')
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
    it('拒绝旧 projectName 覆盖参数，提示以根包名维护身份', async () => {
      expect(await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } })).toMatchObject({ success: true })
      const legacyOptions = { environment: 'test', bundleOnly: true, projectName: 'legacy-override' }
      expect(await deploy.deployApp('/not-read-before-option-validation', legacyOptions)).toMatchObject({ success: false, error: { code: HaiDeployError.CONFIG_ERROR.code, message: expect.stringContaining('projectName') } })
    })

    it('平台 Provider 同样使用工程名，并去除 npm scope', async () => {
      const root = mkdtempSync(join(tmpdir(), 'hai-deploy-platform-name-'))
      try {
        const service = join(root, 'packages/orders-serv')
        mkdirSync(join(service, '.vercel/output'), { recursive: true })
        writeFileSync(join(root, 'package.json'), '{"name":"@example/orders"}')
        writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\nimporters:\n  .: {}\n  packages/orders-serv: {}\n')
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ user: { username: 'testuser' } }))
        expect(await deploy.init({ provider: { type: 'vercel', token: 'test-token' } })).toMatchObject({ success: true })
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 'project-id' }))
        mockFetch.mockResolvedValueOnce(mockJsonResponse({}))
        // 不提供构建配置，确认解析项目后在制品校验处结束，不向平台发布。
        const result = await deploy.deployApp(service, { skipMiddleware: true })
        expect(result).toMatchObject({ success: false, error: { code: HaiDeployError.UPLOAD_FAILED.code } })
        expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith('/v10/projects/orders'))).toBe(true)
      }
      finally { rmSync(root, { recursive: true, force: true }) }
    })

    it('未初始化时应返回 NOT_INITIALIZED', async () => {
      const result = await deploy.deployApp('/some/app')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe(HaiDeployError.NOT_INITIALIZED.code)
      }
    })
  })
})
