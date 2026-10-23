/** 部署门禁专用的资源拥有权原语；不扫描或清理其他运行的资源。 */
import { execFileSync } from 'node:child_process'
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
 * 本次成功构建产生的私有 tag 及创建时内容 ID；不是按 ID 删除的授权。
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
function command(runtime: DeployFixtureRuntime, args: string[]): string {
  return execFileSync(runtime, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 4 * 1024 * 1024 })
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
 * @param imageRef - 调用方本次构建成功的私有镜像 tag。
 * @param publicKey - 本次临时 SSH 公钥。
 * @param directory - 本次独占的临时目录，用于 cidfile。
 * @param runId - 本次运行的 128 位随机身份；省略时在内部生成。
 * @returns 容器 ID 与引擎实际分配的宿主端口。
 * @throws Error - 创建、启动或检查失败；回收失败时保留原始错误并聚合报告。
 * @example 模块内部上下文
 * ```ts
 * async function readFixturePage(runtime: DeployFixtureRuntime, imageRef: string, publicKey: string, directory: string): Promise<string> {
 *   const fixture = createDeployTestFixture(runtime, imageRef, publicKey, directory)
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
export function createDeployTestFixture(runtime: DeployFixtureRuntime, imageRef: string, publicKey: string, directory: string, runId = randomBytes(16).toString('hex')): DeployTestFixture {
  if (!/^[a-f0-9]{32}$/.test(runId))
    throw new Error('Invalid deployment fixture run identity')
  let containerId: string | undefined
  try {
    const cidfile = path.join(directory, `fixture-${runId}.cid`)
    const output = command(runtime, [
      'create',
      ...(runtime === 'podman' ? ['--http-proxy=false'] : []),
      '--name',
      `hai-deploy-e2e-sshd-${runId}`,
      '--cidfile',
      cidfile,
      '--label',
      `${DEPLOY_FIXTURE_OWNER_LABEL}=${runId}`,
      '--privileged',
      '--cgroupns=host',
      '-v',
      '/sys/fs/cgroup:/sys/fs/cgroup:rw',
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
      imageRef,
    ]).trim()
    // 不通过名称恢复拥有权；只接收成功 create 的 stdout 或其独占 cidfile。
    const identity = /^[a-f0-9]{64}$/i.test(output) ? output : readFileSync(cidfile, 'utf8').trim()
    if (!/^[a-f0-9]{64}$/i.test(identity))
      throw new Error('Container create did not return a valid deployment fixture ID')
    containerId = identity
    command(runtime, ['start', containerId])
    const container = inspect(runtime, 'container', containerId)
    if (record(record(container.Config).Labels)[DEPLOY_FIXTURE_OWNER_LABEL] !== runId)
      throw new Error('Deployment fixture ownership label does not match its create identity')
    return { containerId, runId, sshHostPort: mappedPort(container, 22), webHostPort: mappedPort(container, DEPLOY_FIXTURE_WEB_PORT), apiHostPort: mappedPort(container, DEPLOY_FIXTURE_API_PORT) }
  }
  catch (error) {
    if (containerId) {
      try {
        command(runtime, ['rm', '-f', containerId])
      }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `Deployment fixture startup failed and cleanup failed for ${containerId}`)
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
  command(runtime, ['rm', '-f', fixture.containerId])
}

/**
 * 在本次构建成功后登记确切私有 tag/ID；公共基础/中间件镜像不能加入清理账本。
 * @param runtime - 执行本次成功构建的引擎。
 * @param imageRef - 本次构建返回的独立 tag，不能来自广域镜像查询。
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
 * @param images - 只含本次成功构建 tag 的账本。
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
