/**
 * =============================================================================
 * @h-ai/cli - docker-ssh 部署端到端测试
 * =============================================================================
 *
 * 完整链路：启动带 sshd + podman 的隔离 Linux 服务器 → CLI 生成项目、构建镜像和离线包 →
 * 通过 SSH 上传、加载并启动 Compose → 用真实浏览器验证页面与认证。
 *
 * 该测试较重且依赖可连接的 Podman/Docker，默认跳过。使用门禁入口打包当前源码并设置验收环境：
 *
 *   pnpm --filter @h-ai/cli test:deploy-gates
 */

import type { DeploymentArtifact } from '@h-ai/deploy'
import type { AppType } from '../src/cli-types.js'
import type { DeployFixtureCleanupFailure, DeployTestFixture, DeployTestImage } from './helpers/deploy-container-fixture.js'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { crypto } from '@h-ai/crypto'
import { deploy } from '@h-ai/deploy'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { createProject } from '../src/commands/cli-create.js'
import { createDeployFixtureCleanupReport, createDeployTestFixture, DEPLOY_FIXTURE_API_PORT, DEPLOY_FIXTURE_OWNER_LABEL, DEPLOY_FIXTURE_WEB_PORT, recordDeployTestImage, removeDeployTestFixture, removeDeployTestImages } from './helpers/deploy-container-fixture.js'

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
if (process.env.HAI_DEPLOY_E2E === '1' && runtime === null)
  throw new Error('Deployment gate requires a reachable Podman or Docker engine. Start the engine and retry test:deploy-gates.')
const enabled = process.env.HAI_DEPLOY_E2E === '1' && runtime !== null

// 受限网络可选加速：HAI_DEPLOY_E2E_MIRROR 指向 docker.io 镜像（如 docker.m.daocloud.io）；
// HAI_DEPLOY_E2E_APT_MIRROR 替换 Debian 源主机（如 mirrors.ustc.edu.cn）。
const REGISTRY_MIRROR = process.env.HAI_DEPLOY_E2E_MIRROR
const APT_MIRROR = process.env.HAI_DEPLOY_E2E_APT_MIRROR
const NPM_MIRROR = process.env.HAI_DEPLOY_E2E_NPM_MIRROR
const SQLITE_MIRROR = process.env.HAI_DEPLOY_E2E_SQLITE_MIRROR
// 容器可达的代理地址；Windows 的 localhost 代理可改用 host.containers.internal。
const CONTAINER_PROXY = process.env.HAI_DEPLOY_E2E_CONTAINER_PROXY
const CONTAINER_NETWORK = process.env.HAI_DEPLOY_E2E_CONTAINER_NETWORK

// 外层资源按本轮身份隔离；内部端口固定，宿主端口由引擎原子分配。
const RUN_ID = randomBytes(16).toString('hex')
const FIXTURE_IMAGE = `localhost/hai-deploy-e2e-fixture:${RUN_ID}`
const HOST_PORT = DEPLOY_FIXTURE_WEB_PORT
const API_PORT = DEPLOY_FIXTURE_API_PORT
const APPLICATION_VERSION = '2.4.6'
// 生成应用 Dockerfile 依赖的基础镜像（受限网络下按镜像预拉取）
const BASE_IMAGES = ['python:3.11.17-slim-trixie', 'node:24.22.1-bookworm-slim', 'nginxinc/nginx-unprivileged:1.29.8-alpine']

// 夹具：Debian + sshd + podman + podman-compose（嵌套 podman 运行远程 compose）；
// nftables/iptables 供 netavark 网络；cgroupfs 与 --cgroupns=host 配合使嵌套 podman 可建 pod。
const APT_SOURCES_FIX = APT_MIRROR
  ? `sed -i 's#deb.debian.org#${APT_MIRROR}#g' /etc/apt/sources.list.d/debian.sources && `
  : ''
const CONTAINERFILE = `FROM python:3.11.17-slim-trixie
RUN ${APT_SOURCES_FIX}sed -i 's#http://#https://#g' /etc/apt/sources.list.d/debian.sources \\
  && apt-get -o Acquire::Retries=3 -o Acquire::https::Timeout=20 update \\
  && apt-get -o Acquire::Retries=3 -o Acquire::https::Timeout=20 install -y --no-install-recommends curl openssh-server podman uidmap fuse-overlayfs nftables iptables aardvark-dns util-linux \\
  && rm -rf /var/lib/apt/lists/* && ssh-keygen -A && mkdir -p /root/.ssh && chmod 700 /root/.ssh
RUN pip install --no-cache-dir podman-compose==1.6.0
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
const testImages = new Map<string, DeployTestImage>()
let fixtureContext: DeployTestFixture | undefined

/** 返回已由本轮成功创建的夹具；不通过名称探测或接管其他容器。 */
function fixture(): DeployTestFixture {
  if (!fixtureContext)
    throw new Error('Deployment fixture is not initialized')
  return fixtureContext
}
const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'] as const
const originalProxies = new Map<string, string | undefined>()

function run(command: string, args: string[], cwd?: string, env?: NodeJS.ProcessEnv): string {
  try {
    return execFileSync(command, args, { cwd, env: env ? { ...process.env, ...env } : undefined, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, timeout: 900_000, windowsHide: true })
  }
  catch (error) {
    // 构建器把 apt/pnpm 错误写在 stdout，保留有界输出才能定位真实失败阶段。
    const output = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout).slice(-6000) : ''
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).slice(-6000) : ''
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    throw new Error(`${command} ${args[0]} failed: ${reason}\n${output}\n${stderr}`)
  }
}

/** 调用当前 pnpm 的可执行文件或 JS 入口，真实验证项目 scripts 与 CLI 参数解析。 */
function runPnpm(args: string[], cwd: string, env?: NodeJS.ProcessEnv): string {
  const entry = process.env.npm_execpath
  if (!entry)
    throw new Error('Run this test through pnpm')
  return /\.[cm]?js$/i.test(entry) ? run(process.execPath, [entry, ...args], cwd, env) : run(entry, args, cwd, env)
}

/**
 * 浏览器访问本轮 SSH 服务器上的 Web/API，并在私有工程回收后保留验收证据。
 * @param metadata - 部署元数据的预期值。
 * @param metadata.name - 预期的应用名称。
 * @param metadata.version - 预期的已部署版本。
 * @param metadata.env - 预期的运行环境。
 * @param project - 本轮生成并已部署的工程路径，默认使用 appDir。
 * @returns {void} 验收成功后返回。
 * @throws 浏览器验收或证据持久化失败时抛错。
 * @example
 * ```ts
 * verifyDeployedBrowser({ name: 'Acceptance app', version: '2.4.6', env: 'test' }, appDir)
 * ```
 */
function verifyDeployedBrowser(metadata: { name: string, version: string, env: string }, project = appDir): void {
  const local = parseEnv(readFileSync(path.join(project, '.env.local'), 'utf8'))
  const parent = path.resolve(process.env.HAI_AUTH_EVIDENCE_DIR || fileURLToPath(new URL('../../../tmp/validation/module-review/deploy-browser/', import.meta.url)))
  mkdirSync(parent, { recursive: true })
  const evidence = mkdtempSync(path.join(parent, `${RUN_ID}-${path.basename(project)}-`))
  const env = {
    HAI_CORE_NAME: metadata.name,
    HAI_CORE_VERSION: metadata.version,
    HAI_CORE_ENV: metadata.env,
    E2E_ADMIN_PASSWORD: local.HAI_ADMIN_DEFAULT_PASSWORD,
    SERVICE_BASE_URL: `http://127.0.0.1:${fixture().webHostPort}`,
    PUBLIC_API_BASE: '',
    BASE_URL: `http://127.0.0.1:${fixture().webHostPort}`,
    HAI_AUTH_EVIDENCE_DIR: evidence,
    HAI_E2E_DATA_ROOT: path.join(workDir, 'browser-data'),
    ...(process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || process.env.PLAYWRIGHT_HTML_REPORT ? {} : { PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(evidence, 'html') }),
  }
  writeFileSync(path.join(project, 'playwright.deploy.config.ts'), `import config from './playwright.config.js'\nexport default { ...config, webServer: [] }\n`)
  try {
    const output = runPnpm(['exec', 'playwright', 'test', '--config', 'playwright.deploy.config.ts', '--output', path.join(evidence, 'results')], project, env)
    writeFileSync(path.join(evidence, 'playwright.log'), output)
  }
  catch (error) {
    writeFileSync(path.join(evidence, 'playwright.log'), error instanceof Error ? error.message : String(error))
    throw error
  }
  finally {
    rmSync(path.join(project, 'playwright.deploy.config.ts'), { force: true })
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
    run(rt, ['pull', `${REGISTRY_MIRROR}/${img.includes('/') ? '' : 'library/'}${img}`])
    run(rt, ['tag', `${REGISTRY_MIRROR}/${img.includes('/') ? '' : 'library/'}${img}`, img])
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
        String(fixture().sshHostPort),
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
    run(rt, ['build', ...(rt === 'podman' ? ['--http-proxy=false'] : []), '--label', `${DEPLOY_FIXTURE_OWNER_LABEL}=${RUN_ID}`, '--iidfile', path.join(workDir, 'fixture.iid'), '-t', FIXTURE_IMAGE, '-f', path.join(workDir, 'Containerfile'), workDir])
    testImages.set(FIXTURE_IMAGE, recordDeployTestImage(rt, FIXTURE_IMAGE, RUN_ID))

    // 3. create 成功先记录 ID，start 失败也只回收该 ID；不按名称预删。
    fixtureContext = createDeployTestFixture(rt, FIXTURE_IMAGE, publicKey, workDir, RUN_ID)

    // 4. 等待 sshd 就绪
    await waitForSsh()
    run(rt, ['exec', fixture().containerId, 'sh', '-c', 'mkdir -p /etc/containers/registries.conf.d && printf \'[[registry]]\\nprefix = "docker.io"\\nblocked = true\\n[[registry]]\\nprefix = "ghcr.io"\\nblocked = true\\n\' > /etc/containers/registries.conf.d/offline.conf'])
  }, 900_000)

  afterAll(async () => {
    const failures: DeployFixtureCleanupFailure[] = []
    const report = createDeployFixtureCleanupReport(RUN_ID, fixtureContext ? [fixtureContext] : [], testImages.values())
    // 关闭失败不能跳过资源回收；报告只保留安全元数据，不能保留私有工程。
    for (const [stage, close] of [['deploy-close', () => deploy.close()], ['crypto-close', () => crypto.close()]] as const) {
      try {
        await close()
      }
      catch (error) {
        failures.push({ stage, error })
      }
    }
    if (runtime) {
      if (fixtureContext) {
        try {
          removeDeployTestFixture(runtime, fixtureContext)
          fixtureContext = undefined
        }
        catch (error) {
          failures.push({ stage: 'container-remove', error })
        }
      }
      try {
        removeDeployTestImages(runtime, testImages.values())
      }
      catch (error) {
        failures.push({ stage: 'images-remove', error })
      }
    }
    try {
      report(failures)
    }
    catch (error) {
      failures.push({ stage: 'report-write', error })
    }
    try {
      if (workDir)
        rmSync(workDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
    catch (error) {
      failures.push({ stage: 'temporary-directory-remove', error })
    }
    finally {
      for (const [key, value] of originalProxies) {
        if (value === undefined)
          delete process.env[key]
        else
          process.env[key] = value
      }
    }
    // 临时目录删除失败也进入同一个独立报告，不序列化原始错误或凭据。
    try {
      report(failures)
    }
    catch (error) {
      failures.push({ stage: 'report-write', error })
    }
    if (failures.length)
      throw new AggregateError(failures.map(failure => failure.error), 'Deployment fixture cleanup failed; safe metadata was written outside the private temporary project')
  }, 600_000)
  describe('fullstack', () => {
    beforeAll(async () => {
      const rt = runtime as 'podman' | 'docker'
      // 5. 用实际 fullstack 模板及本次源码包验证环境选择、配置写入、服务启动与重复部署。
      if (NPM_MIRROR)
        process.env.pnpm_config_registry = NPM_MIRROR
      await createProject({
        name: 'e2e-fullstack',
        appType: 'fullstack',
        frontends: ['web'],
        template: 'default',
        features: ['db', 'cache', 'storage', 'iam'],
        examples: false,
        install: false,
        packageManager: 'pnpm', // 生成 pnpm-lock.yaml，供容器 Dockerfile 的 pnpm fetch 使用
        git: false,
        yes: true,
        cwd: workDir,
      })
      appDir = path.join(workDir, 'e2e-fullstack')
      useLocalPackages(appDir)
      const applicationManifest = path.join(appDir, 'package.json')
      writeFileSync(applicationManifest, `${JSON.stringify({ ...JSON.parse(readFileSync(applicationManifest, 'utf8')), version: APPLICATION_VERSION }, null, 2)}\n`)
      if (NPM_MIRROR) {
        const npmrc = path.join(appDir, '.npmrc')
        writeFileSync(npmrc, `${readFileSync(npmrc, 'utf8')}\nregistry=${NPM_MIRROR}\n`)
      }
      // 容器构建时检查真实上下文，避免私有配置或上次部署归档被 COPY 到构建层。
      const guard = path.join(appDir, 'scripts/verify-deploy-context.mjs')
      mkdirSync(path.dirname(guard), { recursive: true })
      writeFileSync(guard, `import { existsSync } from 'node:fs'\nif (existsSync('../../.hai/deploy') || existsSync('../../.env.local')) throw new Error('Private deployment artifacts entered the build context')\n`)
      const manifestPath = path.join(appDir, 'packages/e2e-fullstack-serv/package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { scripts: Record<string, string> }
      manifest.scripts.build = `node ../../scripts/verify-deploy-context.mjs && ${manifest.scripts.build}`
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      run(process.platform === 'win32' ? 'cmd.exe' : 'pnpm', process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd install'] : ['install'], appDir)
      // 浏览器测试的 Node 侧导入应用 contract；只编译测试客户端契约，不启动本地 API/Web。
      run(process.platform === 'win32' ? 'cmd.exe' : 'pnpm', process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd --filter e2e-fullstack-contract build'] : ['--filter', 'e2e-fullstack-contract', 'build'], appDir)
      expect(readdirSync(path.join(appDir, 'node_modules', '@h-ai'))).not.toContain('ai')
      expect(readdirSync(path.join(appDir, 'node_modules', '@h-ai'))).toContain('deploy')
      expect(readdirSync(path.join(appDir, 'node_modules'))).not.toContain('onnxruntime-node')
      // 受限网络：调整生成应用的 Dockerfile —— 去掉 syntax 指令（避免 BuildKit 从 docker.io
      // 拉取前端镜像；内置 frontend 已支持 RUN --mount=type=cache），并在构建阶段注入 npm 镜像
      // （.npmrc 在 pnpm fetch 前尚未 COPY，故用 ENV pnpm_config_registry）
      for (const name of ['app', 'web']) {
        const dfPath = path.join(appDir, `images/${name}.Dockerfile`)
        let dockerfile = readFileSync(dfPath, 'utf-8')
        if (NPM_MIRROR)
          dockerfile = dockerfile.replace(/(FROM [^\n]+ AS build\r?\n)/g, `$1ENV pnpm_config_registry=${NPM_MIRROR}\n`)
        writeFileSync(dfPath, dockerfile)
      }
      const serviceDir = path.join(appDir, 'packages/e2e-fullstack-serv')
      writeFileSync(path.join(serviceDir, 'config/_cache.yml'), 'type: redis\n')
      writeFileSync(path.join(serviceDir, 'config/_storage.yml'), 'type: s3\n')
      writeFileSync(path.join(appDir, '.env.test'), `${readFileSync(path.join(appDir, '.env.test'), 'utf8')}\nHAI_E2E=1\nHAI_CACHE='{"type":"redis"}'\nHAI_STORAGE='{"type":"s3"}'\n`)
      const deployConfig = {
        provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', port: fixture().sshHostPort, username: 'root', identityFile: keyPath, knownHostsFile: knownHostsPath, strictHostKeyChecking: false }, remote: { baseDir: '/opt/hai/apps with spaces', runtime: 'podman' }, expose: { type: 'port', containerPort: 3000, hostPort: HOST_PORT } },
        container: { s3Engine: 'rustfs' },
      }
      writeFileSync(path.join(appDir, '.env.local'), `${readFileSync(path.join(appDir, '.env.local'), 'utf8')}\nHAI_DEPLOY_PROVIDER='${JSON.stringify(deployConfig.provider)}'\n`)
      writeFileSync(path.join(serviceDir, 'config/_deploy.yml'), stringify(deployConfig))
      runPnpm(['run', 'build', '--target', 'docker', '--runtime', runtime ?? 'auto', ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy']), ...(SQLITE_MIRROR ? ['--sqlite-prebuild-mirror', SQLITE_MIRROR] : [])], appDir, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
      const buildId = readFileSync(path.join(appDir, '.hai/build/docker/latest'), 'utf8').trim()
      const artifact = JSON.parse(readFileSync(path.join(appDir, '.hai/build/docker', buildId, 'manifest.json'), 'utf8')) as DeploymentArtifact
      expect(artifact).toMatchObject({ version: 3, appVersion: APPLICATION_VERSION })
      expect(artifact.images.map(image => image.file)).toEqual([`app-${APPLICATION_VERSION}.tar`, `web-${APPLICATION_VERSION}.tar`])
      for (const image of artifact.images) {
        testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
        const imageEnv = JSON.parse(run(rt, ['image', 'inspect', '--format', '{{json .Config.Env}}', image.imageRef])) as string[]
        expect(imageEnv.some(value => /^(?:https?|ftp)_proxy=/i.test(value))).toBe(false)
      }
    }, 900_000)

    it('fullstack CLI 环境部署、登录和保持不变的重复部署均可用', async () => {
      expect((await crypto.init()).success).toBe(true)
      let metadata: { name: string, version: string, env: string } | undefined
      for (let attempt = 0; attempt < 3; attempt++) {
        runPnpm(['run', 'deploy', '--env', 'test', '--yes', ...(attempt > 0 ? ['--skip-middleware'] : []), ...(attempt === 1 ? ['--bundle-only', '--output', path.join(workDir, 'manual-test.tar')] : [])], appDir)
        if (attempt === 1) {
          // 模拟无 SSH 的手工搬运：将一个 tar 复制到 Linux，再执行包内脚本。
          const manualArchive = `manual-test-${APPLICATION_VERSION}.tar`
          expect(existsSync(path.join(workDir, manualArchive))).toBe(true)
          run(runtime!, ['cp', path.join(workDir, manualArchive), `${fixture().containerId}:/tmp/${manualArchive}`])
          run(runtime!, ['exec', fixture().containerId, 'sh', '-c', `mkdir -p /opt/manual-release && chmod 700 /opt/manual-release && tar -xf /tmp/${manualArchive} -C /opt/manual-release && cd /opt/manual-release && sh apply.sh '/opt/hai/apps with spaces/e2e-fullstack-serv-test'`])
          const second = path.join(workDir, 'script-test.tar')
          runPnpm(['run', 'deploy', '--env', 'test', '--yes', '--skip-middleware', '--bundle-only', '--output', second], appDir)
          if (process.platform === 'win32')
            run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(workDir, `script-test-${APPLICATION_VERSION}-deploy/deploy.ps1`)])
          const shellPackage = 'shell-script-test'
          runPnpm(['run', 'deploy', '--env', 'test', '--yes', '--skip-middleware', '--bundle-only', '--output', path.join(workDir, `${shellPackage}.tar`)], appDir)
          run(runtime!, ['cp', path.join(workDir, `${shellPackage}-${APPLICATION_VERSION}.tar`), `${fixture().containerId}:/tmp/`])
          run(runtime!, ['cp', path.join(workDir, `${shellPackage}-${APPLICATION_VERSION}-deploy`), `${fixture().containerId}:/tmp/`])
          run(runtime!, ['cp', keyPath, `${fixture().containerId}:/tmp/hai-script-key`])
          run(runtime!, ['exec', fixture().containerId, 'sh', '-c', `chmod 600 /tmp/hai-script-key && HAI_DEPLOY_IDENTITY_FILE=/tmp/hai-script-key HAI_DEPLOY_KNOWN_HOSTS_FILE=/dev/null sh '/tmp/${shellPackage}-${APPLICATION_VERSION}-deploy/deploy.sh' 127.0.0.1 22 root`])
          for (let probe = 0; probe < 40; probe++) {
            if ((await fetch(`http://127.0.0.1:${fixture().webHostPort}/health`).catch(() => null))?.ok)
              break
            await sleep(3000)
          }
        }
        const response = await fetch(`http://127.0.0.1:${fixture().webHostPort}/health`, { signal: AbortSignal.timeout(10_000) })
        expect(response.ok).toBe(true)
        const web = await fetch(`http://127.0.0.1:${fixture().webHostPort}/`)
        expect(web.headers.get('content-type')).toContain('text/html')
        expect(await web.text()).toContain('runtime-config.js')
        expect((await fetch(`http://127.0.0.1:${fixture().webHostPort}/_hai/web-health`)).ok).toBe(true)
        const client = crypto.transport.createClient({ keyExchangeUrl: `http://127.0.0.1:${fixture().webHostPort}/api/v1/_hai/key-exchange`, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) })
        const info = await client.encryptedFetch(`http://127.0.0.1:${fixture().webHostPort}/api/v1/app/info`, { method: 'POST' })
        const details = await info.json() as { success: boolean, data: { name: string, version: string, env: string } }
        expect(details).toMatchObject({ success: true, data: { env: 'test' } })
        metadata = details.data
        const local = parseEnv(readFileSync(path.join(appDir, '.env.local'), 'utf8'))
        const login = await client.encryptedFetch(`http://127.0.0.1:${fixture().webHostPort}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'admin', password: local.HAI_ADMIN_DEFAULT_PASSWORD }) })
        expect(await login.json()).toMatchObject({ success: true })
        client.destroy()
        const artifactDir = path.join(appDir, 'packages/e2e-fullstack-serv/.hai/deploy/test')
        const compose = parse(readFileSync(path.join(artifactDir, `docker-compose-${APPLICATION_VERSION}.yml`), 'utf8'))
        expect(compose['x-hai-version']).toBe(APPLICATION_VERSION)
        expect(compose.services.app.ports).toBeUndefined()
        expect(compose.services.web.ports).toEqual([`${HOST_PORT}:8080`])
        expect(compose.services.web.env_file).toBeUndefined()
        expect(readFileSync(path.join(appDir, '.env.test'), 'utf8')).not.toContain(String(local.HAI_ADMIN_DEFAULT_PASSWORD))
      }
      expect(metadata).toBeDefined()
      if (metadata)
        verifyDeployedBrowser(metadata)
      // 可选人工视觉复核；截图留在独立证据根目录，工程和密钥仍由 afterAll 清理。
      if (process.env.HAI_DEPLOY_E2E_REVIEW === '1') {
        process.stdout.write(`Review screenshots: ${process.env.HAI_AUTH_EVIDENCE_DIR || fileURLToPath(new URL('../../../tmp/validation/module-review/deploy-browser/', import.meta.url))}\n`)
        await sleep(60_000)
      }
    }, 1_200_000)

    it('同版本 Web/API/storage 增量更新保留未选容器，损坏制品不部署，启动失败恢复上一成功版本', async () => {
      const before = run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-app']).trim()
      writeFileSync(path.join(appDir, 'apps/e2e-fullstack-web/public/deployment-marker.txt'), 'incremental-web')
      runPnpm(['run', 'build', '--target', 'docker', '--images', 'web', '--runtime', runtime!, ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy'])], appDir, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
      const buildId = readFileSync(path.join(appDir, '.hai/build/docker/latest'), 'utf8').trim()
      const artifacts = path.join(appDir, '.hai/build/docker', buildId)
      const manifest = JSON.parse(readFileSync(path.join(artifacts, 'manifest.json'), 'utf8')) as DeploymentArtifact
      expect(manifest).toMatchObject({ appVersion: APPLICATION_VERSION, partial: true, hasWeb: true, images: [{ name: 'web' }] })
      for (const image of manifest.images) testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
      runPnpm(['run', 'deploy', '--env', 'test', '--services', 'web', '--yes'], appDir)
      expect(await (await fetch(`http://127.0.0.1:${fixture().webHostPort}/deployment-marker.txt`)).text()).toBe('incremental-web')
      expect(run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-app']).trim()).toBe(before)
      writeFileSync(path.join(artifacts, manifest.images[0]!.file), 'damaged archive')
      expect(() => runPnpm(['run', 'deploy', '--env', 'test', '--services', 'web', '--yes'], appDir)).toThrow()
      expect(run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-app']).trim()).toBe(before)
      // API 单独更新后 Nginx 必须重新解析后端地址，同时保持 Web 容器和页面不变。
      const webBefore = run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-web']).trim()
      runPnpm(['run', 'build', '--target', 'docker', '--images', 'app', '--runtime', runtime!, ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy']), ...(SQLITE_MIRROR ? ['--sqlite-prebuild-mirror', SQLITE_MIRROR] : [])], appDir, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
      const apiBuildId = readFileSync(path.join(appDir, '.hai/build/docker/latest'), 'utf8').trim()
      const apiManifest = JSON.parse(readFileSync(path.join(appDir, '.hai/build/docker', apiBuildId, 'manifest.json'), 'utf8')) as DeploymentArtifact
      expect(apiManifest).toMatchObject({ appVersion: APPLICATION_VERSION, partial: true, hasWeb: true, images: [{ name: 'app' }] })
      for (const image of apiManifest.images) testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
      runPnpm(['run', 'deploy', '--env', 'test', '--services', 'app', '--yes'], appDir)
      expect(run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-app']).trim()).not.toBe(before)
      expect(run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-web']).trim()).toBe(webBefore)
      expect((await fetch(`http://127.0.0.1:${fixture().webHostPort}/health`)).ok).toBe(true)
      expect(await (await fetch(`http://127.0.0.1:${fixture().webHostPort}/deployment-marker.txt`)).text()).toBe('incremental-web')
      const appBeforeStorage = run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-app']).trim()
      runPnpm(['run', 'deploy', '--env', 'test', '--services', 'storage', '--yes'], appDir)
      expect(run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-app']).trim()).toBe(appBeforeStorage)
      expect(run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-web']).trim()).toBe(webBefore)
      expect((await fetch(`http://127.0.0.1:${fixture().webHostPort}/health`)).ok).toBe(true)

      // 故意交付无法启动的同版本 Web，验证服务器真正恢复镜像与上一次成功状态。
      const deploymentDirectory = '/opt/hai/apps with spaces/e2e-fullstack-serv-test'
      const successfulRelease = run(runtime!, ['exec', fixture().containerId, 'cat', `${deploymentDirectory}/current`]).trim()
      const successfulWebImage = run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Image}}', 'hai-e2e-fullstack-serv-test-web']).trim()
      const webDockerfile = path.join(appDir, 'images/web.Dockerfile')
      writeFileSync(webDockerfile, `${readFileSync(webDockerfile, 'utf8')}\nCMD ["sh", "-c", "exit 1"]\n`)
      runPnpm(['run', 'build', '--target', 'docker', '--images', 'web', '--runtime', runtime!, ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy'])], appDir, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
      const failedBuildId = readFileSync(path.join(appDir, '.hai/build/docker/latest'), 'utf8').trim()
      const failedManifest = JSON.parse(readFileSync(path.join(appDir, '.hai/build/docker', failedBuildId, 'manifest.json'), 'utf8')) as DeploymentArtifact
      expect(failedManifest).toMatchObject({ appVersion: APPLICATION_VERSION, partial: true, images: [{ name: 'web' }] })
      for (const image of failedManifest.images) testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
      expect(() => runPnpm(['run', 'deploy', '--env', 'test', '--services', 'web', '--yes'], appDir)).toThrow()
      expect(run(runtime!, ['exec', fixture().containerId, 'cat', `${deploymentDirectory}/current`]).trim()).toBe(successfulRelease)
      expect(run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Image}}', 'hai-e2e-fullstack-serv-test-web']).trim()).toBe(successfulWebImage)
      expect(run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-serv-test-app']).trim()).toBe(appBeforeStorage)
      const results = run(runtime!, ['exec', fixture().containerId, 'sh', '-c', `cat '${deploymentDirectory}'/result-*.json`]).trim().split('\n').map(line => JSON.parse(line) as { stage: string, exitCode: number })
      expect(results).toContainEqual(expect.objectContaining({ stage: 'health', exitCode: 1 }))
      for (let attempt = 0; attempt < 40; attempt++) {
        if ((await fetch(`http://127.0.0.1:${fixture().webHostPort}/health`).catch(() => null))?.ok)
          break
        await sleep(1000)
      }
      expect((await fetch(`http://127.0.0.1:${fixture().webHostPort}/health`)).ok).toBe(true)
      expect(await (await fetch(`http://127.0.0.1:${fixture().webHostPort}/deployment-marker.txt`)).text()).toBe('incremental-web')
    }, 900_000)
  })

  it.each<AppType>(['api', 'admin', 'website', 'h5', 'mobile-app'])('%s 模板能真实构建、生成离线包并在隔离服务器启动', async (appType) => {
    // 内层引擎存储独占且不挂宿主 engine/socket/storage；只在本轮已记录外层 ID 内释放上一场景。
    run(runtime!, ['exec', fixture().containerId, 'podman', 'rm', '-af'])
    const name = `delivery-${appType}`
    await createProject({ name, appType, yes: true, install: false, git: false, examples: false, packageManager: 'pnpm', cwd: workDir })
    const project = path.join(workDir, name)
    useLocalPackages(project)
    // 本轮测试配置显式允许隔离本地状态；生产环境文件和共享状态守卫保持不变。
    const fixtureEnvironment = path.join(project, appType === 'api' ? `apps/${name}-service/.env.test` : '.env.test')
    writeFileSync(fixtureEnvironment, `${readFileSync(fixtureEnvironment, 'utf8')}\nHAI_E2E=1\nHAI_DB='{"type":"sqlite","database":"/app/data/e2e.db"}'\nHAI_CACHE='{"type":"memory"}'\nHAI_STORAGE='{"type":"local","root":"/app/data/uploads"}'\n`)
    runPnpm(['install', '--prefer-offline'], project)
    const dockerfilePath = path.join(project, 'images/app.Dockerfile')
    if (NPM_MIRROR)
      writeFileSync(dockerfilePath, readFileSync(dockerfilePath, 'utf8').replace(/(FROM [^\n]+ AS build\r?\n)/g, `$1ENV pnpm_config_registry=${NPM_MIRROR}\n`))
    runPnpm([...(appType === 'api' ? ['run', 'deploy', '--env', 'test', '--yes', '--build', '--bundle-only'] : ['run', 'build', '--target', 'docker']), '--runtime', runtime!, ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy']), ...(SQLITE_MIRROR ? ['--sqlite-prebuild-mirror', SQLITE_MIRROR] : [])], project, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
    const buildId = readFileSync(path.join(project, '.hai/build/docker/latest'), 'utf8').trim()
    const artifactDir = path.join(project, '.hai/build/docker', buildId)
    const artifact = JSON.parse(readFileSync(path.join(artifactDir, 'manifest.json'), 'utf8')) as DeploymentArtifact
    for (const image of artifact.images) testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
    if (appType === 'mobile-app') {
      // 独立移动前端使用同一隔离服务器上的真实 API；复用前面构建的 API 镜像。
      const apiProject = path.join(workDir, 'delivery-api')
      const apiService = path.join(apiProject, 'apps/delivery-api-service')
      const apiEnvironment = path.join(apiService, '.env.test')
      writeFileSync(apiEnvironment, `${readFileSync(apiEnvironment, 'utf8')}\nHAI_SERV_CORS_ORIGIN=http://127.0.0.1:${fixture().webHostPort}\n`)
      const apiBuildId = readFileSync(path.join(apiProject, '.hai/build/docker/latest'), 'utf8').trim()
      await deploy.close()
      expect(await deploy.init({ provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', port: fixture().sshHostPort, username: 'root', identityFile: keyPath, knownHostsFile: knownHostsPath, strictHostKeyChecking: false }, remote: { baseDir: '/opt/hai/apps with spaces', runtime: 'podman' }, expose: { hostPort: API_PORT } } })).toMatchObject({ success: true })
      expect(await deploy.deployApp(apiService, { environment: 'test', artifactDir: path.join(apiProject, '.hai/build/docker', apiBuildId), runtime: runtime! })).toMatchObject({ success: true, data: { healthCheck: 'passed' } })
      const environment = path.join(project, '.env.test')
      writeFileSync(environment, `${readFileSync(environment, 'utf8')}\nPUBLIC_API_BASE=http://127.0.0.1:${fixture().apiHostPort}/api/v1\n`)
    }
    await deploy.close()
    const initialized = await deploy.init({ provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', port: fixture().sshHostPort, username: 'root', identityFile: keyPath, knownHostsFile: knownHostsPath, strictHostKeyChecking: false }, remote: { baseDir: '/opt/hai/apps with spaces', runtime: 'podman' }, expose: { hostPort: HOST_PORT } } })
    expect(initialized.success).toBe(true)
    const service = appType === 'api' ? path.join(project, `apps/${name}-service`) : project
    const result = await deploy.deployApp(service, { environment: 'test', artifactDir, runtime: runtime! })
    if (!result.success) {
      const diagnostics = run(runtime!, ['exec', fixture().containerId, 'podman', 'logs', '--tail', '80', `hai-${name}${appType === 'api' ? '-service' : ''}-test-app`])
      throw new Error(`${result.error.message}\nContainer diagnostics:\n${diagnostics}`)
    }
    expect(result.success).toBe(true)
    expect(result.success && result.data.healthCheck).toBe('passed')
    const response = await fetch(`http://127.0.0.1:${fixture().webHostPort}${appType === 'api' ? '/health' : '/'}`)
    expect(response.ok).toBe(true)
    if (appType !== 'api')
      verifyDeployedBrowser({ name, version: artifact.appVersion, env: 'test' }, project)
  }, 1_200_000)
})
