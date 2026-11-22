import type { HaiResult } from '@h-ai/core'
import type { DockerSshProviderConfig } from './deploy-config.js'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { basename, isAbsolute } from 'node:path'
import { rootCertificates } from 'node:tls'
import { err, ok } from '@h-ai/core'
import { z } from 'zod'
import { uploadAndApplyBundle } from './container/deploy-bundle-transport.js'
import { runCommand } from './container/deploy-command.js'
import { shellArgument } from './container/deploy-scripts.js'
import { createSshExecutor, usesSshPassword } from './container/deploy-ssh.js'
import { artifactChecksum } from './deploy-artifact.js'
import { ProviderConfigSchema } from './deploy-config.js'
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
    ssh: createSshExecutor(provider.ssh, true),
  }
}

async function checkedFile(path: string, sha256: string, signal?: AbortSignal) {
  signal?.throwIfAborted()
  return isAbsolute(path) && (await lstat(path)).isFile() && await realpath(path) === path
    && await artifactChecksum(path, signal) === sha256
}

async function archiveManifest(path: string, member: string, signal?: AbortSignal) {
  const result = await runCommand('tar', ['-xOf', path, member], { signal, timeoutMs: 90_000, maxCaptureChars: 65_536 })
  if (!result.success || result.data.stdoutTruncated)
    throw new Error('Archive manifest unavailable')
  return JSON.parse(result.data.stdout) as unknown
}

const invalid = () => err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))

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
    const manifest = bundleMetadata.parse(await archiveManifest(input.bundlePath, './manifest.json', signal))
    const identity = manifest.deploymentTarget
    if (manifest.deploymentId !== input.deploymentId || identity.projectName !== target.projectName
      || identity.directory !== target.directory || identity.runtime !== target.runtime || identity.host !== target.connection.host
      || identity.port !== target.connection.port || identity.username !== target.connection.username) {
      return invalid()
    }
    const { result } = await uploadAndApplyBundle(target.ssh, input.bundlePath, target.directory, 'apply.sh', {
      signal,
      discardOutput: true,
      bundleSha256: input.bundleSha256,
    })
    if (!result.success) {
      const state = getDeployCommandState(result.error)
      return err({
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
    return ok({ deploymentId: input.deploymentId })
  }
  catch {
    if (signal?.aborted)
      return err(HaiDeployError.REMOTE_COMMAND_FAILED, deployM('deploy_commandCancelled'))
    return invalid()
  }
}

function validatedHealthUrl(input: DeployReleaseVerification, target: ReturnType<typeof resolveTarget>): URL {
  const url = new URL(input.healthUrl)
  const https = target.provider.expose.https
  const host = https?.domain ?? target.connection.host
  const canonicalHost = host?.includes(':')
    ? `[${host}]`
    : host
  if (url.protocol !== (https ? 'https:' : 'http:') || url.hostname !== canonicalHost?.toLowerCase()
    || Number(url.port || (https ? 443 : 80)) !== (https?.port ?? target.provider.expose.hostPort)
    || url.username || url.password || url.hash || url.search
    || (input.caFile && (!https || !isAbsolute(input.caFile)))) {
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
    // docker save / podman save --format docker-archive 使用镜像配置摘要命名条目。
    // 容器 inspect 的 .Image 是该配置摘要，与外层 tar 摘要含义不同。
    const entries = savedImageSchema.parse(await archiveManifest(archivePath, 'manifest.json', signal))
    const entry = entries[0]!
    const imageId = /^(?:blobs\/sha256\/([a-f\d]{64})|([a-f\d]{64})\.json)$/.exec(entry.Config)
    if (!imageId || !entry.RepoTags?.includes(reference))
      throw new Error('Image configuration digest unavailable')
    return {
      role,
      reference,
      archiveSha256,
      imageId: (imageId[1] ?? imageId[2])!,
    }
  }))
}

async function remoteSnapshot(target: ReturnType<typeof resolveTarget>, id: string, roles: readonly ('serv' | 'web')[], signal?: AbortSignal) {
  const quote = shellArgument
  const snapshots = roles.map(role =>
    `${target.runtime} container inspect --format '{{.Image}} {{.State.Running}}' ${quote(`hai-${target.projectName}-${role}`)}`)
  const result = await target.ssh.exec([
    'set -eu',
    `root=${quote(target.directory)}`,
    'test -f "$root/.deploy.lock" && test ! -L "$root/.deploy.lock"',
    'exec 9<"$root/.deploy.lock"',
    'flock -sn 9',
    `receipt="$root/result-${id}.json"`,
    'test -f "$receipt" && test ! -L "$receipt"',
    'test "$(wc -c < "$receipt")" -le 8192',
    'head -c 8192 "$receipt"',
    'current=""',
    'if [ -e "$root/current" ] || [ -L "$root/current" ]; then',
    '  test -f "$root/current" && test ! -L "$root/current"',
    '  current=$(head -c 129 "$root/current")',
    '  case "$current" in ""|*[!a-zA-Z0-9._-]*) exit 1;; esac',
    '  test -f "$root/releases/$current/.hai/compose.json"',
    'fi',
    'printf "%s\\n" "$current"',
    ...(roles.length
      ? snapshots
      : [`if [ -z "$current" ]; then ${target.runtime} ps --format '{{.Names}}'; fi`]),
  ].join('\n'), { timeoutMs: 15_000, maxCaptureChars: 16_384, signal })
  if (!result.success || result.data.stdoutTruncated)
    throw new Error('Remote release unavailable')
  const [body, current, ...observed] = result.data.stdout.replace(/\r?\n$/, '').split(/\r?\n/)
  const receipt = receiptSchema.parse(JSON.parse(body ?? ''))
  if (receipt.deploymentId !== id)
    throw new Error('Wrong remote receipt')
  return { receipt, current, observed }
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
  const pending = (): HaiResult<DeployReleaseVerificationResult> => ok({ status: 'pending_verify', deploymentId: id })
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
        ? ok({ status: 'failed', deploymentId: id, receipt })
        : pending()
    }
    await input.prepareImages?.(running.deploymentId, signal)
    const images = await expectedImages(running, signal)
    const roles = images.map(image => image.role)
    const agrees = (snapshot: Awaited<ReturnType<typeof remoteSnapshot>>) => snapshot.current === running.deploymentId
      && snapshot.receipt.exitCode === receipt.exitCode && snapshot.receipt.stage === receipt.stage
      && snapshot.receipt.recoveryStatus === receipt.recoveryStatus && snapshot.observed.length === images.length
      && images.every((image, index) => snapshot.observed[index]?.replace(/^sha256:/, '') === `${image.imageId} true`)
    const before = await remoteSnapshot(target, id, roles, signal)
    if (!agrees(before) || !await healthy(health, input.caFile, signal) || !agrees(await remoteSnapshot(target, id, roles, signal)))
      return pending()
    return ok({
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
