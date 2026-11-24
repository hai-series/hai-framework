import type { HaiResult } from '@h-ai/core'
import type { DockerSshProviderConfig } from './deploy-config.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { basename, isAbsolute } from 'node:path'
import { rootCertificates } from 'node:tls'
import { core } from '@h-ai/core'
import { z } from 'zod'
import { uploadAndApplyBundle } from './container/deploy-bundle-transport.js'
import { runCommand } from './container/deploy-command.js'
import { deploymentRuntimeFunctions, deploymentStoreHeader } from './container/deploy-runtime-selection.js'
import { shellArgument } from './container/deploy-scripts.js'
import { createSshExecutor, usesSshPassword } from './container/deploy-ssh.js'
import { artifactChecksum } from './deploy-artifact.js'
import { deploymentOrigin, ProviderConfigSchema } from './deploy-config.js'
import { normalizeProjectName } from './deploy-functions.js'
import { deployM } from './deploy-i18n.js'
import { getDeployCommandState } from './deploy-recovery.js'
import { HaiDeployError } from './deploy-types.js'

const deploymentId = z.string().regex(/^\d{8}-\d{6}-[a-f\d]{6}$/)
const digest = z.string().regex(/^[a-f\d]{64}$/)
const imageRef = z.string().max(255).regex(/^[a-z\d][a-z\d./:_-]*:[a-z\d_][a-z\d_.-]*$/)
const targetSchema = z.object({
  projectName: z.string().min(1).max(128),
  provider: ProviderConfigSchema,
})
const bundleMetadata = z.object({
  bundleFormat: z.literal(2),
  deploymentId,
  deploymentTarget: z.object({
    projectName: z.string(),
    directory: z.string(),
    runtime: z.enum(['docker', 'podman', 'auto']),
    dockerMode: z.enum(['default', 'rootless']),
    hostAddress: z.string(),
    hostPort: z.number(),
    publicUrl: z.string(),
    host: z.string(),
    port: z.number(),
    username: z.string(),
  }),
})
const receiptSchema = z.object({
  deploymentId,
  stage: z.enum([
    'preflight',
    'credentials',
    'recover',
    'images',
    'configuration',
    'dependencies',
    'start',
    'https',
    'health',
    'complete',
  ]),
  exitCode: z.number().int().min(0).max(255),
  durationSeconds: z.number().int().nonnegative(),
  recoveryStatus: z.enum([
    'not-needed',
    'passed',
    'failed',
    'stopped',
  ]),
})
const releaseSchema = z.object({
  deploymentId,
  images: z.array(z.object({
    role: z.enum(['serv', 'web']),
    reference: imageRef,
    archiveSha256: digest,
    archivePath: z.string(),
  }))
    .min(1)
    .max(2)
    .refine(images => new Set(images.map(image => image.role)).size === images.length),
})
const savedImageSchema = z.array(z.object({
  Config: z.string(),
  RepoTags: z.array(z.string()).nullable(),
})).length(1)
const imageConfigDigest = /^(?:blobs\/sha256\/([a-f\d]{64})|([a-f\d]{64})\.json)$/
const runningContainer = /^(?:sha256:)?([a-f\d]{64}) (?:sha256:)?([a-f\d]{64}) true$/
const manifestDigest = /^sha256:([a-f\d]{64})$/
const imageManifestSchema = z.object({
  schemaVersion: z.literal(2),
  config: z.object({
    digest: z.string().regex(manifestDigest),
  }),
})

/**
 * 单次操作的受信目标；工程名含打包时的环境后缀。
 * @example
 * ```ts
 * import type { DeployReleaseTarget, DockerSshProviderConfig } from '@h-ai/deploy'
 * function production(provider: DockerSshProviderConfig): DeployReleaseTarget {
 *   return { projectName: 'shop-prod', provider }
 * }
 * ```
 */
export interface DeployReleaseTarget {
  projectName: string
  provider: DockerSshProviderConfig
}

/**
 * 启动前由调用方持久化的本地私有包收据和受信目标。
 * @example
 * ```ts
 * import type { DeployBundleExecution } from '@h-ai/deploy'
 * function pathToPackage(input: DeployBundleExecution): string {
 *   return input.bundlePath
 * }
 * ```
 */
export interface DeployBundleExecution {
  deploymentId: string
  bundlePath: string
  bundleSha256: string
  target: DeployReleaseTarget
}

/**
 * 待核对部署和可选前一发布的冻结镜像。归档路径由调用方准备，摘要来自持久化的可信回执。
 * @example
 * ```ts
 * import type { DeployReleaseVerification } from '@h-ai/deploy'
 * function intendedHost(input: DeployReleaseVerification): string | undefined {
 *   return input.target.provider.ssh?.host
 * }
 * ```
 */
export interface DeployReleaseVerification {
  target: DeployReleaseTarget
  release: z.input<typeof releaseSchema>
  previous?: z.input<typeof releaseSchema>
  /** 已登记公开入口下的健康 URL，含应用的健康检查路径。 */
  healthUrl: string
  /** HTTPS 自有 CA 的绝对文件路径。 */
  caFile?: string
  /** 可选。收到候选或恢复成功证据后，按实际运行的 ID 准备其归档文件。 */
  prepareImages?: (deploymentId: string, signal?: AbortSignal) => Promise<void>
}

/**
 * 只读核对结论；restored 的 proof 对应前一发布。连接、配置或运行证据不足时保留 pending_verify。
 * @example
 * ```ts
 * import type { DeployReleaseVerificationResult } from '@h-ai/deploy'
 * function runningId(result: DeployReleaseVerificationResult): string | undefined {
 *   return result.status === 'succeeded' || result.status === 'restored' ? result.proof.deploymentId : undefined
 * }
 * ```
 */
export type DeployReleaseVerificationResult
  = | { status: 'pending_verify', deploymentId: string }
    | { status: 'failed', deploymentId: string, receipt: z.infer<typeof receiptSchema> }
    | {
      status: 'succeeded' | 'restored'
      deploymentId: string
      receipt: z.infer<typeof receiptSchema>
      proof: {
        deploymentId: string
        runtime: 'docker' | 'podman'
        images: Array<{ role: 'serv' | 'web', reference: string, imageId: string, archiveSha256: string }>
      }
    }

function resolveTarget(input: DeployReleaseTarget) {
  const { projectName, provider } = targetSchema.parse(input)
  if (normalizeProjectName(projectName) !== projectName || provider.type !== 'docker-ssh' || provider.remote.runtime === 'auto'
    || !provider.ssh?.strictHostKeyChecking || !provider.ssh.knownHostsFile || !isAbsolute(provider.ssh.knownHostsFile)
    || (!usesSshPassword(provider.ssh) && (!provider.ssh.identityFile || !isAbsolute(provider.ssh.identityFile)))) {
    throw new Error('Invalid release target')
  }
  return {
    provider,
    connection: provider.ssh,
    projectName,
    directory: `${provider.remote.baseDir}/${projectName}`,
    runtime: provider.remote.runtime,
    dockerMode: provider.remote.dockerMode ?? 'default',
    ssh: createSshExecutor(provider.ssh, true),
  }
}

async function checkedFile(path: string, sha256: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  return isAbsolute(path) && (await lstat(path)).isFile() && await realpath(path) === path
    && await artifactChecksum(path, signal) === sha256
}

async function archiveText(path: string, member: string, signal?: AbortSignal, maxCaptureChars = 65_536): Promise<string> {
  const result = await runCommand('tar', ['-xOf', path, member], { signal, timeoutMs: 90_000, maxCaptureChars })
  if (!result.success || result.data.stdoutTruncated)
    throw new Error('Archive member unavailable')
  return result.data.stdout
}

const invalid = () => core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))

/**
 * 校验受信私有包和固定目标，再通过 SSH 上传并用部署脚本执行一次。
 * @example 模块内部上下文
 * ```ts
 * async function launch(packaged: DeployBundleExecution, signal: AbortSignal): Promise<boolean> {
 *   const started = await executeBundle(packaged, { signal })
 *   return started.success
 * }
 * ```
 */
export async function executeBundle(input: DeployBundleExecution, options?: { signal?: AbortSignal }): Promise<HaiResult<{ deploymentId: string }>> {
  const signal = options?.signal
  try {
    const target = resolveTarget(input.target)
    if (!deploymentId.safeParse(input.deploymentId).success || !digest.safeParse(input.bundleSha256).success
      || !/^[\w.+-]+\.tar(?:\.gz)?$/i.test(basename(input.bundlePath))
      || !await checkedFile(input.bundlePath, input.bundleSha256, signal)) {
      return invalid()
    }
    const manifest = bundleMetadata.parse(JSON.parse(await archiveText(input.bundlePath, './manifest.json', signal)))
    const identity = manifest.deploymentTarget
    const { hostAddress, hostPort, publicUrl } = target.provider.expose
    if (manifest.deploymentId !== input.deploymentId || identity.projectName !== target.projectName
      || identity.directory !== target.directory || identity.runtime !== target.runtime || identity.host !== target.connection.host
      || identity.port !== target.connection.port || identity.username !== target.connection.username
      || identity.dockerMode !== target.dockerMode || identity.hostAddress !== (hostAddress ?? '')
      || identity.hostPort !== hostPort || identity.publicUrl !== (publicUrl
      ? new URL(publicUrl).origin
      : '')) {
      return invalid()
    }
    const { result } = await uploadAndApplyBundle(target.ssh, input.bundlePath, target.directory, 'apply.sh', {
      signal,
      discardOutput: true,
      bundleSha256: input.bundleSha256,
    })
    if (!result.success) {
      const state = getDeployCommandState(result.error)
      return core.err({
        ...result.error,
        ext: {
          commandExecution: {
            ...state,
            reason: state?.reason ?? 'exit',
            localTermination: state?.localTermination ?? 'unknown',
            deploymentId: input.deploymentId,
          },
        },
      })
    }
    return core.ok({ deploymentId: input.deploymentId })
  }
  catch {
    if (signal?.aborted)
      return core.err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandCancelled'))
    return invalid()
  }
}

function validatedHealthUrl(input: DeployReleaseVerification, target: ReturnType<typeof resolveTarget>): URL {
  const url = new URL(input.healthUrl)
  if (url.origin !== new URL(deploymentOrigin(target.provider)).origin
    || url.username || url.password || url.hash || url.search
    || (input.caFile && (url.protocol !== 'https:' || !isAbsolute(input.caFile)))) {
    throw new Error('Invalid release health endpoint')
  }
  return url
}

async function healthy(url: URL, caFile: string | undefined, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(8000)
  const active = signal
    ? AbortSignal.any([signal, timeout])
    : timeout
  const ca = caFile
    ? [...rootCertificates, await readFile(caFile, { encoding: 'utf8', signal: active })]
    : undefined
  const connect = url.protocol === 'https:'
    ? requestHttps
    : requestHttp
  return await new Promise<boolean>((resolve) => {
    // 只连接已登记的公开入口，避免进程代理或服务重定向影响核对。
    const request = connect(url, { ca, agent: false, signal: active }, (response) => {
      const status = response.statusCode
      response.destroy()
      resolve(status !== undefined && status >= 200 && status < 300)
    })
    request.on('error', () => resolve(false))
    request.end()
  })
}

async function expectedImages(release: z.infer<typeof releaseSchema>, signal?: AbortSignal) {
  return await Promise.all(release.images.map(async ({ role, reference, archivePath, archiveSha256 }) => {
    if (!await checkedFile(archivePath, archiveSha256, signal))
      throw new Error('Image archive bytes changed')
    // 镜像配置摘要既来自归档声明，也必须与实际配置内容一致。
    const entries = savedImageSchema.parse(JSON.parse(await archiveText(archivePath, 'manifest.json', signal)))
    const entry = entries[0]!
    const match = imageConfigDigest.exec(entry.Config)
    const imageId = match?.[1] ?? match?.[2]
    if (!imageId || !entry.RepoTags?.includes(reference))
      throw new Error('Image configuration digest unavailable')
    const config = await archiveText(archivePath, entry.Config, signal, 4 * 1024 * 1024)
    if (createHash('sha256').update(config).digest('hex') !== imageId)
      throw new Error('Image configuration digest changed')
    return {
      role,
      reference,
      archiveSha256,
      imageId,
    }
  }))
}

function lockedReleaseRead(target: ReturnType<typeof resolveTarget>): string[] {
  return [
    'set -eu',
    `root=${shellArgument(target.directory)}`,
    'test -f "$root/.deploy.lock" && test ! -L "$root/.deploy.lock"',
    'exec 9<"$root/.deploy.lock"',
    'flock -sn 9',
    deploymentRuntimeFunctions,
    deploymentStoreHeader,
    `select_deployment_runtime ${shellArgument(target.runtime)} ${shellArgument(target.dockerMode)}`,
    'ledger="$root/persistent-backends"',
    'if [ -e "$ledger" ] || [ -L "$ledger" ]; then',
    '  test -f "$ledger" && test ! -L "$ledger"',
    `  expected_header=$(deployment_store_header "$runtime" ${shellArgument(`hai-${target.projectName}`)})`,
    '  test "$(head -n 5 "$ledger")" = "$expected_header"',
    'fi',
  ]
}

async function remoteSnapshot(target: ReturnType<typeof resolveTarget>, id: string, roles: readonly ('serv' | 'web')[], signal?: AbortSignal) {
  const snapshots = roles.map(role =>
    `"$runtime" container inspect --format '{{.Id}} {{.Image}} {{.State.Running}}' ${shellArgument(`hai-${target.projectName}-${role}`)}`)
  const result = await target.ssh.exec([
    ...lockedReleaseRead(target),
    `receipt="$root/result-${id}.json"`,
    'test -f "$receipt" && test ! -L "$receipt"',
    'test "$(wc -c < "$receipt")" -le 8192',
    'head -c 8192 "$receipt"',
    'current=""',
    'if [ -e "$root/current" ] || [ -L "$root/current" ]; then',
    '  test -f "$root/current" && test ! -L "$root/current"',
    '  current=$(head -c 129 "$root/current")',
    '  case "$current" in ""|.|..|*[!a-zA-Z0-9._-]*) exit 1;; esac',
    '  test -f "$root/releases/$current/.hai/compose.json"',
    '  test -f "$ledger"',
    'fi',
    'printf "%s\\n" "$current"',
    ...(roles.length
      ? snapshots
      : ['if [ -z "$current" ]; then "$runtime" ps --format \'{{.Names}}\'; fi']),
  ].join('\n'), { timeoutMs: 15_000, maxCaptureChars: 16_384, signal })
  if (!result.success || result.data.stdoutTruncated)
    throw new Error('Remote release unavailable')
  const [body, current, ...observed] = result.data.stdout.replace(/\r?\n$/, '').split(/\r?\n/)
  const receipt = receiptSchema.parse(JSON.parse(body ?? ''))
  if (receipt.deploymentId !== id)
    throw new Error('Wrong remote receipt')
  return { receipt, current, observed }
}

/** containerd 用 OCI 目标摘要标识镜像；从实际容器的平台清单还原镜像配置摘要。 */
async function dockerManifestMatches(target: ReturnType<typeof resolveTarget>, containerId: string, runtimeImageId: string, imageId: string, signal?: AbortSignal): Promise<boolean> {
  const reference = `sha256:${runtimeImageId}`
  const selectDigest = shellArgument(String.raw`s/^${reference} sha256:\([0-9a-f]\{64\}\)$/\1/p`)
  const result = await target.ssh.exec([
    ...lockedReleaseRead(target),
    'test -f "$ledger"',
    `descriptor=$("$runtime" container inspect --format '{{.Image}} {{with .ImageManifestDescriptor}}{{.Digest}}{{end}}' ${shellArgument(containerId)})`,
    `manifest=$(printf "%s\\n" "$descriptor" | LC_ALL=C sed -n ${selectDigest})`,
    'test -n "$manifest"',
    // 只返回有限大小的清单，用实际容器绑定的不可变 ID 导出；无需传回镜像层。
    'printf "%s\\n" "$manifest"',
    `"$runtime" image save ${shellArgument(reference)} | tar --occurrence=1 -xOf - "blobs/sha256/$manifest" | head -c 65537 | base64 -w0`,
  ].join('\n'), { timeoutMs: 90_000, maxCaptureChars: 90_000, signal })
  if (!result.success || result.data.stdoutTruncated)
    return false
  const [manifest, encoded, extra] = result.data.stdout.trimEnd().split(/\r?\n/)
  if (!manifest || !digest.safeParse(manifest).success || !encoded || extra !== undefined)
    return false
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > 65_536 || createHash('sha256').update(bytes).digest('hex') !== manifest)
    return false
  const content = imageManifestSchema.parse(JSON.parse(bytes.toString('utf8')))
  return content.config.digest === `sha256:${imageId}`
}

/**
 * 在独立连接核对远端 JSON 回执、当前发布、镜像及公开健康入口，不修改目标。
 * @example 模块内部上下文
 * ```ts
 * async function verified(input: DeployReleaseVerification, signal: AbortSignal): Promise<boolean> {
 *   const result = await verifyDeployment(input, { signal })
 *   return result.success && result.data.status === 'succeeded'
 * }
 * ```
 */
export async function verifyDeployment(input: DeployReleaseVerification, options?: { signal?: AbortSignal }): Promise<HaiResult<DeployReleaseVerificationResult>> {
  let target: ReturnType<typeof resolveTarget>
  let health: URL
  let release: z.infer<typeof releaseSchema>
  let previous: z.infer<typeof releaseSchema> | undefined
  try {
    target = resolveTarget(input.target)
    health = validatedHealthUrl(input, target)
    release = releaseSchema.parse(input.release)
    previous = input.previous && releaseSchema.parse(input.previous)
    if (previous?.deploymentId === release.deploymentId)
      return invalid()
  }
  catch {
    return invalid()
  }
  const id = release.deploymentId
  const pending = (): HaiResult<DeployReleaseVerificationResult> => core.ok({ status: 'pending_verify', deploymentId: id })
  const signal = options?.signal
  try {
    const initial = await remoteSnapshot(target, id, [], signal)
    const { receipt, current } = initial
    const succeeded = receipt.exitCode === 0 && receipt.stage === 'complete' && receipt.recoveryStatus === 'not-needed' && current === id
    const recovered = receipt.exitCode !== 0 && previous && current === previous.deploymentId && ['passed', 'not-needed'].includes(receipt.recoveryStatus)
    const running = succeeded
      ? release
      : recovered ? previous : undefined
    if (!running) {
      return receipt.exitCode !== 0 && !previous && current === '' && ['stopped', 'not-needed'].includes(receipt.recoveryStatus)
        && !initial.observed.some(name => name.startsWith(`hai-${target.projectName}-`))
        ? core.ok({ status: 'failed', deploymentId: id, receipt })
        : pending()
    }
    await input.prepareImages?.(running.deploymentId, signal)
    const images = await expectedImages(running, signal)
    const roles = images.map(image => image.role)
    const agrees = (snapshot: Awaited<ReturnType<typeof remoteSnapshot>>) => snapshot.current === running.deploymentId
      && snapshot.receipt.exitCode === receipt.exitCode && snapshot.receipt.stage === receipt.stage
      && snapshot.receipt.recoveryStatus === receipt.recoveryStatus && snapshot.observed.length === images.length
    const before = await remoteSnapshot(target, id, roles, signal)
    if (!agrees(before))
      return pending()
    for (const [index, image] of images.entries()) {
      const observed = runningContainer.exec(before.observed[index] ?? '')
      if (!observed)
        return pending()
      const [, containerId, runtimeImageId] = observed
      if (image.imageId !== runtimeImageId && (target.runtime !== 'docker'
        || !await dockerManifestMatches(target, containerId!, runtimeImageId!, image.imageId, signal))) {
        return pending()
      }
    }
    if (!await healthy(health, input.caFile, signal))
      return pending()
    const after = await remoteSnapshot(target, id, roles, signal)
    if (!agrees(after) || !before.observed.every((line, index) => after.observed[index] === line))
      return pending()
    return core.ok({
      status: succeeded ? 'succeeded' : 'restored',
      deploymentId: id,
      receipt,
      proof: { deploymentId: running.deploymentId, runtime: target.runtime, images },
    })
  }
  catch {
    return pending()
  }
}
