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
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import { crypto } from '@h-ai/crypto'
import { deploy } from '@h-ai/deploy'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { createProject } from '../src/commands/cli-create.js'
import { deployCommand } from '../src/commands/cli-deploy.js'

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
const SQLITE_MIRROR = process.env.HAI_DEPLOY_E2E_SQLITE_MIRROR

// 固定资源命名，便于失败后手动清理
const FIXTURE_NAME = 'hai-deploy-e2e-sshd'
const FIXTURE_IMAGE = 'hai-deploy-e2e-fixture:latest'
const SSH_PORT = 2222
const HOST_PORT = 18080
// 生成应用 Dockerfile 依赖的基础镜像（受限网络下按镜像预拉取）
const BASE_IMAGES = ['python:3.11-slim', 'node:24-bookworm-slim']

// 夹具：Debian + sshd + podman + podman-compose（嵌套 podman 运行远程 compose）；
// nftables/iptables 供 netavark 网络；cgroupfs 与 --cgroupns=host 配合使嵌套 podman 可建 pod。
const APT_SOURCES_FIX = APT_MIRROR
  ? `sed -i 's#deb.debian.org#${APT_MIRROR}#g' /etc/apt/sources.list.d/debian.sources && `
  : ''
const CONTAINERFILE = `FROM python:3.11-slim
RUN ${APT_SOURCES_FIX}apt-get -o Acquire::Retries=10 update \\
  && apt-get -o Acquire::Retries=10 install -y --no-install-recommends openssh-server podman podman-compose uidmap fuse-overlayfs nftables iptables aardvark-dns \\
  && rm -rf /var/lib/apt/lists/* && ssh-keygen -A && mkdir -p /root/.ssh && chmod 700 /root/.ssh
RUN mkdir -p /etc/containers && printf '[containers]\\ncgroups = "disabled"\\n[engine]\\ncgroup_manager = "cgroupfs"\\nevents_logger = "file"\\n' > /etc/containers/containers.conf
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
const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'] as const
const originalProxies = new Map<string, string | undefined>()

function run(command: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv): string {
  try {
    return execFileSync(command, args, { cwd, env: env ? { ...process.env, ...env } : undefined, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 })
  }
  catch (error) {
    // 构建器把 apt/pnpm 错误写在 stdout，保留有界输出才能定位真实失败阶段。
    const output = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout).slice(-6000) : ''
    throw new Error(`${command} ${args[0]} failed: ${output}`, { cause: error })
  }
}

/** 在真实 SSH 部署的 API 上运行生成项目自带的浏览器业务用例；只移除本地 API 启动器。 */
function verifyDeployedBrowser(metadata: { name: string, version: string, env: string }): void {
  const local = parseEnv(readFileSync(path.join(appDir, '.env.local'), 'utf8'))
  const evidence = path.resolve('test-results/deploy-fullstack')
  mkdirSync(evidence, { recursive: true })
  const env = {
    HAI_CORE_NAME: metadata.name,
    HAI_CORE_VERSION: metadata.version,
    HAI_CORE_ENV: metadata.env,
    E2E_ADMIN_PASSWORD: local.HAI_ADMIN_DEFAULT_PASSWORD,
    SERVICE_BASE_URL: `http://127.0.0.1:${HOST_PORT}`,
    // 使用模板自带的同源预览代理，API 仍指向真实 SSH 容器；无需放宽凭据 Cookie 的 CORS。
    PUBLIC_API_BASE: '',
    BASE_URL: 'http://127.0.0.1:18181',
    HAI_AUTH_EVIDENCE_DIR: evidence,
  }
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm'
  const args = (items: string[]) => process.platform === 'win32' ? ['/d', '/s', '/c', `pnpm.cmd ${items.join(' ')}`] : items
  run(command, args(['build']), appDir, env)
  writeFileSync(path.join(appDir, 'playwright.deploy.config.ts'), `import config from './playwright.config.js'\nexport default { ...config, webServer: Array.isArray(config.webServer) ? config.webServer.slice(1) : [] }\n`)
  try {
    const output = run(command, args(['exec', 'playwright', 'test', '--config', 'playwright.deploy.config.ts']), appDir, env)
    writeFileSync(path.join(evidence, 'playwright.log'), output)
  }
  finally {
    const results = path.join(appDir, 'test-results')
    if (existsSync(results))
      cpSync(results, path.join(evidence, 'playwright'), { recursive: true })
  }
}

/** 本次源码 tarball 复制进构建上下文，避免 Linux 镜像引用 Windows 绝对路径。 */
function useLocalPackages(project: string): void {
  const specifiers = JSON.parse(process.env.HAI_CLI_PACKAGE_SPECIFIERS ?? '{}') as Record<string, string>
  if (!Object.keys(specifiers).length)
    throw new Error('Run test:deploy-gates to validate current package archives')
  const archives = path.join(project, '.hai-packages')
  mkdirSync(archives)
  const overrides: Record<string, string> = {}
  const localSpecifiers: Record<string, string> = {}
  for (const [name, specifier] of Object.entries(specifiers)) {
    const source = specifier.slice('file:'.length)
    const filename = path.basename(source)
    copyFileSync(source, path.join(archives, filename))
    localSpecifiers[name] = `file:./.hai-packages/${filename}`
    const edges = JSON.parse(process.env.HAI_CLI_PACKAGE_OVERRIDES ?? '{}') as Record<string, string>
    for (const [edge, value] of Object.entries(edges)) {
      if (value === specifier)
        overrides[edge] = `file:./.hai-packages/${filename}`
    }
  }
  const workspaceFile = path.join(project, 'pnpm-workspace.yaml')
  const workspace = parse(readFileSync(workspaceFile, 'utf8')) as { overrides?: Record<string, string>, catalog?: Record<string, string> }
  workspace.overrides = { ...workspace.overrides, ...overrides }
  for (const name of Object.keys(localSpecifiers)) {
    if (workspace.catalog)
      delete workspace.catalog[name]
  }
  writeFileSync(workspaceFile, stringify(workspace))
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory() && !['node_modules', '.hai-packages'].includes(entry.name))
        visit(entryPath)
      if (entry.name !== 'package.json')
        continue
      const manifest = JSON.parse(readFileSync(entryPath, 'utf8')) as { dependencies?: Record<string, string>, devDependencies?: Record<string, string> }
      for (const section of [manifest.dependencies, manifest.devDependencies]) {
        for (const name of Object.keys(section ?? {})) {
          if (section && localSpecifiers[name])
            section[name] = `file:${path.relative(directory, path.join(project, localSpecifiers[name].slice('file:./'.length))).replaceAll('\\', '/')}`
        }
      }
      writeFileSync(entryPath, `${JSON.stringify(manifest, null, 2)}\n`)
    }
  }
  visit(project)
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
    // Windows 宿主机的 localhost 代理不能在隔离测试容器内使用；不改变用户系统配置。
    for (const key of proxyKeys) {
      originalProxies.set(key, process.env[key])
      process.env[key] = ''
    }
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
    run(rt, ['build', ...(rt === 'podman' ? ['--http-proxy=false'] : []), '-t', FIXTURE_IMAGE, '-f', path.join(workDir, 'Containerfile'), workDir])

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

    // 5. 用实际 fullstack 模板及本次源码包验证环境选择、配置写入、服务启动与重复部署。
    if (NPM_MIRROR)
      process.env.pnpm_config_registry = NPM_MIRROR
    await createProject({
      name: 'e2e-fullstack',
      appType: 'fullstack',
      frontends: ['web'],
      template: 'default',
      features: ['db', 'cache', 'storage', 'iam', 'deploy'],
      examples: false,
      install: false,
      packageManager: 'pnpm', // 生成 pnpm-lock.yaml，供容器 Dockerfile 的 pnpm fetch 使用
      git: false,
      yes: true,
      cwd: workDir,
    })
    appDir = path.join(workDir, 'e2e-fullstack')
    useLocalPackages(appDir)
    if (NPM_MIRROR) {
      const npmrc = path.join(appDir, '.npmrc')
      writeFileSync(npmrc, `${readFileSync(npmrc, 'utf8')}\nregistry=${NPM_MIRROR}\n`)
    }
    // 容器构建时检查真实上下文，避免私有配置或上次部署归档被 COPY 到构建层。
    const guard = path.join(appDir, 'scripts/verify-deploy-context.mjs')
    mkdirSync(path.dirname(guard), { recursive: true })
    writeFileSync(guard, `import { existsSync } from 'node:fs'\nif (process.env.HAI_DEPLOY_ENVIRONMENT && (existsSync('.hai/deploy') || existsSync('../../.env.local'))) throw new Error('Private deployment artifacts entered the build context')\n`)
    const manifestPath = path.join(appDir, 'packages/e2e-fullstack-serv/package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { scripts: Record<string, string> }
    manifest.scripts.build = `node ../../scripts/verify-deploy-context.mjs && ${manifest.scripts.build}`
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    run(process.platform === 'win32' ? 'cmd.exe' : 'pnpm', process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd install'] : ['install'], appDir)
    expect(readdirSync(path.join(appDir, 'node_modules', '@h-ai'))).not.toContain('ai')
    expect(readdirSync(path.join(appDir, 'node_modules', '@h-ai'))).toContain('deploy')
    expect(readdirSync(path.join(appDir, 'node_modules'))).not.toContain('onnxruntime-node')
    // 受限网络：调整生成应用的 Dockerfile —— 去掉 syntax 指令（避免 BuildKit 从 docker.io
    // 拉取前端镜像；内置 frontend 已支持 RUN --mount=type=cache），并在构建阶段注入 npm 镜像
    // （.npmrc 在 pnpm fetch 前尚未 COPY，故用 ENV pnpm_config_registry）
    const dfPath = path.join(appDir, 'Dockerfile')
    let dockerfile = readFileSync(dfPath, 'utf-8')
    if (REGISTRY_MIRROR)
      dockerfile = dockerfile.replace(/^# syntax=.*\r?\n/m, '')
    if (NPM_MIRROR)
      dockerfile = dockerfile.replace(/(FROM [^\n]+ AS build\r?\n)/g, `$1ENV pnpm_config_registry=${NPM_MIRROR}\n`)
    writeFileSync(dfPath, dockerfile)
    const serviceDir = path.join(appDir, 'packages/e2e-fullstack-serv')
    const deployConfig = {
      provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', port: SSH_PORT, username: 'root', identityFile: keyPath, knownHostsFile: knownHostsPath, strictHostKeyChecking: false }, remote: { baseDir: '/opt/hai/apps with spaces', runtime: 'podman' }, expose: { type: 'port', containerPort: 3000, hostPort: HOST_PORT } },
      container: { runtime, httpProxy: false, ...(SQLITE_MIRROR ? { sqlitePrebuildMirror: SQLITE_MIRROR } : {}) },
    }
    writeFileSync(path.join(appDir, '.env.local'), `${readFileSync(path.join(appDir, '.env.local'), 'utf8')}\nHAI_DEPLOY_PROVIDER='${JSON.stringify(deployConfig.provider)}'\n`)
    writeFileSync(path.join(serviceDir, 'config/_deploy.yml'), stringify(deployConfig))
  }, 900_000)

  afterAll(async () => {
    await deploy.close()
    await crypto.close()
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
    for (const [key, value] of originalProxies) {
      if (value === undefined)
        delete process.env[key]
      else
        process.env[key] = value
    }
  }, 120_000)

  it('fullstack CLI 环境部署、登录和保持不变的重复部署均可用', async () => {
    expect((await crypto.init()).success).toBe(true)
    let metadata: { name: string, version: string, env: string } | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      await deployCommand({ appDir: path.join(appDir, 'packages/e2e-fullstack-serv'), env: 'test', yes: true, skipMiddleware: attempt > 0 })
      const response = await fetch(`http://127.0.0.1:${HOST_PORT}/health`, { signal: AbortSignal.timeout(10_000) })
      expect(response.ok).toBe(true)
      const client = crypto.transport.createClient({ keyExchangeUrl: `http://127.0.0.1:${HOST_PORT}/api/v1/_hai/key-exchange`, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) })
      const info = await client.encryptedFetch(`http://127.0.0.1:${HOST_PORT}/api/v1/app/info`, { method: 'POST' })
      const details = await info.json() as { success: boolean, data: { name: string, version: string, env: string } }
      expect(details).toMatchObject({ success: true, data: { env: 'test' } })
      metadata = details.data
      const local = parseEnv(readFileSync(path.join(appDir, '.env.local'), 'utf8'))
      const login = await client.encryptedFetch(`http://127.0.0.1:${HOST_PORT}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'admin', password: local.HAI_ADMIN_DEFAULT_PASSWORD }) })
      expect(await login.json()).toMatchObject({ success: true })
      client.destroy()
      const artifactDir = path.join(appDir, 'packages/e2e-fullstack-serv/.hai/deploy/test')
      expect(readFileSync(path.join(artifactDir, 'start-test.sh'), 'utf8')).toContain('HAI_DEPLOY_ENVIRONMENT=test')
      expect(readFileSync(path.join(appDir, '.env.test'), 'utf8')).not.toContain(String(local.HAI_ADMIN_DEFAULT_PASSWORD))
    }
    expect(metadata).toBeDefined()
    if (metadata)
      verifyDeployedBrowser(metadata)
  }, 1_200_000)
})
