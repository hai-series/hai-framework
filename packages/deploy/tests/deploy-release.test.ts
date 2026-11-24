import type { DeployReleaseTarget, DeployReleaseVerification } from '../src/index.js'
import { execFileSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deploy } from '../src/index.js'

const { exec, upload, probe } = vi.hoisted(() => ({
  exec: vi.fn(),
  upload: vi.fn(),
  probe: vi.fn(),
}))
vi.mock('node:https', async load => ({
  ...await load<typeof import('node:https')>(),
  request: probe,
}))
vi.mock('../src/container/deploy-ssh.js', async (load) => {
  const actual = await load<typeof import('../src/container/deploy-ssh.js')>()
  return {
    ...actual,
    createSshExecutor: () => ({ exec, upload }),
  }
})

const deploymentId = '20261122-101010-a1b2c3'
const priorId = '20261121-101010-d4e5f6'
const imageId = 'e'.repeat(64)
const reference = 'localhost/hai-shop-web:20261122-101010-a1b2c3-0.1.0'
let sandbox: string
let target: DeployReleaseTarget
let healthStatus: number
let onHealth: (() => void) | undefined

function commandOutput(stdout = '') {
  return core.ok({
    code: 0,
    stdout,
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
  })
}

async function archive(name: string, member: unknown, members = '.') {
  const source = await mkdtemp(join(sandbox, 'tar-'))
  const path = join(sandbox, name)
  await writeFile(join(source, 'manifest.json'), JSON.stringify(member))
  execFileSync('tar', ['-cf', path, '-C', source, members])
  return path
}

async function frozen(): Promise<DeployReleaseVerification> {
  const archivePath = await archive('web-0.1.0.tar', [
    {
      Config: `blobs/sha256/${imageId}`,
      RepoTags: [reference],
    },
  ], 'manifest.json')
  return {
    target,
    release: {
      deploymentId,
      images: [
        {
          role: 'web',
          archiveSha256: await deploy.artifactChecksum(archivePath),
          reference,
          archivePath,
        },
      ],
    },
    healthUrl: 'https://shop.example.test/health',
  }
}

function observed(options?: { attempt?: string, current?: string, running?: string, recovery?: string, exitCode?: number }) {
  exec.mockImplementation(async (command: string) => {
    const receipt = JSON.stringify({
      deploymentId: options?.attempt ?? deploymentId,
      stage: options?.exitCode ? 'configuration' : 'complete',
      exitCode: options?.exitCode ?? 0,
      recoveryStatus: options?.recovery ?? 'not-needed',
      durationSeconds: 1,
    })
    const container = command.includes('container inspect')
      ? `sha256:${options?.running ?? imageId} true\n`
      : ''
    return commandOutput(`${receipt}\n${options?.current ?? deploymentId}\n${container}`)
  })
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(await realpath(tmpdir()), 'hai-release-'))
  target = {
    projectName: 'shop-prod',
    provider: {
      type: 'docker-ssh',
      ssh: {
        host: 'deploy.example.test',
        port: 22,
        username: 'deploy',
        auth: 'key',
        strictHostKeyChecking: true,
        identityFile: join(sandbox, 'key'),
        knownHostsFile: join(sandbox, 'known-hosts'),
        connectTimeoutSeconds: 10,
      },
      remote: { baseDir: '/opt/hai/apps', runtime: 'podman' },
      expose: {
        type: 'port',
        hostPort: 8080,
        containerPort: 3000,
        https: {
          type: 'files',
          domain: 'shop.example.test',
          port: 443,
          redirectHttp: true,
          certificateFile: 'cert',
          privateKeyFile: 'key',
        },
      },
    },
  }
  exec.mockReset().mockResolvedValue(commandOutput())
  upload.mockReset().mockResolvedValue(core.ok(undefined))
  healthStatus = 200
  onHealth = undefined
  probe.mockClear()
  probe.mockImplementation((_url: URL, _options: object, response: (event: { statusCode: number, destroy: () => void }) => void) => ({
    on: vi.fn(),
    end() {
      onHealth?.()
      response({
        statusCode: healthStatus,
        destroy: vi.fn(),
      })
    },
  }))
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

describe('分阶段可核验部署', () => {
  it('仅在部署包身份、目标和摘要都匹配后执行固定的启动脚本', async () => {
    const bundlePath = await archive('release.tar', {
      bundleFormat: 2,
      deploymentId,
      deploymentTarget: {
        projectName: 'shop-prod',
        directory: '/opt/hai/apps/shop-prod',
        runtime: 'podman',
        dockerMode: 'default',
        host: 'deploy.example.test',
        port: 22,
        username: 'deploy',
      },
    })
    const bundleSha256 = await deploy.artifactChecksum(bundlePath)
    const input = {
      target,
      deploymentId,
      bundlePath,
      bundleSha256,
    }
    expect(await deploy.executeBundle({ ...input, deploymentId: priorId })).toMatchObject({ success: false })
    expect(await deploy.executeBundle({
      ...input,
      bundleSha256: '0'.repeat(64),
    })).toMatchObject({ success: false })
    expect(await deploy.executeBundle({
      ...input,
      target: { ...target, projectName: 'other-prod' },
    })).toMatchObject({ success: false })
    expect(exec).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(await deploy.executeBundle(input)).toEqual(core.ok({ deploymentId }))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(exec.mock.calls[1]?.[0]).toContain('sha256sum --check --status')
    expect(exec.mock.calls[1]?.[0]).toContain('apply.sh')
    expect(exec.mock.calls[1]?.[1]).toMatchObject({ discardOutput: true })
  })

  it('独立对照归档镜像身份、当前发布与同一健康端点，期间不执行上传', async () => {
    observed()
    const input = await frozen()
    const result = await deploy.verifyDeployment(input)
    expect(result).toMatchObject({
      success: true,
      data: {
        status: 'succeeded',
        deploymentId,
        proof: {
          deploymentId,
          runtime: 'podman',
          images: [
            { role: 'web', reference, imageId },
          ],
        },
      },
    })
    expect(exec).toHaveBeenCalledTimes(3)
    expect(exec.mock.calls[0]?.[0]).toContain('flock -sn 9')
    expect(probe).toHaveBeenCalledWith(new URL(input.healthUrl), expect.objectContaining({ agent: false }), expect.any(Function))
    expect(upload).not.toHaveBeenCalled()
  })

  it('只确认前一发布的归档镜像已恢复，不为本轮失败记录成功', async () => {
    const input = await frozen()
    observed({ current: priorId, exitCode: 1, recovery: 'passed' })
    expect(await deploy.verifyDeployment({
      ...input,
      previous: { ...input.release, deploymentId: priorId },
    })).toMatchObject({
      success: true,
      data: {
        status: 'restored',
        deploymentId,
        receipt: { stage: 'configuration', exitCode: 1 },
        proof: { deploymentId: priorId },
      },
    })
  })

  it('首次发布已明确失败且没有服务运行时返回 failed', async () => {
    observed({ current: '', exitCode: 1, recovery: 'stopped' })
    expect(await deploy.verifyDeployment(await frozen())).toMatchObject({
      success: true,
      data: { status: 'failed', deploymentId },
    })
    expect(probe).not.toHaveBeenCalled()
  })

  it.each([
    'wrong-id',
    'wrong-container',
    'bad-hash',
    'redirect',
    'changed-current',
  ] as const)('证据不足 %s 时保留待核验', async (defect) => {
    observed(defect === 'wrong-id'
      ? { attempt: priorId }
      : defect === 'wrong-container'
        ? {
            running: 'f'.repeat(64),
          }
        : undefined)
    const input = await frozen()
    if (defect === 'bad-hash')
      await writeFile(input.release.images[0]!.archivePath, 'modified')
    if (defect === 'redirect')
      healthStatus = 302
    if (defect === 'changed-current') {
      onHealth = () => observed({ current: priorId })
    }
    expect(await deploy.verifyDeployment(input)).toEqual(core.ok({ status: 'pending_verify', deploymentId }))
    expect(upload).not.toHaveBeenCalled()
  })
})
