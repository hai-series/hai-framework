/** 部署门禁专用的资源拥有权原语；不扫描或清理其他运行的资源。 */
import { execFile, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 夹具内部 Web 端口固定；宿主端口必须由引擎在创建时原子分配。
 * @example 模块内部上下文
 * ```ts
 * const ports = [DEPLOY_FIXTURE_WEB_PORT, DEPLOY_FIXTURE_API_PORT]
 * if (new Set(ports).size !== 2) throw new Error('Fixture internal ports must differ')
 * ```
 */
export const DEPLOY_FIXTURE_WEB_PORT = 18080
/**
 * 移动前端复用 API 时的夹具内部端口；不能将它当作宿主实际端口。
 * @example 模块内部上下文
 * ```ts
 * const destination = `${DEPLOY_FIXTURE_API_PORT}/tcp`
 * if (destination !== '18081/tcp') throw new Error('Unexpected fixture API port')
 * ```
 */
export const DEPLOY_FIXTURE_API_PORT = 18081
/**
 * 当前运行拥有权标签；只能辅助核对，不能代替成功 create 返回的 ID。
 * @example 模块内部上下文
 * ```ts
 * const label = `${DEPLOY_FIXTURE_OWNER_LABEL}=${randomBytes(16).toString('hex')}`
 * const argumentsForCreate = ['--label', label]
 * ```
 */
export const DEPLOY_FIXTURE_OWNER_LABEL = 'org.h-ai.cli.deploy-e2e.run'

/**
 * 实际可用的容器引擎，不通过 shell 拼接命令。
 * @example 模块内部上下文
 * ```ts
 * const runtime: DeployFixtureRuntime = 'podman'
 * const version = command(runtime, ['version'])
 * if (!version.trim()) throw new Error('Container engine did not report its version')
 * ```
 */
export type DeployFixtureRuntime = 'podman' | 'docker'

/**
 * create 成功后记录的唯一容器身份与实际宿主端口；必须使用工厂结果。
 * @example 模块内部上下文
 * ```ts
 * function browserAddress(fixture: DeployTestFixture): URL {
 *   return new URL(`http://127.0.0.1:${fixture.webHostPort}`)
 * }
 * ```
 */
export interface DeployTestFixture {
  containerId: string
  runId: string
  sshHostPort: number
  webHostPort: number
  apiHostPort: number
}

/**
 * 本轮成功创建并登记的私有 tag 及其内容 ID；不是按 ID 删除的授权。
 * @example 模块内部上下文
 * ```ts
 * function unchangedTag(expected: DeployTestImage, actual: DeployTestImage): boolean {
 *   return expected.imageRef === actual.imageRef && expected.imageId === actual.imageId
 * }
 * ```
 */
export interface DeployTestImage {
  imageRef: string
  imageId: string
  expectedOwner?: string
}

/**
 * 回收步骤的原始失败仅在内存聚合；报告只保存固定步骤、错误分类和数值退出码。
 * @example 模块内部上下文
 * ```ts
 * function closeAndCollect(runtime: DeployFixtureRuntime, fixture: DeployTestFixture): DeployFixtureCleanupFailure[] {
 *   const failures: DeployFixtureCleanupFailure[] = []
 *   try { removeDeployTestFixture(runtime, fixture) }
 *   catch (error) { failures.push({ stage: 'container-remove', error }) }
 *   return failures
 * }
 * ```
 */
export interface DeployFixtureCleanupFailure {
  stage: 'deploy-close' | 'crypto-close' | 'container-remove' | 'control-container-remove' | 'images-remove' | 'base-image-check' | 'report-write' | 'temporary-directory-remove'
  error: unknown
}

/**
 * 创建本轮独立的安全回收报告写入器；固定写仓库 ignored 目录，不写临时私有工程。
 * 首次写入独占创建，后续仅刷新该函数自己创建的文件。绝不序列化原始错误、路径、环境或密钥。
 * @param runId - 本次运行的 128 位随机身份。
 * @param fixtures - 本次成功创建的容器身份，不含 SSH 密钥和项目路径。
 * @param images - 本次登记的私有镜像 tag 与内容 ID。
 * @returns 写入安全元数据的函数；调用方应在回收临时目录前后独立调用并聚合写入失败。
 * @example 模块内部上下文
 * ```ts
 * function reportOwnedCleanup(runId: string, fixture: DeployTestFixture, images: DeployTestImage[]): void {
 *   const report = createDeployFixtureCleanupReport(runId, [fixture], images)
 *   const failures: DeployFixtureCleanupFailure[] = []
 *   try { removeDeployTestFixture('podman', fixture) }
 *   catch (error) { failures.push({ stage: 'container-remove', error }) }
 *   report(failures) // 不输出 error.message、stderr、私有路径或环境变量。
 * }
 * ```
 */
export function createDeployFixtureCleanupReport(runId: string, fixtures: Iterable<Pick<DeployTestFixture, 'containerId' | 'runId'>>, images: Iterable<DeployTestImage>): (failures: readonly DeployFixtureCleanupFailure[]) => void {
  if (!/^[a-f0-9]{32}$/.test(runId))
    throw new Error('Invalid deployment cleanup report identity')
  const directory = fileURLToPath(new URL('../../../../tmp/validation/module-review/VERIFY-05/', import.meta.url))
  const reportPath = path.join(directory, `${runId}-${randomBytes(8).toString('hex')}.json`)
  const resources = {
    runId,
    containers: [...fixtures].map(fixture => ({ containerId: fixture.containerId, runId: fixture.runId })),
    images: [...images].map(image => ({ imageRef: image.imageRef, imageId: image.imageId, runId: image.expectedOwner })),
  }
  let created = false
  return (failures) => {
    const errors = failures.map(({ stage, error }) => {
      const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
      return {
        stage,
        kind: error instanceof AggregateError ? 'aggregate-error' : error instanceof Error ? 'error' : 'unknown-error',
        ...(typeof status === 'number' && Number.isInteger(status) && status >= 0 && status <= 255 ? { exitCode: status } : {}),
      }
    })
    mkdirSync(directory, { recursive: true })
    writeFileSync(reportPath, `${JSON.stringify({ ...resources, errors }, null, 2)}\n`, { flag: created ? 'w' : 'wx', mode: 0o600 })
    created = true
  }
}

/** 只对明确参数执行引擎命令；该夹具不接受任意 shell 片段。 */
function command(runtime: DeployFixtureRuntime, args: string[], timeoutMs = 15_000): string {
  return execFileSync(runtime, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 })
}

/**
 * 检查固定公开基础镜像，仅明确不存在时拉取；公共缓存永不加入清理账本。
 * @param runtime - 实际可连接的引擎。
 * @param imageRef - 调用方固定的公开镜像版本，可使用已配置的镜像站主机名。
 * @param timeoutMs - 本次准备总 deadline 的剩余预算。
 * @param mirror - 可选的已有公开镜像站主机名；拉取后保留原公开引用。
 * @throws Error - 检查故障、非公开引用、镜像缺失且拉取失败或预算耗尽。
 * @example 模块内部上下文
 * ```ts
 * ensureDeployTestBaseImage('podman', 'node:24.22.1-bookworm-slim', 60000)
 * ```
 */
export function ensureDeployTestBaseImage(runtime: DeployFixtureRuntime, imageRef: string, timeoutMs: number, mirror?: string): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Deployment base image preparation deadline exceeded')
  if (mirror && !/^[a-z0-9.-]+(?::\d+)?$/i.test(mirror))
    throw new Error('Expected a public registry mirror hostname')
  if (!/^(?:[a-z0-9.-]+(?::\d+)?\/)?(?:library\/)?(?:node:24\.22\.1-bookworm-slim|python:3\.11\.17-slim-trixie|nginxinc\/nginx-unprivileged:1\.29\.8-alpine)$/.test(imageRef))
    throw new Error('Deployment base image must be a fixed public reference')
  const deadline = Date.now() + timeoutMs
  try {
    const data: unknown = JSON.parse(command(runtime, ['image', 'inspect', imageRef], Math.max(1, Math.min(15_000, timeoutMs))))
    if (!Array.isArray(data) || data.length !== 1 || typeof record(data[0]).Id !== 'string')
      throw new Error('Invalid public image inspection')
    return
  }
  catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
    if (!/no such image|image not known|image not found|unable to find image/i.test(stderr))
      throw new Error('Deployment public base image inspection failed')
  }
  const pullBudget = deadline - Date.now()
  if (pullBudget <= 0)
    throw new Error('Deployment base image preparation deadline exceeded')
  try {
    const publicPath = imageRef.replace(/^docker\.io\//, '')
    const source = mirror ? `${mirror}/${publicPath.includes('/') ? '' : 'library/'}${publicPath}` : imageRef
    command(runtime, ['pull', source], pullBudget)
    if (source !== imageRef) {
      const tagBudget = deadline - Date.now()
      if (tagBudget <= 0)
        throw new Error('Deployment base image preparation deadline exceeded')
      command(runtime, ['tag', source, imageRef], Math.min(15_000, tagBudget))
    }
  }
  catch {
    throw new Error('Deployment public base image pull failed or timed out')
  }
}

/**
 * 在已登记的容器内异步准备环境；等待本地客户端 close 后才报告超时或取消。
 * 不保留含参数、环境或原始异常的 cmd/cause/stdio，失败只报告固定原因与退出状态。
 * @param runtime - 创建该容器的引擎。
 * @param fixture - 成功 create 返回的当前资源。
 * @param args - 容器内的命令与独立参数，不能包含私有凭据。
 * @param options - 准备期限和调用方取消信号。
 * @param options.timeoutMs - 当前步骤的超时毫秒数，仍受总准备信号约束。
 * @param options.signal - 调用方或工厂总期限的合作式取消信号。
 * @param options.stage - 固定准备步骤名称，不包含命令或凭据。
 * @returns 完整且未超过捕获上限的 stdout。
 * @throws Error - 启动、退出、超时、取消或输出超过上限。
 * @example 模块内部上下文
 * ```ts
 * async function checkNode(runtime: DeployFixtureRuntime, fixture: DeployTestFixture): Promise<void> {
 *   const output = await executeDeployTestFixture(runtime, fixture, ['node', '--version'], { timeoutMs: 5000 })
 *   if (!output.startsWith('v')) throw new Error('Fixture Node version was not reported')
 * }
 * ```
 */
export async function executeDeployTestFixture(runtime: DeployFixtureRuntime, fixture: DeployTestFixture, args: string[], options: { timeoutMs?: number, signal?: AbortSignal, stage?: 'apt-update' | 'apt-install' | 'pip' | 'sshd' | 'nested-runtime' } = {}): Promise<string> {
  return await new Promise((resolve, reject) => {
    let outcome: { error: Error | null, stdout: string, stderr: string } | undefined
    const child = execFile(runtime, ['exec', fixture.containerId, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: options.timeoutMs ?? 240_000,
      signal: options.signal,
      killSignal: 'SIGKILL',
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => { outcome = { error, stdout, stderr } })
    // execFile 的 AbortError 回调可能早于 close；不能在客户端仍活跃时开始清理。
    child.once('close', (code, signal) => {
      if (!outcome) {
        reject(new Error('Deployment fixture preparation closed without a result'))
        return
      }
      if (outcome.error) {
        const nativeCode = 'code' in outcome.error ? outcome.error.code : undefined
        const reason = options.signal?.aborted ? options.signal.reason instanceof Error && options.signal.reason.name === 'TimeoutError' ? 'timeout' : 'aborted' : nativeCode === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'output-limit' : signal === 'SIGKILL' ? 'timeout' : 'failed'
        // 安装工具可能输出代理认证信息；失败时连 stdio 尾部也不交给 Vitest 序列化。
        reject(new Error(`Deployment fixture preparation ${options.stage ?? 'command'} ${reason}; exit=${code ?? 'none'}; signal=${signal ?? 'none'}`))
        return
      }
      resolve(outcome.stdout)
    })
  })
}

/**
 * 仅测试夹具使用的可选启动命令和准备回调，不属于发布包 API。
 * @example 模块内部上下文
 * ```ts
 * const preparation: DeployFixturePreparation = {
 *   command: ['sleep', 'infinity'],
 *   prepare: async fixture => { await executeDeployTestFixture('podman', fixture, ['node', '--version']) },
 * }
 * ```
 */
interface DeployFixturePreparation {
  command?: readonly string[]
  nestedRuntime?: boolean
  timeoutMs?: number
  signal?: AbortSignal
  /** 回调须将该信号传入每次异步 exec；工厂不能撤销任意不配合的回调。 */
  prepare?: (fixture: DeployTestFixture, signal: AbortSignal | undefined) => void | Promise<void>
}

/** 按成功 create 的完整 ID 删除并核验消失；查询结果仅核验，不作为领养依据。 */
function removeCreatedContainer(runtime: DeployFixtureRuntime, containerId: string): void {
  command(runtime, ['rm', '-f', containerId], 60_000)
  const remaining = command(runtime, ['container', 'ls', '--all', '--quiet', '--no-trunc', '--filter', `id=${containerId}`]).trim()
  if (remaining)
    throw new Error(`Deployment fixture removal was not confirmed for ${containerId}`)
}

/** 引擎 JSON 在使用字段前必须确认为普通对象。 */
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid deployment fixture inspection object')
  return value as Record<string, unknown>
}

/** 只检查指定 ID/tag；不把按前缀查询到的外部资源视为当前运行拥有。 */
function inspect(runtime: DeployFixtureRuntime, kind: 'container' | 'image', identity: string): Record<string, unknown> {
  const value: unknown = JSON.parse(command(runtime, [kind, 'inspect', identity]))
  if (!Array.isArray(value) || value.length !== 1)
    throw new Error('Invalid deployment fixture inspection response')
  return record(value[0])
}

/** 校验引擎分配的单一 loopback 映射，不回退到固定或自行猜测的端口。 */
function mappedPort(container: Record<string, unknown>, containerPort: number): number {
  const bindings = record(record(container.NetworkSettings).Ports)[`${containerPort}/tcp`]
  if (!Array.isArray(bindings) || bindings.length !== 1)
    throw new Error('Deployment fixture has no unique port binding')
  const binding = record(bindings[0])
  const port = Number(binding.HostPort)
  if (binding.HostIp !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Deployment fixture has an invalid loopback port binding')
  return port
}

/**
 * 创建并启动本次独占夹具；成功 create 的 ID 在 start 前保存，start 失败也只清该 ID。
 * @param runtime - 可连接的 Podman 或 Docker。
 * @param imageRef - 已存在的固定基础镜像，或调用方本次成功登记的私有 tag；不隐式拉取。
 * @param publicKey - 本次临时 SSH 公钥。
 * @param directory - 本次独占的临时目录，用于 cidfile。
 * @param runId - 本次运行的 128 位随机身份；省略时在内部生成。
 * @param preparation - 显式启动命令及在同一清理边界内执行的异步准备。
 * @returns 容器 ID 与引擎实际分配的宿主端口。
 * @throws Error - 创建、启动或检查失败；回收失败时保留原始错误并聚合报告。
 * @example 模块内部上下文
 * ```ts
 * async function readFixturePage(runtime: DeployFixtureRuntime, imageRef: string, publicKey: string, directory: string): Promise<string> {
 *   const fixture = await createDeployTestFixture(runtime, imageRef, publicKey, directory)
 *   try {
 *     const response = await fetch(`http://127.0.0.1:${fixture.webHostPort}`, { signal: AbortSignal.timeout(5000) })
 *     if (!response.ok) throw new Error('Fixture page request failed')
 *     return await response.text()
 *   }
 *   finally {
 *     removeDeployTestFixture(runtime, fixture)
 *   }
 * }
 * ```
 */
export async function createDeployTestFixture(runtime: DeployFixtureRuntime, imageRef: string, publicKey: string, directory: string, runId = randomBytes(16).toString('hex'), preparation: DeployFixturePreparation = {}): Promise<DeployTestFixture> {
  if (!/^[a-f0-9]{32}$/.test(runId))
    throw new Error('Invalid deployment fixture run identity')
  if (preparation.signal?.aborted)
    throw new Error('Deployment fixture preparation aborted before create')
  const timeoutMs = preparation.timeoutMs ?? 60_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Deployment fixture preparation deadline exceeded')
  const deadline = Date.now() + timeoutMs
  const deadlineSignal = AbortSignal.timeout(timeoutMs)
  const signal = preparation.signal ? AbortSignal.any([preparation.signal, deadlineSignal]) : deadlineSignal
  const remaining = (): number => {
    const remainingMs = deadline - Date.now()
    if (signal.aborted || remainingMs <= 0)
      throw new Error('Deployment fixture preparation aborted or timed out')
    return Math.min(15_000, remainingMs)
  }
  let containerId: string | undefined
  try {
    const cidfile = path.join(directory, `fixture-${runId}.cid`)
    const output = command(runtime, [
      'create',
      '--pull=never',
      '--network=bridge',
      ...(runtime === 'podman' ? ['--http-proxy=false'] : []),
      '--name',
      `hai-deploy-e2e-sshd-${runId}`,
      '--cidfile',
      cidfile,
      '--label',
      `${DEPLOY_FIXTURE_OWNER_LABEL}=${runId}`,
      ...(preparation.nestedRuntime ? ['--privileged', '--cgroupns=host', '-v', '/sys/fs/cgroup:/sys/fs/cgroup:rw'] : []),
      '-p',
      '127.0.0.1::22',
      '-p',
      `127.0.0.1::${DEPLOY_FIXTURE_WEB_PORT}`,
      '-p',
      `127.0.0.1::${DEPLOY_FIXTURE_API_PORT}`,
      '-e',
      `AUTHORIZED_KEY=${publicKey}`,
      '-e',
      `HAI_DEPLOY_E2E_RUN=${runId}`,
      ...(preparation.command?.length ? ['--entrypoint', preparation.command[0]!] : []),
      imageRef,
      ...(preparation.command?.slice(1) ?? []),
    ], remaining()).trim()
    // 不通过名称恢复拥有权；只接收成功 create 的 stdout 或其独占 cidfile。
    const identity = /^[a-f0-9]{64}$/i.test(output) ? output : readFileSync(cidfile, 'utf8').trim()
    if (!/^[a-f0-9]{64}$/i.test(identity))
      throw new Error('Container create did not return a valid deployment fixture ID')
    containerId = identity
    command(runtime, ['start', containerId], remaining())
    const inspected: unknown = JSON.parse(command(runtime, ['container', 'inspect', containerId], remaining()))
    if (!Array.isArray(inspected) || inspected.length !== 1)
      throw new Error('Invalid deployment fixture inspection response')
    const container = record(inspected[0])
    if (record(record(container.Config).Labels)[DEPLOY_FIXTURE_OWNER_LABEL] !== runId)
      throw new Error('Deployment fixture ownership label does not match its create identity')
    const fixture = { containerId, runId, sshHostPort: mappedPort(container, 22), webHostPort: mappedPort(container, DEPLOY_FIXTURE_WEB_PORT), apiHostPort: mappedPort(container, DEPLOY_FIXTURE_API_PORT) }
    remaining()
    await preparation.prepare?.(fixture, signal)
    if (signal.aborted || deadline <= Date.now())
      throw new Error('Deployment fixture preparation aborted')
    return fixture
  }
  catch (error) {
    if (containerId) {
      try {
        removeCreatedContainer(runtime, containerId)
      }
      catch (cleanupError) {
        const failures: unknown[] = [error, cleanupError]
        try {
          createDeployFixtureCleanupReport(runId, [{ containerId, runId }], [])([{ stage: 'container-remove', error: cleanupError }])
        }
        catch (reportError) {
          failures.push(reportError)
        }
        throw new AggregateError(failures, `Deployment fixture startup failed and cleanup failed for ${containerId}`)
      }
    }
    throw error
  }
}

/**
 * 只删除调用方成功创建并记录的容器 ID；无名称、label 查询或全局清理回退。
 * @param runtime - 创建该资源的引擎。
 * @param fixture - createDeployTestFixture 返回的本次资源。
 * @throws Error - 引擎无法确认删除成功。
 * @example 模块内部上下文
 * ```ts
 * function closeCreatedFixture(runtime: DeployFixtureRuntime, fixture: DeployTestFixture): void {
 *   removeDeployTestFixture(runtime, fixture)
 * }
 * ```
 */
export function removeDeployTestFixture(runtime: DeployFixtureRuntime, fixture: DeployTestFixture): void {
  removeCreatedContainer(runtime, fixture.containerId)
}

/**
 * 在本轮成功创建私有 tag 后登记确切 tag/ID；公共基础/中间件镜像不能加入清理账本。
 * @param runtime - 执行本轮 tag 或构建的引擎。
 * @param imageRef - 本轮成功创建的独立 tag，不能来自广域镜像查询。
 * @param expectedOwner - 夹具镜像的预期 run label；应用镜像由其独立 buildId tag 标识。
 * @returns 当前 tag 的内容 ID 和可选拥有权校验值。
 * @example 模块内部上下文
 * ```ts
 * function rememberSuccessfulBuild(runtime: DeployFixtureRuntime, imageRef: string, runId: string): Map<string, DeployTestImage> {
 *   const image = recordDeployTestImage(runtime, imageRef, runId)
 *   return new Map([[image.imageRef, image]])
 * }
 * ```
 */
export function recordDeployTestImage(runtime: DeployFixtureRuntime, imageRef: string, expectedOwner?: string): DeployTestImage {
  if (!/^localhost\/hai-[\w.-]+:[\w.-]+$/i.test(imageRef))
    throw new Error('Only an explicitly recorded private deployment image tag can be cleaned')
  const image = inspect(runtime, 'image', imageRef)
  const id = image.Id ?? image.ID
  if (typeof id !== 'string' || !/^(?:sha256:)?[a-f0-9]{64}$/i.test(id))
    throw new Error('Deployment image has no valid content ID')
  if (expectedOwner !== undefined && record(record(image.Config).Labels)[DEPLOY_FIXTURE_OWNER_LABEL] !== expectedOwner)
    throw new Error('Deployment image ownership label does not match this run')
  return { imageRef, imageId: id, expectedOwner }
}

/**
 * 仅移除仍指向已记录 ID 的本次 tag；不强删内容 ID，以保留同内容的外部 tag 和共享层。
 * @param runtime - 创建这些 tag 的引擎。
 * @param images - 只含本轮成功创建并登记 tag 的账本。
 * @throws AggregateError - 尝试全部 tag 后仍有检查或回收失败。
 * @example 模块内部上下文
 * ```ts
 * function closeRecordedImages(runtime: DeployFixtureRuntime, images: Map<string, DeployTestImage>): void {
 *   removeDeployTestImages(runtime, images.values())
 *   images.clear() // 只有全部回收成功才清账，失败时保留核对信息。
 * }
 * ```
 */
export function removeDeployTestImages(runtime: DeployFixtureRuntime, images: Iterable<DeployTestImage>): void {
  const failures: unknown[] = []
  for (const image of images) {
    try {
      const current = recordDeployTestImage(runtime, image.imageRef, image.expectedOwner)
      if (current.imageId !== image.imageId)
        throw new Error(`Deployment image tag changed ownership; preserved ${image.imageRef}`)
      command(runtime, ['image', 'rm', image.imageRef])
    }
    catch (error) {
      failures.push(error)
    }
  }
  if (failures.length)
    throw new AggregateError(failures, 'Deployment fixture image cleanup failed')
}
