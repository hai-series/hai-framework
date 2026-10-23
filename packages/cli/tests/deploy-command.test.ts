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
import { core } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deployCommand } from '../src/commands/cli-deploy.js'

const mocks = vi.hoisted(() => ({
  loadCredentials: vi.fn(),
  init: vi.fn(),
  scan: vi.fn(),
  deployApp: vi.fn(),
  close: vi.fn(),
  writeMessage: vi.fn(),
}))

vi.mock('../src/cli-utils.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/cli-utils.js')>(),
  writeCliMessage: mocks.writeMessage,
}))

vi.mock('@h-ai/deploy', async importOriginal => ({
  ...await importOriginal<typeof import('@h-ai/deploy')>(),
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
  writeFileSync(join(appDir, '.env.prod'), 'HAI_CORE_ENV=production\n')
  return appDir
}

beforeEach(() => {
  core.i18n.setGlobalLocale('en-US')
  tmpRoot = mkdtempSync(join(tmpdir(), 'hai-cli-deploy-'))
  writeFileSync(join(tmpRoot, '.env.prod'), 'HAI_CORE_ENV=production\n')
  vi.clearAllMocks()
  mocks.loadCredentials.mockReturnValue({ success: true, data: [] })
  mocks.scan.mockResolvedValue({
    success: true,
    data: {
      appName: 'app',
      isSvelteKit: true,
      adapterInstalled: true,
      requiredServices: [],
    },
  })
  mocks.init.mockResolvedValue({ success: true, data: undefined })
  mocks.close.mockResolvedValue(undefined)
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('deployCommand', () => {
  it.each(['en-US', 'zh-CN'])('未知或已结束的远端状态与本地终止结论分别展示 (%s)', async (locale) => {
    core.i18n.setGlobalLocale(locale)
    for (const remoteExecution of ['unknown', 'finished']) {
      mocks.deployApp.mockResolvedValue({ success: false, error: { message: 'command interrupted', ext: { commandExecution: { reason: 'timeout', localTermination: 'confirmed', remoteExecution, deploymentId: 'deployment-1', resultFile: '/srv/app/result-deployment-1.json' } } } })
      await expect(deployCommand({ env: 'prod', yes: true, appDir: createDeployApp(), cwd: tmpRoot, verbose: false })).rejects.toThrow('command interrupted')
    }
    const text = mocks.writeMessage.mock.calls.map(([message]) => String(message)).join('\n')
    expect(text).toContain('/srv/app/result-deployment-1.json')
    expect(text).toContain(locale === 'en-US' ? 'Local command tree: confirmed exited' : '本地命令进程树：已确认全部退出')
    expect(text).toContain(locale === 'en-US' ? 'Remote deployment execution: unknown' : '远端部署执行状态：未知')
    expect(text).toContain(locale === 'en-US' ? 'script and recovery finished' : '脚本与恢复已结束')
  })
  it.each([
    ['en-US', 'Deploy failed: network unavailable'],
    ['zh-CN', '部署失败：network unavailable'],
  ])('localizes deployment failures in %s', async (locale, message) => {
    core.i18n.setGlobalLocale(locale)
    mocks.deployApp.mockResolvedValue({ success: false, error: { message: 'network unavailable' } })
    await expect(deployCommand({ env: 'prod', yes: true, appDir: createDeployApp(), cwd: tmpRoot, verbose: false })).rejects.toThrow(message)
    expect(mocks.close).toHaveBeenCalledOnce()
  })
  it.each(['credentials', 'scan', 'init'])('propagates failure from %s to the CLI entry', async (stage) => {
    const appDir = createDeployApp()
    const failed = { success: false, error: { code: 'test', message: 'stage rejected' } }
    if (stage === 'credentials')
      mocks.loadCredentials.mockReturnValue(failed)
    if (stage === 'scan')
      mocks.scan.mockResolvedValue(failed)
    if (stage === 'init')
      mocks.init.mockResolvedValue(failed)
    await expect(deployCommand({ env: 'prod', yes: true, appDir, cwd: tmpRoot, verbose: false })).rejects.toThrow('stage rejected')
    expect(mocks.deployApp).not.toHaveBeenCalled()
  })

  it('rejects missing configuration', async () => {
    await expect(deployCommand({ env: 'prod', yes: true, cwd: tmpRoot, verbose: false })).rejects.toThrow('Deploy config not found')
  })

  it.each(['en-US', 'zh-CN'])('deploy 成功时应透传参数并关闭 deploy 模块 (%s)', async (locale) => {
    core.i18n.setGlobalLocale(locale)
    const appDir = createDeployApp()
    mocks.deployApp.mockResolvedValue({
      success: true,
      data: {
        url: 'https://example.test',
        deploymentId: 'dep_123',
        envVarsSet: ['HAI_ENV'],
      },
    })

    await deployCommand({ env: 'prod', yes: true, appDir, cwd: tmpRoot, projectName: 'my-api', skipMiddleware: true, verbose: false })

    expect(mocks.deployApp).toHaveBeenCalledWith(appDir, expect.objectContaining({
      projectName: 'my-api',
      skipMiddleware: true,
      environment: 'prod',
      envDir: appDir,
      serviceModes: {},
    }))
    expect(mocks.close).toHaveBeenCalledTimes(1)
    const output = mocks.writeMessage.mock.calls.map(([message]) => message).join('\n')
    expect(output).toContain('dep_123')
    expect(output).not.toContain('HAI_')
  })

  it('deployApp 返回失败时应关闭 deploy 模块', async () => {
    const appDir = createDeployApp()
    mocks.deployApp.mockResolvedValue({
      success: false,
      error: { code: 'hai:deploy:001', message: 'deploy failed' },
    })

    await expect(deployCommand({ env: 'prod', yes: true, appDir, cwd: tmpRoot, verbose: false })).rejects.toThrow('Deploy failed')

    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('shows packaged bundle instructions once without an environment variable summary', async () => {
    const appDir = createDeployApp()
    const bundlePath = join(tmpRoot, '.hai/deploy/prod/bundle-1.0.0.tar')
    mocks.deployApp.mockResolvedValue({
      success: true,
      data: {
        deploymentId: 'dep_packaged',
        status: 'packaged',
        bundlePath,
        instructions: `Deployment bundle: ${bundlePath}\nRun deploy.ps1 or deploy.sh.`,
        envVarsSet: ['HAI_ADMIN_DEFAULT_PASSWORD', 'NODE_ENV', 'PORT'],
      },
    })

    await deployCommand({ env: 'prod', yes: true, appDir, cwd: tmpRoot, skipMiddleware: true, verbose: false })

    const output = mocks.writeMessage.mock.calls.map(([message]) => message).join('\n')
    expect(output.split(bundlePath)).toHaveLength(2)
    expect(output).toContain('deploy.ps1')
    expect(output).not.toMatch(/HAI_ADMIN_DEFAULT_PASSWORD|NODE_ENV|PORT/)
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('deployApp 抛出异常时也应关闭 deploy 模块', async () => {
    const appDir = createDeployApp()
    mocks.deployApp.mockRejectedValue(new Error('unexpected deploy error'))

    await expect(deployCommand({ env: 'prod', yes: true, appDir, cwd: tmpRoot, verbose: false })).rejects.toThrow('unexpected deploy error')

    expect(mocks.close).toHaveBeenCalledTimes(1)
  })
})
