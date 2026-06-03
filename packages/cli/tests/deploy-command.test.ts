/**
 * =============================================================================
 * @h-ai/cli - deploy 命令测试
 * =============================================================================
 *
 * 验证 hai deploy 在失败/异常路径中也会关闭 deploy 模块，避免进程内状态泄漏。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deployCommand } from '../src/commands/cli-deploy.js'

const mocks = vi.hoisted(() => ({
  loadCredentials: vi.fn(),
  init: vi.fn(),
  scan: vi.fn(),
  deployApp: vi.fn(),
  close: vi.fn(),
}))

vi.mock('@h-ai/deploy', () => ({
  deploy: {
    credentials: { load: mocks.loadCredentials },
    init: mocks.init,
    scan: mocks.scan,
    deployApp: mocks.deployApp,
    close: mocks.close,
  },
}))

let tmpRoot: string

function createDeployApp(): string {
  const appDir = join(tmpRoot, 'app')
  mkdirSync(join(appDir, 'config'), { recursive: true })
  writeFileSync(
    join(appDir, 'config', '_deploy.yml'),
    'provider:\n  type: vercel\n  token: test-token\n',
    'utf-8',
  )
  return appDir
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'hai-cli-deploy-'))
  vi.clearAllMocks()
  mocks.loadCredentials.mockReturnValue({ success: true, data: [] })
  mocks.scan.mockResolvedValue({
    success: true,
    data: {
      appName: 'app',
      isSvelteKit: true,
      adapterInstalled: true,
      requiredServices: [],
      buildCommand: 'pnpm build',
    },
  })
  mocks.init.mockResolvedValue({ success: true, data: undefined })
  mocks.close.mockResolvedValue(undefined)
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('deployCommand', () => {
  it('deploy 成功时应透传参数并关闭 deploy 模块', async () => {
    const appDir = createDeployApp()
    mocks.deployApp.mockResolvedValue({
      success: true,
      data: {
        url: 'https://example.test',
        deploymentId: 'dep_123',
        envVarsSet: ['HAI_ENV'],
      },
    })

    await deployCommand({
      appDir,
      cwd: tmpRoot,
      projectName: 'my-api',
      skipProvision: true,
      skipBuild: true,
      verbose: false,
    })

    expect(mocks.deployApp).toHaveBeenCalledWith(appDir, {
      projectName: 'my-api',
      skipProvision: true,
      skipBuild: true,
    })
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('deployApp 返回失败时应关闭 deploy 模块', async () => {
    const appDir = createDeployApp()
    mocks.deployApp.mockResolvedValue({
      success: false,
      error: { code: 'hai:deploy:001', message: 'deploy failed' },
    })

    await deployCommand({ appDir, cwd: tmpRoot, verbose: false })

    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('deployApp 抛出异常时也应关闭 deploy 模块', async () => {
    const appDir = createDeployApp()
    mocks.deployApp.mockRejectedValue(new Error('unexpected deploy error'))

    await expect(deployCommand({ appDir, cwd: tmpRoot, verbose: false })).rejects.toThrow('unexpected deploy error')

    expect(mocks.close).toHaveBeenCalledTimes(1)
  })
})
