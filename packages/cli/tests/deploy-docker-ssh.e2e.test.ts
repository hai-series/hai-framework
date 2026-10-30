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

import type { HaiResult } from '@h-ai/core'
import type { DeployConfigInput, DeploymentArtifact } from '@h-ai/deploy'
import type { IamCaptchaChallenge } from '@h-ai/iam'
import type { TestContext } from 'vitest'
import type { AppType } from '../src/cli-types.js'
import type { DeployFixtureCleanupFailure, DeployTestFixture, DeployTestImage } from './helpers/deploy-container-fixture.js'
import type { DeployTestCommands } from './helpers/deploy-test-command.js'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { crypto } from '@h-ai/crypto'
import { pbkdf2, solveChallenge } from 'altcha/lib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { createProject } from '../src/commands/cli-create.js'
import { createDeployFixtureCleanupReport, createDeployTestFixture, DEPLOY_FIXTURE_API_PORT, DEPLOY_FIXTURE_WEB_PORT, ensureDeployTestBaseImage, executeDeployTestFixture, recordDeployTestImage, removeDeployTestFixture, removeDeployTestImages } from './helpers/deploy-container-fixture.js'
import { createDeployTestCommands, DeployTestCommandError } from './helpers/deploy-test-command.js'

/** 探测可用容器运行时（优先 podman，用 `version` 确认引擎可达）。 */
function detectRuntime(): 'podman' | 'docker' | null {
  for (const runtime of ['podman', 'docker'] as const) {
    try {
      execFileSync(runtime, ['version'], { stdio: 'ignore', windowsHide: true, timeout: 15_000 })
      return runtime
    }
    catch {
      // 尝试下一个
    }
  }
  return null
}

const runtime = process.env.HAI_DEPLOY_E2E === '1' ? detectRuntime() : null
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

// 外层入口固定；实际远端应用使用引擎分配的宿主端口，TCP 转发保持两侧地址一致。
const RUN_ID = randomBytes(16).toString('hex')
let remoteWebPort: number
let remoteApiPort: number
const APPLICATION_VERSION = '2.4.6'
// 生成应用 Dockerfile 依赖的基础镜像（受限网络下按镜像预拉取）
const BASE_IMAGES = ['python:3.11.17-slim-trixie', 'node:24.22.1-bookworm-slim', 'nginxinc/nginx-unprivileged:1.29.8-alpine']

// 夹具：Debian + sshd + podman + podman-compose（嵌套 podman 运行远程 compose）；
// nftables/iptables 供 netavark 网络；cgroupfs 与 --cgroupns=host 配合使嵌套 podman 可建 pod。
const APT_SOURCES_FIX = APT_MIRROR
  ? `sed -i 's#deb.debian.org#${APT_MIRROR}#g' /etc/apt/sources.list.d/debian.sources && `
  : ''

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

/**
 * 将外层固定入口转发到本轮随机端口，保留部署器从客户端和远端进行的真实 HTTP 检查。
 * 转发器只搬运 TCP 字节，不生成响应；后台进程属于已登记容器的私有 PID namespace。
 * @param signal - 与夹具准备共用的取消信号。
 * @returns 两个入口实际监听后返回；准备失败由容器拥有权清理统一回收。
 * @example 模块内部上下文
 * ```ts
 * await startRemotePortForwarders(signal)
 * // provider.expose.hostPort 与 fixture().webHostPort 保持一致。
 * ```
 */
async function startRemotePortForwarders(signal: AbortSignal): Promise<void> {
  const forwarder = String.raw`
import asyncio, json, sys

async def copy(reader, writer):
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (OSError, ConnectionError):
        pass
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except (OSError, ConnectionError):
            pass

async def forward(reader, writer, target):
    try:
        upstream, output = await asyncio.open_connection('127.0.0.1', target)
        await asyncio.gather(copy(reader, output), copy(upstream, writer))
    except (OSError, ConnectionError):
        writer.close()

async def main():
    servers = []
    for source, target in json.loads(sys.argv[1]):
        servers.append(await asyncio.start_server(
            lambda reader, writer, target=target: forward(reader, writer, target),
            '0.0.0.0', source))
    await asyncio.gather(*(server.serve_forever() for server in servers))

asyncio.run(main())
`
  const launcher = String.raw`
import json, socket, subprocess, sys, time
pairs = json.loads(sys.argv[2])
entries = {source for source, target in pairs}
if any(target in entries for source, target in pairs):
    raise RuntimeError('Engine-assigned ports overlap fixture entry ports')
process = subprocess.Popen([sys.executable, '-u', '-c', sys.argv[1], sys.argv[2]],
    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    start_new_session=True)
deadline = time.monotonic() + 5
for source, target in pairs:
    while True:
        if process.poll() is not None:
            raise RuntimeError('Fixture TCP forwarder exited before readiness')
        try:
            with socket.create_connection(('127.0.0.1', source), timeout=0.2):
                break
        except OSError:
            if time.monotonic() >= deadline:
                raise RuntimeError('Fixture TCP forwarder did not start')
            time.sleep(0.05)
`
  const ports = [[DEPLOY_FIXTURE_WEB_PORT, fixture().webHostPort], [DEPLOY_FIXTURE_API_PORT, fixture().apiHostPort]]
  await executeDeployTestFixture(runtime!, fixture(), ['python', '-c', launcher, forwarder, JSON.stringify(ports)], { timeoutMs: 15_000, signal, stage: 'http-port-forwarder' })
}
const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'] as const
const originalProxies = new Map<string, string | undefined>()

interface DeploymentCommands extends DeployTestCommands {
  fetch: typeof globalThis.fetch
  sleep: (ms: number) => Promise<void>
}

const activeCommands = new Set<() => Promise<void>>()
let fixtureBlocked = false

function interruptedCommand(error: unknown): boolean {
  return error instanceof DeployTestCommandError
    ? error.reason === 'timeout' || error.reason === 'abort' || error.reason === 'output-limit' || error.localTermination === 'unknown'
    : error instanceof AggregateError && error.errors.some(interruptedCommand)
}

/** 工作取消早于外层期限；Vitest 取消时也等待同一回收，不与后续用例或目录删除竞态。 */
async function withCommands(timeoutMs: number, body: (commands: DeploymentCommands) => Promise<void>, context?: TestContext): Promise<void> {
  if (fixtureBlocked) {
    context?.skip('Previous deployment was cancelled or its exit was unconfirmed; fixture is blocked until owned-ID cleanup')
    throw new Error('Deployment fixture is blocked until owned-ID cleanup')
  }
  const scope = createDeployTestCommands({ timeoutMs, signal: context?.signal })
  let finishing = false
  scope.signal.addEventListener('abort', () => {
    if (!finishing)
      fixtureBlocked = true
  }, { once: true })
  let bodyFinished = false
  let bodyTask: Promise<void>
  const close = async (): Promise<void> => {
    finishing = true
    try {
      await scope.close()
      if (!bodyFinished) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Deployment test body did not stop after cancellation')), 10_000)
          void bodyTask.then(() => {
            clearTimeout(timer)
            resolve()
          }, () => {
            clearTimeout(timer)
            resolve()
          })
        })
      }
      activeCommands.delete(close)
    }
    catch (error) {
      fixtureBlocked = true
      throw error
    }
  }
  activeCommands.add(close)
  context?.onTestFinished(close, 25_000)
  bodyTask = body({
    ...scope,
    fetch: (input, init) => globalThis.fetch(input, { ...init, signal: AbortSignal.any([scope.signal, AbortSignal.timeout(10_000), ...(init?.signal ? [init.signal] : [])]) }),
    sleep: ms => delay(ms, undefined, { signal: scope.signal }),
  }).finally(() => { bodyFinished = true })
  let failure: unknown
  try {
    await bodyTask
    scope.signal.throwIfAborted()
  }
  catch (error) {
    failure = error
    fixtureBlocked ||= scope.signal.aborted || interruptedCommand(error)
  }
  try {
    await close()
  }
  catch (error) {
    throw failure ? new AggregateError([failure, error], 'Deployment failed and command cleanup was not confirmed') : error
  }
  if (failure)
    throw failure
}

/** 两个真实 SDK 部署均进入相同受管进程；SDK 无 signal 的阶段也受用例预算约束。 */
async function runSdkDeployment(commands: DeployTestCommands, options: { config: DeployConfigInput, service: string, artifactDir: string, project: string }): Promise<void> {
  try {
    await commands.run(process.execPath, [fileURLToPath(new URL('./helpers/deploy-test-sdk.mjs', import.meta.url)), JSON.stringify({ config: options.config, service: options.service, artifactDir: options.artifactDir, runtime })], options.project)
  }
  catch (error) {
    if (error instanceof DeployTestCommandError && error.exitCode === 76)
      fixtureBlocked = true
    throw error
  }
}

/** 调用当前 pnpm 的可执行文件或 JS 入口，真实验证项目 scripts 与 CLI 参数解析。 */
async function runPnpm(commands: DeployTestCommands, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const entry = process.env.npm_execpath
  if (!entry)
    throw new Error('Run this test through pnpm')
  return await (/\.[cm]?js$/i.test(entry) ? commands.run(process.execPath, [entry, ...args], cwd, env) : commands.run(entry, args, cwd, env))
}

/** 只读取实际交付 tar，不依赖打包后已清除的外层私有配置。 */
function readDeliveryFile(directory: string, name: string): string {
  const archives = readdirSync(directory).filter(file => file.endsWith('.tar'))
  if (archives.length !== 1)
    throw new Error('Expected one deployment archive')
  try {
    return execFileSync('tar', ['-xOf', path.join(directory, archives[0]!), `./${name}`], { encoding: 'utf8', timeout: 10_000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
  }
  catch {
    // 不把可能包含私有环境的命令输出拼入异常。
    throw new Error(`Cannot read deployment archive entry: ${name}`)
  }
}

/**
 * 浏览器访问本轮 SSH 服务器上的 Web/API，并在私有工程回收后保留验收证据。
 * @param commands - 当前用例的期限与取消作用域。
 * @param metadata - 部署元数据的预期值。
 * @param metadata.name - 预期的应用名称。
 * @param metadata.version - 预期的已部署版本。
 * @param metadata.env - 预期的运行环境。
 * @param project - 本轮生成并已部署的工程路径，默认使用 appDir。
 * @returns 验收成功后返回。
 * @throws 浏览器验收或证据持久化失败时抛错。
 * @example
 * ```ts
 * await verifyDeployedBrowser(commands, { name: 'Acceptance app', version: '2.4.6', env: 'test' }, appDir)
 * ```
 */
async function verifyDeployedBrowser(commands: DeployTestCommands, metadata: { name: string, version: string, env: string }, project = appDir): Promise<void> {
  const local = parseEnv(readFileSync(path.join(project, '.env.test'), 'utf8'))
  const parent = path.resolve(process.env.HAI_AUTH_EVIDENCE_DIR || fileURLToPath(new URL('../../../tmp/validation/module-review/deploy-browser/', import.meta.url)))
  mkdirSync(parent, { recursive: true })
  const evidence = mkdtempSync(path.join(parent, `${RUN_ID}-${path.basename(project)}-`))
  const env = {
    HAI_CORE_NAME: metadata.name,
    HAI_CORE_VERSION: metadata.version,
    HAI_CORE_ENV: metadata.env,
    E2E_ADMIN_PASSWORD: local.HAI_ADMIN_DEFAULT_PASSWORD,
    E2E_AUDIT_ADMIN_PASSWORD: local.HAI_AUDIT_ADMIN_PASSWORD,
    E2E_CONFIG_ADMIN_PASSWORD: local.HAI_CONFIG_ADMIN_PASSWORD,
    E2E_BUSINESS_OPERATOR_PASSWORD: local.HAI_BUSINESS_OPERATOR_PASSWORD,
    SERVICE_BASE_URL: `http://127.0.0.1:${fixture().webHostPort}`,
    PUBLIC_API_BASE: '',
    BASE_URL: `http://127.0.0.1:${fixture().webHostPort}`,
    HAI_AUTH_EVIDENCE_DIR: evidence,
    HAI_E2E_DATA_ROOT: path.join(workDir, 'browser-data'),
    ...(process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || process.env.PLAYWRIGHT_HTML_REPORT ? {} : { PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(evidence, 'html') }),
  }
  writeFileSync(path.join(project, 'playwright.deploy.config.ts'), `import config from './playwright.config.js'\nexport default { ...config, webServer: [] }\n`)
  try {
    const output = await runPnpm(commands, ['exec', 'playwright', 'test', '--config', 'playwright.deploy.config.ts', '--output', path.join(evidence, 'results')], project, env)
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
function prepareBaseImages(rt: 'podman' | 'docker', deadline: number): void {
  for (const img of BASE_IMAGES) {
    ensureDeployTestBaseImage(rt, img, deadline - Date.now(), REGISTRY_MIRROR)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 轮询等待 sshd 就绪。 */
async function waitForSsh(setupDeadline: number): Promise<void> {
  const deadline = Math.min(Date.now() + 120_000, setupDeadline)
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
      ], { stdio: 'ignore', windowsHide: true, timeout: Math.max(1, Math.min(10_000, deadline - Date.now())) })
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
    // 600s 总准备期限早于 900s hook，余量覆盖 SSH 就绪与按 ID 终止/核验。
    const deadline = Date.now() + 600_000
    const signal = AbortSignal.timeout(600_000)
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
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', keyPath], { windowsHide: true, timeout: 10_000, stdio: 'ignore' })
    const publicKey = readFileSync(`${keyPath}.pub`, 'utf-8').trim()

    // 2. 准备固定公共基础镜像；不通过 host build 启动无拥有权账本的后台 builder。
    prepareBaseImages(rt, deadline)
    if (APT_MIRROR && !/^[a-z0-9.-]+$/i.test(APT_MIRROR))
      throw new Error('Expected an APT mirror hostname')
    // 3. 先登记 create 的 ID，再在其私有 PID namespace 内安装；任何准备失败按 ID 停全树。
    fixtureContext = await createDeployTestFixture(rt, 'python:3.11.17-slim-trixie', publicKey, workDir, RUN_ID, {
      command: ['sleep', 'infinity'],
      nestedRuntime: true,
      timeoutMs: deadline - Date.now(),
      signal,
      prepare: async (fixture, signal) => {
        await executeDeployTestFixture(rt, fixture, ['sh', '-ec', `${APT_SOURCES_FIX}sed -i 's#http://#https://#g' /etc/apt/sources.list.d/debian.sources; apt-get -o Acquire::Retries=3 -o Acquire::https::Timeout=20 -o APT::Update::Error-Mode=any update`], { timeoutMs: 180_000, signal, stage: 'apt-update' })
        await executeDeployTestFixture(rt, fixture, ['apt-get', '-o', 'Acquire::Retries=3', '-o', 'Acquire::https::Timeout=20', 'install', '-y', '--no-install-recommends', 'curl', 'openssh-server', 'podman', 'uidmap', 'fuse-overlayfs', 'nftables', 'iptables', 'aardvark-dns', 'util-linux'], { timeoutMs: 360_000, signal, stage: 'apt-install' })
        await executeDeployTestFixture(rt, fixture, ['pip', 'install', '--no-cache-dir', 'podman-compose==1.6.0'], { timeoutMs: 120_000, signal, stage: 'pip' })
        await executeDeployTestFixture(rt, fixture, ['sh', '-ec', `rm -rf /var/lib/apt/lists/*; ssh-keygen -A; mkdir -p /run/sshd /root/.ssh /etc/containers; chmod 700 /root/.ssh; printf '%s\\n' "$AUTHORIZED_KEY" > /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; printf '\\nPermitRootLogin prohibit-password\\nPasswordAuthentication no\\n' >> /etc/ssh/sshd_config; printf '[containers]\\ncgroups = "disabled"\\n[engine]\\ncgroup_manager = "cgroupfs"\\nevents_logger = "file"\\n' > /etc/containers/containers.conf; /usr/sbin/sshd`], { timeoutMs: 30_000, signal, stage: 'sshd' })
        // 真实解析刚写入的 TOML 并启动嵌套运行时，不能以 shell 语法检查代替。
        await executeDeployTestFixture(rt, fixture, ['podman', 'info', '--format', '{{.Host.Arch}}'], { timeoutMs: 30_000, signal, stage: 'nested-runtime' })
      },
    })

    remoteWebPort = fixture().webHostPort
    remoteApiPort = fixture().apiHostPort
    await startRemotePortForwarders(signal)

    // 4. 等待 sshd 就绪
    await waitForSsh(deadline + 120_000)
    // 离线策略本身先通过原生解析与拒绝拉取验证，不能把配置错误误当作部署失败。
    const offlinePolicy = String.raw`mkdir -p /etc/containers/registries.conf.d
printf '%s\n' '[[registry]]' 'prefix = "docker.io"' 'location = "docker.io"' 'blocked = true' '[[registry]]' 'prefix = "ghcr.io"' 'location = "ghcr.io"' 'blocked = true' > /etc/containers/registries.conf.d/offline.conf
podman info --format '{{.Host.ServiceIsRemote}}' >/dev/null
for registry in docker.io ghcr.io; do
  if rejection=$(HTTP_PROXY=http://127.0.0.1:1 HTTPS_PROXY=http://127.0.0.1:1 http_proxy=http://127.0.0.1:1 https_proxy=http://127.0.0.1:1 NO_PROXY= no_proxy= LC_ALL=C podman pull --retry=0 "$registry/hai-deploy-e2e/offline-policy:never" 2>&1); then
    printf 'Offline policy unexpectedly allowed an image pull.\n' >&2
    exit 1
  fi
  case "$rejection" in *' is blocked in '*) ;; *) printf 'Offline registry policy did not explicitly reject the image.\n' >&2; exit 1;; esac
done`
    await executeDeployTestFixture(rt, fixture(), ['sh', '-ec', offlinePolicy], { timeoutMs: 10_000, signal: AbortSignal.timeout(Math.max(1, deadline + 120_000 - Date.now())), stage: 'nested-runtime' })
  }, 900_000)

  afterAll(async () => {
    const failures: DeployFixtureCleanupFailure[] = []
    let localCommandsStopped = true
    for (const close of activeCommands) {
      try {
        await close()
      }
      catch (error) {
        localCommandsStopped = false
        failures.push({ stage: 'temporary-directory-remove', error })
      }
    }
    const report = createDeployFixtureCleanupReport(RUN_ID, fixtureContext ? [fixtureContext] : [], testImages.values())
    // 关闭失败不能跳过资源回收；本地命令未确认停止时不与其竞争删除工程。
    try {
      await crypto.close()
    }
    catch (error) { failures.push({ stage: 'crypto-close', error }) }
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
      if (workDir && localCommandsStopped)
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
    beforeAll(() => withCommands(900_000, async (commands) => {
      const rt = runtime as 'podman' | 'docker'
      // 5. 用实际 fullstack 模板及本次源码包验证环境选择、配置写入、服务启动与重复部署。
      if (NPM_MIRROR)
        process.env.pnpm_config_registry = NPM_MIRROR
      await createProject({
        name: 'e2e-fullstack',
        appType: 'fullstack',
        frontends: ['web'],
        install: false,
        packageManager: 'pnpm', // 生成 pnpm-lock.yaml，供容器 Dockerfile 的 pnpm fetch 使用
        git: false,
        defaults: true,
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
      await runPnpm(commands, ['install'], appDir)
      // 浏览器测试的 Node 侧导入应用 contract；只编译测试客户端契约，不启动本地 API/Web。
      await runPnpm(commands, ['--filter', 'e2e-fullstack-contract', 'build'], appDir)
      expect(readdirSync(path.join(appDir, 'node_modules', '@h-ai'))).toContain('ai')
      expect(readdirSync(path.join(appDir, 'node_modules', '@h-ai'))).toContain('deploy')
      expect(readdirSync(path.join(appDir, 'node_modules'))).toContain('onnxruntime-node')
      // 受限网络：调整生成应用的 Dockerfile —— 去掉 syntax 指令（避免 BuildKit 从 docker.io
      // 拉取前端镜像；内置 frontend 已支持 RUN --mount=type=cache），并在构建阶段注入 npm 镜像
      // （.npmrc 在 pnpm fetch 前尚未 COPY，故用 ENV pnpm_config_registry）
      for (const name of ['serv', 'web']) {
        const dfPath = path.join(appDir, `images/${name}.Dockerfile`)
        let dockerfile = readFileSync(dfPath, 'utf-8')
        if (NPM_MIRROR)
          dockerfile = dockerfile.replace(/(FROM [^\n]+ AS build\r?\n)/g, `$1ENV pnpm_config_registry=${NPM_MIRROR}\n`)
        writeFileSync(dfPath, dockerfile)
      }
      const serviceDir = path.join(appDir, 'packages/e2e-fullstack-serv')
      writeFileSync(path.join(serviceDir, 'config/_cache.yml'), 'type: redis\n')
      writeFileSync(path.join(serviceDir, 'config/_storage.yml'), 'type: s3\n')
      // 部署后浏览器复用 managed Playwright 的安全场景；显式启用相同前置，不改变生产默认。
      const browserSecurityProfile = [
        'HAI_IAM_PASSWORD_PREVENTSAMEPASSWORD=true',
        'HAI_IAM_CAPTCHA_ENABLED=true',
        'HAI_IAM_CAPTCHA_COST=100',
        'HAI_IAM_CAPTCHA_MAXCOUNTER=2',
        'HAI_IAM_INITIALCREDENTIALS_ENABLED=true',
        'HAI_IAM_REAUTHENTICATION_ENABLED=true',
        'HAI_IAM_REAUTHENTICATION_OPERATIONS=["iam.users.invite","audit.backup"]',
        'HAI_AUDIT_BACKUP_ENABLED=true',
      ].join('\n')
      writeFileSync(path.join(appDir, '.env.test'), `${readFileSync(path.join(appDir, '.env.test'), 'utf8')}\nHAI_E2E=1\n${browserSecurityProfile}\nHAI_DB_TYPE=postgresql\nHAI_CACHE_TYPE=memory\nHAI_STORAGE_TYPE=local\nHAI_CACHE='{"type":"redis"}'\nHAI_STORAGE='{"type":"s3"}'\n`)
      const deployConfig = {
        provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', port: fixture().sshHostPort, username: 'root', identityFile: keyPath, knownHostsFile: knownHostsPath, strictHostKeyChecking: false }, remote: { baseDir: '/opt/hai/apps with spaces', runtime: 'podman' }, expose: { type: 'port', containerPort: 3000, hostPort: remoteWebPort } },
        container: { s3Engine: 'rustfs' },
      }
      writeFileSync(path.join(appDir, '.env.local'), `${readFileSync(path.join(appDir, '.env.local'), 'utf8')}\nHAI_DEPLOY_PROVIDER='${JSON.stringify(deployConfig.provider)}'\n`)
      writeFileSync(path.join(appDir, 'hai.json'), JSON.stringify({ ...JSON.parse(readFileSync(path.join(appDir, 'hai.json'), 'utf8')), deploy: deployConfig }, null, 2))
      await runPnpm(commands, ['run', 'build', '--target', 'docker', '--runtime', runtime ?? 'auto', ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy']), ...(SQLITE_MIRROR ? ['--sqlite-prebuild-mirror', SQLITE_MIRROR] : [])], appDir, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
      const buildId = readFileSync(path.join(appDir, '.hai/build/docker/latest'), 'utf8').trim()
      const artifact = JSON.parse(readFileSync(path.join(appDir, '.hai/build/docker', buildId, 'manifest.json'), 'utf8')) as DeploymentArtifact
      expect(artifact).toMatchObject({ version: 4, primaryService: 'serv', appVersion: APPLICATION_VERSION })
      expect(artifact.images.map(image => image.file)).toEqual([`serv-${APPLICATION_VERSION}.tar`, `web-${APPLICATION_VERSION}.tar`])
      for (const image of artifact.images) {
        testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
        const imageEnv = JSON.parse((await commands.run(rt, ['image', 'inspect', '--format', '{{json .Config.Env}}', image.imageRef]))) as string[]
        expect(imageEnv.some(value => /^(?:https?|ftp)_proxy=/i.test(value))).toBe(false)
      }
    }), 900_000)

    it('fullstack CLI 环境部署、登录和保持不变的重复部署均可用', context => withCommands(1_200_000, async (commands) => {
      expect((await crypto.init()).success).toBe(true)
      let metadata: { name: string, version: string, env: string } | undefined
      const candidateDigests = new Set<string>()
      let serverStateDigest: string | undefined
      for (let attempt = 0; attempt < 3; attempt++) {
        const deploymentRoot = path.join(appDir, '.hai/deploy/test')
        const previousDeliveries = new Set(existsSync(deploymentRoot) ? readdirSync(deploymentRoot) : [])
        const output = await runPnpm(commands, ['run', 'deploy', '--env', 'test', '--yes', ...(attempt > 0 ? ['--skip-middleware'] : []), ...(attempt === 1 ? ['--bundle-only', '--output', path.join(workDir, 'manual-test.tar')] : [])], appDir)
        expect(output).toContain('HAI_ADMIN_DEFAULT_PASSWORD')
        // 按本次实际创建的目录定位文件，不读取旧外层文件，也不猜测最新部署。
        let deliveryDirectory = path.join(workDir, `manual-test-${APPLICATION_VERSION}`)
        if (attempt !== 1) {
          const created = readdirSync(deploymentRoot).filter(name => !previousDeliveries.has(name))
          expect(created).toHaveLength(1)
          deliveryDirectory = path.join(deploymentRoot, created[0]!)
        }
        if (attempt === 1) {
          // 模拟无 SSH 的手工搬运：复制一个完整交付目录，再用本地入口解包与部署。
          const manualArchive = `manual-test-${APPLICATION_VERSION}.tar`
          const manualDirectory = `manual-test-${APPLICATION_VERSION}`
          expect(existsSync(path.join(workDir, manualDirectory, manualArchive))).toBe(true)
          await commands.run(runtime!, ['cp', path.join(workDir, manualDirectory), `${fixture().containerId}:/tmp/${manualDirectory}`])
          await commands.run(runtime!, ['exec', fixture().containerId, 'sh', '-c', `sh '/tmp/${manualDirectory}/deploy-local.sh' '/opt/hai/apps with spaces/e2e-fullstack-test'`])
          const second = path.join(workDir, 'script-test.tar')
          await runPnpm(commands, ['run', 'deploy', '--env', 'test', '--yes', '--skip-middleware', '--bundle-only', '--output', second], appDir)
          if (process.platform === 'win32')
            await commands.run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(workDir, `script-test-${APPLICATION_VERSION}/deploy.ps1`)])
          const shellPackage = 'shell-script-test'
          await runPnpm(commands, ['run', 'deploy', '--env', 'test', '--yes', '--skip-middleware', '--bundle-only', '--output', path.join(workDir, `${shellPackage}.tar`)], appDir)
          await commands.run(runtime!, ['cp', path.join(workDir, `${shellPackage}-${APPLICATION_VERSION}`), `${fixture().containerId}:/tmp/`])
          await commands.run(runtime!, ['cp', keyPath, `${fixture().containerId}:/tmp/hai-script-key`])
          await commands.run(runtime!, ['exec', fixture().containerId, 'sh', '-c', `chmod 600 /tmp/hai-script-key && HAI_DEPLOY_IDENTITY_FILE=/tmp/hai-script-key HAI_DEPLOY_KNOWN_HOSTS_FILE=/dev/null sh '/tmp/${shellPackage}-${APPLICATION_VERSION}/deploy.sh' 127.0.0.1 22 root`])
          for (let probe = 0; probe < 40; probe++) {
            if ((await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/health`).catch(() => null))?.ok)
              break
            await commands.sleep(3000)
          }
        }
        const response = await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/health`, { signal: AbortSignal.timeout(10_000) })
        expect(response.ok).toBe(true)
        const web = await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/`)
        expect(web.headers.get('content-type')).toContain('text/html')
        expect(await web.text()).toContain('runtime-config.js')
        expect((await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/_hai/web-health`)).ok).toBe(true)
        const client = crypto.transport.createClient({ keyExchangeUrl: `http://127.0.0.1:${fixture().webHostPort}/api/v1/_hai/key-exchange`, fetch: (input, init) => commands.fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) })
        try {
          const info = await client.encryptedFetch(`http://127.0.0.1:${fixture().webHostPort}/api/v1/app/info`, { method: 'POST' })
          const details = await info.json() as { success: boolean, data: { name: string, version: string, env: string } }
          expect(details).toMatchObject({ success: true, data: { env: 'test' } })
          metadata = details.data
          const local = parseEnv(readFileSync(path.join(appDir, '.env.test'), 'utf8'))
          const runtimeEnv = parseEnv(readDeliveryFile(deliveryDirectory, '.env.runtime'))
          // 每次打包都没有本机稳定密码缓存，模拟换电脑；服务器状态与数据库数据必须保持。
          const candidateDigest = createHash('sha256').update(readDeliveryFile(deliveryDirectory, 'managed-candidates.env')).digest('hex')
          expect(candidateDigests.has(candidateDigest)).toBe(false)
          candidateDigests.add(candidateDigest)
          const digest = (await commands.run(runtime!, ['exec', fixture().containerId, 'sha256sum', '/opt/hai/apps with spaces/e2e-fullstack-test/managed-secrets.env'])).split(' ')[0]!
          if (serverStateDigest)
            expect(digest).toBe(serverStateDigest)
          serverStateDigest = digest
          const sql = attempt === 0
            ? 'CREATE TABLE deployment_password_probe (note text); INSERT INTO deployment_password_probe VALUES (\'retained-across-packagers\'); SELECT note FROM deployment_password_probe;'
            : 'SELECT note FROM deployment_password_probe;'
          const persisted = await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'exec', 'hai-e2e-fullstack-test-db', 'sh', '-ec', 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U hai -d hai -Atc "$1"', 'probe', sql])
          expect(persisted).toContain('retained-across-packagers')
          expect(runtimeEnv.HAI_CACHE_TYPE).toBeUndefined()
          expect(runtimeEnv.HAI_STORAGE_TYPE).toBeUndefined()
          expect(JSON.parse(runtimeEnv.HAI_DB!).type).toBe('postgresql')
          expect(JSON.parse(runtimeEnv.HAI_CACHE!).type).toBe('redis')
          expect(JSON.parse(runtimeEnv.HAI_STORAGE!).type).toBe('s3')
          expect(runtimeEnv.HAI_CRYPTO_TRANSPORT_SERVERKEYRING === local.HAI_CRYPTO_TRANSPORT_SERVERKEYRING).toBe(true)
          expect(runtimeEnv.HAI_ADMIN_DEFAULT_PASSWORD === local.HAI_ADMIN_DEFAULT_PASSWORD).toBe(true)
          for (const service of ['db', 'cache', 'storage'])
            expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.State.Health.Status}}', `hai-e2e-fullstack-test-${service}`])).trim()).toBe('healthy')
          expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.RestartCount}}', 'hai-e2e-fullstack-test-serv'])).trim()).toBe('0')
          const loginUrl = `http://127.0.0.1:${fixture().webHostPort}/api/v1/auth/login`
          const noProof = await client.encryptedFetch(loginUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'admin', password: local.HAI_ADMIN_DEFAULT_PASSWORD }) })
          const rejected = await noProof.json() as HaiResult<unknown>
          expect(rejected.success).toBe(false)
          if (!rejected.success)
            expect(rejected.error.code).toBe('hai:iam:030')
          const captchaResponse = await client.encryptedFetch(`http://127.0.0.1:${fixture().webHostPort}/api/v1/auth/captcha`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'login' }) })
          const challenge = await captchaResponse.json() as HaiResult<IamCaptchaChallenge>
          expect(challenge.success).toBe(true)
          if (!challenge.success)
            throw new Error('Deployed login captcha challenge was not created')
          // 官方求解器接收 controller；同时绑定本轮取消和独立求解期限，结束后释放监听器。
          const captchaController = new AbortController()
          const abortCaptcha = () => captchaController.abort(commands.signal.reason)
          commands.signal.addEventListener('abort', abortCaptcha, { once: true })
          const captchaDeadline = setTimeout(() => captchaController.abort(new Error('Login captcha solver deadline exceeded')), 5000)
          let captcha: string
          try {
            commands.signal.throwIfAborted()
            const solution = await solveChallenge({ challenge: challenge.data.challenge, deriveKey: pbkdf2.deriveKey, controller: captchaController, timeout: 5000 })
            captchaController.signal.throwIfAborted()
            expect(solution).not.toBeNull()
            if (!solution)
              throw new Error('Deployed login captcha challenge was not solved')
            captcha = JSON.stringify({ id: challenge.data.id, solution })
          }
          finally {
            clearTimeout(captchaDeadline)
            commands.signal.removeEventListener('abort', abortCaptcha)
          }
          const login = await client.encryptedFetch(loginUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'admin', password: local.HAI_ADMIN_DEFAULT_PASSWORD, captcha }) })
          expect(await login.json()).toMatchObject({ success: true })
          const compose = JSON.parse(readDeliveryFile(deliveryDirectory, 'compose.json'))
          expect(compose['x-hai-version']).toBe(APPLICATION_VERSION)
          expect(compose.services.serv.ports).toBeUndefined()
          expect(compose.services.web.ports).toEqual([`${remoteWebPort}:8080`])
          expect(compose.services.web.env_file).toBeUndefined()
          expect(readFileSync(path.join(appDir, '.env.local'), 'utf8')).not.toContain(String(local.HAI_ADMIN_DEFAULT_PASSWORD))
        }
        finally {
          client.destroy()
        }
      }
      expect(metadata).toBeDefined()
      if (metadata)
        await verifyDeployedBrowser(commands, metadata)
      // 可选人工视觉复核；截图留在独立证据根目录，工程和密钥仍由 afterAll 清理。
      if (process.env.HAI_DEPLOY_E2E_REVIEW === '1') {
        process.stdout.write(`Review screenshots: ${process.env.HAI_AUTH_EVIDENCE_DIR || fileURLToPath(new URL('../../../tmp/validation/module-review/deploy-browser/', import.meta.url))}\n`)
        await commands.sleep(60_000)
      }
    }, context), 1_200_000)

    it('同版本 Web/API/storage 增量更新保留未选容器，损坏制品不部署，启动失败恢复上一成功版本', context => withCommands(900_000, async (commands) => {
      const before = (await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-serv'])).trim()
      writeFileSync(path.join(appDir, 'apps/e2e-fullstack-web/public/deployment-marker.txt'), 'incremental-web')
      await runPnpm(commands, ['run', 'build', '--target', 'docker', '--images', 'web', '--runtime', runtime!, ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy'])], appDir, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
      const buildId = readFileSync(path.join(appDir, '.hai/build/docker/latest'), 'utf8').trim()
      const artifacts = path.join(appDir, '.hai/build/docker', buildId)
      const manifest = JSON.parse(readFileSync(path.join(artifacts, 'manifest.json'), 'utf8')) as DeploymentArtifact
      expect(manifest).toMatchObject({ appVersion: APPLICATION_VERSION, partial: true, hasWeb: true, images: [{ name: 'web' }] })
      for (const image of manifest.images) testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
      await runPnpm(commands, ['run', 'deploy', '--env', 'test', '--services', 'web', '--yes'], appDir)
      expect(await (await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/deployment-marker.txt`)).text()).toBe('incremental-web')
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-serv'])).trim()).toBe(before)
      // 模拟 compose down：移除本轮基线容器并保留数据卷，Web 增量应自动恢复应用与依赖。
      await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'rm', '-f', ...['web', 'serv', 'db', 'cache', 'storage'].map(service => `hai-e2e-fullstack-test-${service}`)])
      await runPnpm(commands, ['run', 'deploy', '--env', 'test', '--services', 'web', '--yes'], appDir)
      expect((await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/health`)).ok).toBe(true)
      const recoveredApp = (await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-serv'])).trim()
      expect(recoveredApp).not.toBe(before)
      writeFileSync(path.join(artifacts, manifest.images[0]!.file), 'damaged archive')
      await expect(runPnpm(commands, ['run', 'deploy', '--env', 'test', '--services', 'web', '--yes'], appDir)).rejects.toThrow()
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-serv'])).trim()).toBe(recoveredApp)
      // API 单独更新后 Nginx 必须重新解析后端地址，同时保持 Web 容器和页面不变。
      const webBefore = (await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-web'])).trim()
      await runPnpm(commands, ['run', 'build', '--target', 'docker', '--images', 'serv', '--runtime', runtime!, ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy']), ...(SQLITE_MIRROR ? ['--sqlite-prebuild-mirror', SQLITE_MIRROR] : [])], appDir, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
      const apiBuildId = readFileSync(path.join(appDir, '.hai/build/docker/latest'), 'utf8').trim()
      const apiManifest = JSON.parse(readFileSync(path.join(appDir, '.hai/build/docker', apiBuildId, 'manifest.json'), 'utf8')) as DeploymentArtifact
      expect(apiManifest).toMatchObject({ appVersion: APPLICATION_VERSION, partial: true, hasWeb: true, images: [{ name: 'serv' }] })
      for (const image of apiManifest.images) testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
      await runPnpm(commands, ['run', 'deploy', '--env', 'test', '--services', 'serv', '--yes'], appDir)
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-serv'])).trim()).not.toBe(before)
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-web'])).trim()).toBe(webBefore)
      expect((await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/health`)).ok).toBe(true)
      expect(await (await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/deployment-marker.txt`)).text()).toBe('incremental-web')
      const appBeforeStorage = (await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-serv'])).trim()
      await runPnpm(commands, ['run', 'deploy', '--env', 'test', '--services', 'storage', '--yes'], appDir)
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-serv'])).trim()).toBe(appBeforeStorage)
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-web'])).trim()).toBe(webBefore)
      expect((await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/health`)).ok).toBe(true)

      // 故意交付无法启动的同版本 Web，验证服务器真正恢复镜像与上一次成功状态。
      const deploymentDirectory = '/opt/hai/apps with spaces/e2e-fullstack-test'
      const successfulRelease = (await commands.run(runtime!, ['exec', fixture().containerId, 'cat', `${deploymentDirectory}/current`])).trim()
      const successfulWebImage = (await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Image}}', 'hai-e2e-fullstack-test-web'])).trim()
      const webDockerfile = path.join(appDir, 'images/web.Dockerfile')
      writeFileSync(webDockerfile, `${readFileSync(webDockerfile, 'utf8')}\nCMD ["sh", "-c", "exit 1"]\n`)
      await runPnpm(commands, ['run', 'build', '--target', 'docker', '--images', 'web', '--runtime', runtime!, ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy'])], appDir, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
      const failedBuildId = readFileSync(path.join(appDir, '.hai/build/docker/latest'), 'utf8').trim()
      const failedManifest = JSON.parse(readFileSync(path.join(appDir, '.hai/build/docker', failedBuildId, 'manifest.json'), 'utf8')) as DeploymentArtifact
      expect(failedManifest).toMatchObject({ appVersion: APPLICATION_VERSION, partial: true, images: [{ name: 'web' }] })
      for (const image of failedManifest.images) testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
      await expect(runPnpm(commands, ['run', 'deploy', '--env', 'test', '--services', 'web', '--yes'], appDir)).rejects.toThrow()
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'cat', `${deploymentDirectory}/current`])).trim()).toBe(successfulRelease)
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Image}}', 'hai-e2e-fullstack-test-web'])).trim()).toBe(successfulWebImage)
      expect((await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'inspect', '--format', '{{.Id}}', 'hai-e2e-fullstack-test-serv'])).trim()).toBe(appBeforeStorage)
      const results = (await commands.run(runtime!, ['exec', fixture().containerId, 'sh', '-c', `cat '${deploymentDirectory}'/result-*.json`])).trim().split('\n').map(line => JSON.parse(line) as { stage: string, exitCode: number })
      expect(results).toContainEqual(expect.objectContaining({ stage: 'health', exitCode: 1 }))
      for (let attempt = 0; attempt < 40; attempt++) {
        if ((await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/health`).catch(() => null))?.ok)
          break
        await commands.sleep(1000)
      }
      expect((await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/health`)).ok).toBe(true)
      expect(await (await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}/deployment-marker.txt`)).text()).toBe('incremental-web')
    }, context), 900_000)
  })

  // admin/website/h5 复用同一 SSR Dockerfile 与部署分支；逐模板差异由八个 scaffold 场景验收。
  it.for<AppType>(['api', 'admin', 'mobile-app'])('%s 运行形态能真实构建、生成离线包并在隔离服务器启动', { timeout: 1_200_000 }, (appType, context) => withCommands(1_200_000, async (commands) => {
    // 内层引擎存储独占且不挂宿主 engine/socket/storage；只在本轮已记录外层 ID 内释放上一场景。
    await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'rm', '-af'])
    const name = `delivery-${appType}`
    await createProject({ name, appType, defaults: true, install: false, git: false, packageManager: 'pnpm', cwd: workDir })
    const project = path.join(workDir, name)
    useLocalPackages(project)
    // 本轮测试配置显式允许隔离本地状态；生产环境文件和共享状态守卫保持不变。
    const fixtureEnvironment = path.join(project, appType === 'api' ? `apps/${name}-serv/.env.test` : '.env.test')
    writeFileSync(fixtureEnvironment, `${readFileSync(fixtureEnvironment, 'utf8')}\nHAI_E2E=1\nHAI_DB='{"type":"sqlite","database":"/app/data/e2e.db"}'\nHAI_CACHE='{"type":"memory"}'\nHAI_STORAGE='{"type":"local","root":"/app/data/uploads"}'\n`)
    await runPnpm(commands, ['install', '--prefer-offline'], project)
    const dockerfilePath = path.join(project, appType === 'api' ? 'images/serv.Dockerfile' : 'images/web.Dockerfile')
    if (NPM_MIRROR)
      writeFileSync(dockerfilePath, readFileSync(dockerfilePath, 'utf8').replace(/(FROM [^\n]+ AS build\r?\n)/g, `$1ENV pnpm_config_registry=${NPM_MIRROR}\n`))
    await runPnpm(commands, [...(appType === 'api' ? ['run', 'deploy', '--env', 'test', '--yes', '--build', '--bundle-only'] : ['run', 'build', '--target', 'docker']), '--runtime', runtime!, ...(CONTAINER_NETWORK ? ['--network', CONTAINER_NETWORK] : []), ...(CONTAINER_PROXY ? [] : ['--no-http-proxy']), ...(SQLITE_MIRROR ? ['--sqlite-prebuild-mirror', SQLITE_MIRROR] : [])], project, CONTAINER_PROXY ? { HTTP_PROXY: CONTAINER_PROXY, HTTPS_PROXY: CONTAINER_PROXY } : undefined)
    const buildId = readFileSync(path.join(project, '.hai/build/docker/latest'), 'utf8').trim()
    const artifactDir = path.join(project, '.hai/build/docker', buildId)
    const artifact = JSON.parse(readFileSync(path.join(artifactDir, 'manifest.json'), 'utf8')) as DeploymentArtifact
    for (const image of artifact.images) testImages.set(image.imageRef, recordDeployTestImage(runtime!, image.imageRef))
    if (appType === 'mobile-app') {
      // 独立移动前端使用同一隔离服务器上的真实 API；复用前面构建的 API 镜像。
      const apiProject = path.join(workDir, 'delivery-api')
      const apiService = path.join(apiProject, 'apps/delivery-api-serv')
      const apiEnvironment = path.join(apiService, '.env.test')
      writeFileSync(apiEnvironment, `${readFileSync(apiEnvironment, 'utf8')}\nHAI_SERV_CORS_ORIGIN=http://127.0.0.1:${fixture().webHostPort}\n`)
      const apiBuildId = readFileSync(path.join(apiProject, '.hai/build/docker/latest'), 'utf8').trim()
      await runSdkDeployment(commands, {
        config: { provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', port: fixture().sshHostPort, username: 'root', identityFile: keyPath, knownHostsFile: knownHostsPath, strictHostKeyChecking: false }, remote: { baseDir: '/opt/hai/apps with spaces', runtime: 'podman' }, expose: { hostPort: remoteApiPort } } },
        service: apiService,
        artifactDir: path.join(apiProject, '.hai/build/docker', apiBuildId),
        project,
      })
      const environment = path.join(project, '.env.test')
      writeFileSync(environment, `${readFileSync(environment, 'utf8')}\nPUBLIC_API_BASE=http://127.0.0.1:${fixture().apiHostPort}/api/v1\n`)
    }
    const service = appType === 'api' ? path.join(project, `apps/${name}-serv`) : project
    try {
      await runSdkDeployment(commands, {
        config: { provider: { type: 'docker-ssh', ssh: { host: '127.0.0.1', port: fixture().sshHostPort, username: 'root', identityFile: keyPath, knownHostsFile: knownHostsPath, strictHostKeyChecking: false }, remote: { baseDir: '/opt/hai/apps with spaces', runtime: 'podman' }, expose: { hostPort: remoteWebPort } } },
        service,
        artifactDir,
        project,
      })
    }
    catch (error) {
      commands.signal.throwIfAborted()
      const diagnostics = await commands.run(runtime!, ['exec', fixture().containerId, 'podman', 'logs', '--tail', '80', `hai-${name}-test-${appType === 'api' ? 'serv' : 'web'}`])
      throw new Error(`${error instanceof Error ? error.message : 'SDK deployment failed'}\nContainer diagnostics:\n${diagnostics}`)
    }
    const response = await commands.fetch(`http://127.0.0.1:${fixture().webHostPort}${appType === 'api' ? '/health' : '/'}`)
    expect(response.ok).toBe(true)
    if (appType !== 'api')
      await verifyDeployedBrowser(commands, { name, version: artifact.appVersion, env: 'test' }, project)
  }, context))
})
