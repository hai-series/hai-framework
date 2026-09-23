/**
 * =============================================================================
 * @h-ai/cli - docker-ssh 部署端到端测试
 * =============================================================================
 *
 * 完整链路：启动带 sshd + node + podman 的容器（优先 podman）→ 用 CLI 生成项目 →
 * 通过 @h-ai/deploy 的 docker-ssh Provider 将其容器化并部署进该容器 → 访问页面。
 *
 * 该测试较重且依赖容器运行时，默认跳过；设置环境变量 HAI_DEPLOY_E2E=1 且本机具备
 * podman 或 docker 时才执行：
 *
 *   HAI_DEPLOY_E2E=1 pnpm --filter @h-ai/cli test deploy-docker-ssh
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { deploy } from '@h-ai/deploy'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createProject } from '../src/commands/cli-create.js'

/** 探测可用容器运行时（优先 podman，用 `version` 确认引擎可达）。 */
function detectRuntime(): 'podman' | 'docker' | null {
  for (const runtime of ['podman', 'docker'] as const) {
    try {
      execFileSync(runtime, ['version'], { stdio: 'ignore' })
      return runtime
    }
    catch {
      // 尝试下一个
    }
  }
  return null
}

const runtime = detectRuntime()
const enabled = process.env.HAI_DEPLOY_E2E === '1' && runtime !== null

// 受限网络可选加速：HAI_DEPLOY_E2E_MIRROR 指向 docker.io 镜像（如 docker.m.daocloud.io）；
// HAI_DEPLOY_E2E_APT_MIRROR 替换 Debian 源主机（如 mirrors.ustc.edu.cn）。
const REGISTRY_MIRROR = process.env.HAI_DEPLOY_E2E_MIRROR
const APT_MIRROR = process.env.HAI_DEPLOY_E2E_APT_MIRROR
const NPM_MIRROR = process.env.HAI_DEPLOY_E2E_NPM_MIRROR

// 固定资源命名，便于失败后手动清理
const FIXTURE_NAME = 'hai-deploy-e2e-sshd'
const FIXTURE_IMAGE = 'hai-deploy-e2e-fixture:latest'
const SSH_PORT = 2222
const HOST_PORT = 18080
// 生成应用 Dockerfile 依赖的基础镜像（受限网络下按镜像预拉取）
const BASE_IMAGES = ['python:3.11-slim', 'node:22-bookworm-slim']

// 夹具：Debian + sshd + podman + podman-compose（嵌套 podman 运行远程 compose）；
// nftables/iptables 供 netavark 网络；cgroupfs 与 --cgroupns=host 配合使嵌套 podman 可建 pod。
const APT_SOURCES_FIX = APT_MIRROR
  ? `sed -i 's#deb.debian.org#${APT_MIRROR}#g' /etc/apt/sources.list.d/debian.sources && `
  : ''
const CONTAINERFILE = `FROM python:3.11-slim
RUN ${APT_SOURCES_FIX}apt-get -o Acquire::Retries=10 update \\
  && apt-get -o Acquire::Retries=10 install -y --no-install-recommends openssh-server podman podman-compose uidmap fuse-overlayfs nftables iptables \\
  && rm -rf /var/lib/apt/lists/* && ssh-keygen -A && mkdir -p /root/.ssh && chmod 700 /root/.ssh
RUN mkdir -p /etc/containers && printf '[engine]\\ncgroup_manager = "cgroupfs"\\nevents_logger = "file"\\n' > /etc/containers/containers.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
`

const ENTRYPOINT = `#!/bin/sh
set -e
if [ -n "$AUTHORIZED_KEY" ]; then
  echo "$AUTHORIZED_KEY" > /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
fi
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
exec /usr/sbin/sshd -D -e
`

let workDir: string
let keyPath: string
let knownHostsPath: string
let appDir: string

function run(command: string, args: string[], cwd?: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** 受限网络下通过镜像预拉取基础镜像并回标为原 docker.io 名称。 */
function prepareBaseImages(rt: string): void {
  if (!REGISTRY_MIRROR)
    return
  for (const img of BASE_IMAGES) {
    try {
      run(rt, ['image', 'inspect', img])
      continue
    }
    catch {
      // 本地无缓存，经镜像拉取
    }
    run(rt, ['pull', `${REGISTRY_MIRROR}/library/${img}`])
    run(rt, ['tag', `${REGISTRY_MIRROR}/library/${img}`, img])
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 轮询等待 sshd 就绪。 */
async function waitForSsh(): Promise<void> {
  const deadline = Date.now() + 120_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      execFileSync('ssh', [
        '-i',
        keyPath,
        '-p',
        String(SSH_PORT),
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=no',
        '-o',
        `UserKnownHostsFile=${knownHostsPath}`,
        '-o',
        'ConnectTimeout=5',
        'root@127.0.0.1',
        'true',
      ], { stdio: 'ignore' })
      return
    }
    catch (error) {
      lastError = error
      await sleep(3000)
    }
  }
  throw new Error(`sshd 未在超时内就绪：${String(lastError)}`)
}

describe.skipIf(!enabled)('docker-ssh 端到端部署（需 HAI_DEPLOY_E2E=1 + 容器运行时）', () => {
  beforeAll(async () => {
    const rt = runtime as 'podman' | 'docker'
    workDir = mkdtempSync(path.join(tmpdir(), 'hai-deploy-e2e-'))
    keyPath = path.join(workDir, 'id_ed25519')
    knownHostsPath = path.join(workDir, 'known_hosts')

    // 1. 生成一次性 SSH 密钥对
    run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', keyPath])
    const publicKey = readFileSync(`${keyPath}.pub`, 'utf-8').trim()

    // 2. 预拉取基础镜像（受限网络），再构建 sshd + podman 夹具镜像
    prepareBaseImages(rt)
    writeFileSync(path.join(workDir, 'Containerfile'), CONTAINERFILE)
    writeFileSync(path.join(workDir, 'entrypoint.sh'), ENTRYPOINT)
    run(rt, ['build', '-t', FIXTURE_IMAGE, '-f', path.join(workDir, 'Containerfile'), workDir])

    // 3. 启动夹具容器（嵌套 podman 需 --privileged + --cgroupns=host + cgroup 挂载）
    try {
      run(rt, ['rm', '-f', FIXTURE_NAME])
    }
    catch {
      // 首次运行无同名容器
    }
    run(rt, [
      'run',
      '-d',
      '--name',
      FIXTURE_NAME,
      '--privileged',
      '--cgroupns=host',
      '-v',
      '/sys/fs/cgroup:/sys/fs/cgroup:rw',
      '-p',
      `${SSH_PORT}:22`,
      '-p',
      `${HOST_PORT}:${HOST_PORT}`,
      '-e',
      `AUTHORIZED_KEY=${publicKey}`,
      FIXTURE_IMAGE,
    ])

    // 4. 等待 sshd 就绪
    await waitForSsh()

    // 5. 用 CLI 生成一个最小 website 项目（custom + 无功能，确保无 DB 依赖可稳定启动）
    if (NPM_MIRROR)
      process.env.npm_config_registry = NPM_MIRROR
    await createProject({
      name: 'e2e-web',
      appType: 'website',
      template: 'custom',
      features: [],
      examples: false,
      install: true,
      packageManager: 'pnpm', // 生成 pnpm-lock.yaml，供容器 Dockerfile 的 pnpm fetch 使用
      git: false,
      yes: true,
      cwd: workDir,
    })
    appDir = path.join(workDir, 'e2e-web')
    // 受限网络：调整生成应用的 Dockerfile —— 去掉 syntax 指令（避免 BuildKit 从 docker.io
    // 拉取前端镜像；内置 frontend 已支持 RUN --mount=type=cache），并在构建阶段注入 npm 镜像
    // （.npmrc 在 pnpm fetch 前尚未 COPY，故用 ENV npm_config_registry）
    const dfPath = path.join(appDir, 'Dockerfile')
    let dockerfile = readFileSync(dfPath, 'utf-8')
    if (REGISTRY_MIRROR)
      dockerfile = dockerfile.replace(/^# syntax=.*\r?\n/m, '')
    if (NPM_MIRROR)
      dockerfile = dockerfile.replace(/(FROM [^\n]+ AS build\r?\n)/g, `$1ENV npm_config_registry=${NPM_MIRROR}\n`)
    writeFileSync(dfPath, dockerfile)
  }, 900_000)

  afterAll(async () => {
    await deploy.close()
    if (runtime) {
      try {
        execFileSync(runtime, ['rm', '-f', FIXTURE_NAME], { stdio: 'ignore' })
      }
      catch {
        // 忽略清理错误
      }
    }
    if (workDir)
      rmSync(workDir, { recursive: true, force: true })
  }, 120_000)

  it('容器化并经 SSH 部署后应可访问页面', async () => {
    const initResult = await deploy.init({
      provider: {
        type: 'docker-ssh',
        ssh: {
          host: '127.0.0.1',
          port: SSH_PORT,
          username: 'root',
          identityFile: keyPath,
          knownHostsFile: knownHostsPath,
          strictHostKeyChecking: false,
        },
        remote: { baseDir: '/opt/hai/apps', runtime: 'podman' },
        expose: { type: 'port', containerPort: 3000, hostPort: HOST_PORT },
      },
      container: { runtime: runtime as 'podman' | 'docker' },
    })
    expect(initResult.success).toBe(true)

    const deployResult = await deploy.deployApp(appDir, { skipProvision: true })
    expect(deployResult.success).toBe(true)
    if (deployResult.success) {
      expect(deployResult.data.provider).toBe('docker-ssh')
      expect(deployResult.data.healthCheck).toBe('passed')
    }

    // 访问页面：应用根路径返回 200
    const response = await fetch(`http://127.0.0.1:${HOST_PORT}/`, { signal: AbortSignal.timeout(10_000) })
    expect(response.ok).toBe(true)
  }, 1_200_000)
})
