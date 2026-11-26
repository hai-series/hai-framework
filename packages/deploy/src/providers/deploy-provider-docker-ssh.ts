/**
 * @h-ai/deploy — docker-ssh 部署 Provider
 *
 * 基于 OCI 镜像 + Docker Compose + SSH 的通用主机部署：消费已有镜像 → tar 打包 → SSH 传输 →
 * 远程 load → compose up → HTTP 健康检查。远程需 SSH、Linux flock/基础工具及 docker/podman + compose。
 * @module deploy-provider-docker-ssh
 */

import type { HaiResult } from '@h-ai/core'
import type {
  ContainerDeployContext,
  ContainerDeployProvider,
  ContainerRuntime,
} from '../container/deploy-container-types.js'
import type { DeployConfig, DockerSshProviderConfig } from '../deploy-config.js'
import type { DeployResult } from '../deploy-types.js'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { request as requestHttps } from 'node:https'
import { basename, dirname, join, resolve } from 'node:path'
import { rootCertificates } from 'node:tls'
import { parseEnv } from 'node:util'
import { apiContract } from '@h-ai/api-contract/feedback'
import { core, CoreConfigSchema, RequestAccessConfigSchema } from '@h-ai/core'
import { crypto } from '@h-ai/crypto'
import { stringify } from 'yaml'
import { z } from 'zod'
import { uploadAndApplyBundle } from '../container/deploy-bundle-transport.js'
import { createDeploymentBundle } from '../container/deploy-bundle.js'
import { maskSecrets } from '../container/deploy-command.js'
import {
  buildRuntimeEnv,
  generateApplicationProxyConfig,
  generateComposeFile,
  generateStaticWebConfig,
  generateWebProxyConfig,
  serializeEnvFile,
} from '../container/deploy-container-compose.js'
import { createHttpsAssets, renderHttpsProxy } from '../container/deploy-https.js'
import { deploymentRuntimeFunctions } from '../container/deploy-runtime-selection.js'
import { shellArgument } from '../container/deploy-scripts.js'
import { createSshExecutor } from '../container/deploy-ssh.js'
import configurationShapes from '../deploy-config-shapes.json' with { type: 'json' }
import { deploymentOrigin } from '../deploy-config.js'
import { describeDeploymentVariableSources, loadDeploymentConfig, loadDeploymentEnvironment, mergeEnvironmentLayers, saveDeploymentEnvironment } from '../deploy-environment.js'
import { resolveProjectDirectory } from '../deploy-functions.js'
import { deployM } from '../deploy-i18n.js'
import { getDeployCommandState } from '../deploy-recovery.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provider-docker-ssh' })

// 构建时从 Feedback 的输入 Schema 生成；部署无需加载反馈或初始化存储。
const feedbackLimitsSchema = z.fromJSONSchema(configurationShapes.feedback.properties.limits as Parameters<typeof z.fromJSONSchema>[0])
  .pipe(z.record(z.string(), z.number()))
  .optional()

/** 健康检查轮询间隔（毫秒） */
const HEALTH_POLL_INTERVAL = 3000

/** 只处理本次选中的应用配置；文件按应用目录读取，运行期路径不回写调用方环境。 */
function prepareRequestAccess(options: { settings: Record<string, unknown>, module: 'serv' | 'kit', directory: string }): HaiResult<{ settings: Record<string, unknown>, snapshot?: string }> {
  const scope = options.module === 'serv'
    ? options.settings.http
    : options.settings
  if (!scope || typeof scope !== 'object' || !('access' in scope))
    return core.ok({ settings: options.settings })
  const configured = RequestAccessConfigSchema.safeParse(scope.access)
  if (!configured.success) {
    return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_requestAccessInvalid', {
      params: {
        field: options.module === 'serv'
          ? 'serv.http.access'
          : 'kit.access',
      },
    }))
  }
  try {
    const policy = core.access.loadPolicy(configured.data, options.directory)
    const check = core.access.createRequestCheck(policy)
    if (check.requiresEncryption && !options.settings.transport)
      throw new Error('Transport encryption is required but not configured')
    if (configured.data === false || !('file' in configured.data))
      return core.ok({ settings: options.settings })
    const access = { file: '/run/hai/request-access.yml' }
    const settings = options.module === 'serv'
      ? {
          ...options.settings,
          http: { ...scope, access },
        }
      : { ...options.settings, access }
    return core.ok({
      settings,
      snapshot: stringify(policy, { aliasDuplicateObjects: false }),
    })
  }
  catch {
    return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_requestAccessInvalid', {
      params: {
        field: options.module === 'serv'
          ? 'serv.http.access'
          : 'kit.access',
      },
    }))
  }
}

/** 健康检查最大轮询次数 */
const HEALTH_MAX_ATTEMPTS = 40

/** 只提取 Serv 已注册的精确路径；阻止配置路径进入 Nginx 指令或 shell 语法。 */
function servicePath(value: unknown, fallback: string): string {
  const path = value ?? fallback
  if (typeof path !== 'string' || !/^\/[\w./-]*$/.test(path) || path.includes('//') || path.split('/').some(part => part === '.' || part === '..'))
    throw new Error('Invalid service endpoint path')
  return path
}

/** 未配置的健康检查沿用 Serv 默认；文档必须显式使用对象启用。 */
function endpointSettings(value: unknown): Record<string, unknown> {
  if (value === undefined)
    return {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid service endpoint configuration')
  return value as Record<string, unknown>
}

/** 只接收服务器脚本原子发布的终态；匹配 ID 后才能确认本次执行完成。 */
const ServerResultSchema = z.object({
  deploymentId: z.string(),
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
  ]).optional(),
})

/** 生成不可变部署 ID：`YYYYMMDD-HHmmss-<random>`。 */
function makeDeploymentId(): string {
  return `${core.time.formatDate(new Date(), 'YYYYMMDD-HHmmss')}-${randomBytes(3).toString('hex')}`
}

/** 睡眠指定毫秒。 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 创建 docker-ssh 部署 Provider。
 * @param config - docker-ssh Provider 配置
 * @param container - Compose 中间件参数
 * @returns 容器部署 Provider 实例
 * @example 模块内部上下文
 * ```ts
 * const provider = createDockerSshProvider({ type: 'docker-ssh', remote: { baseDir: '/opt/hai/apps', runtime: 'auto' }, expose: { type: 'port', hostPort: 8080, containerPort: 3000 } })
 * const name = provider.name // 创建本身不连接 SSH；在线发布仍需有效 SSH 配置。
 *```
 */
export function createDockerSshProvider(
  config: DockerSshProviderConfig,
  container?: DeployConfig['container'],
): ContainerDeployProvider {
  const ssh = config.ssh
    ? createSshExecutor(config.ssh)
    : undefined
  const baseDir = config.remote.baseDir

  /** 探测远程容器运行时与 compose 可用性。 */
  async function detectRemoteRuntime(): Promise<HaiResult<ContainerRuntime>> {
    if (!ssh)
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_sshRequired'))
    const { runtime, dockerMode } = config.remote
    const checked = await ssh.exec([
      'set -eu',
      deploymentRuntimeFunctions,
      `select_deployment_runtime ${shellArgument(runtime)} ${shellArgument(dockerMode ?? 'default')}`,
      'check_deployment_compose',
      'printf "%s\\n" "$runtime"',
    ].join('\n'), { timeoutMs: 30_000, maxCaptureChars: 4096 })
    if (!checked.success)
      return checked
    const selected = checked.data.stdout.trim()
    if (!checked.data.stdoutTruncated && (selected === 'docker' || selected === 'podman')) {
      logger.info('Remote container runtime detected', { runtime: selected, dockerMode })
      return core.ok(selected)
    }
    return core.err(
      HaiDeployError.REMOTE_COMMAND_FAILED,
      deployM('deploy_remoteRuntimeMissing', {
        params: {
          runtime,
        },
      }),
    )
  }

  /** HTTP 健康检查：轮询访问地址直到返回成功。 */
  async function healthCheck(url: string, { certificate, external }: { certificate?: string, external: boolean }): Promise<boolean> {
    for (let attempt = 0; attempt < HEALTH_MAX_ATTEMPTS; attempt++) {
      try {
        if (certificate) {
          const healthy = await new Promise<boolean>((resolve) => {
            const request = requestHttps(url, {
              ca: [...rootCertificates, certificate],
              timeout: 5000,
            }, (response) => {
              response.resume()
              resolve(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300)
            })
            request.on('error', () => resolve(false))
            request.on('close', () => resolve(false))
            request.on('timeout', () => request.destroy())
            request.end()
          })
          if (healthy)
            return true
        }
        else {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
            redirect: external ? 'manual' : 'follow',
          })
          // 健康检查只消费状态码，主动释放响应体和连接，避免失败轮询积压未读数据。
          await response.body?.cancel()
          if (response.ok)
            return true
        }
      }
      catch {
        // 未就绪，继续轮询
      }
      await sleep(HEALTH_POLL_INTERVAL)
    }
    return false
  }

  const deploy = async (context: ContainerDeployContext): Promise<HaiResult<DeployResult>> => {
    const { appDir, projectName, scan, provisionEnv, appEnv, options } = context
    const deploymentId = makeDeploymentId()
    const { hostAddress, hostPort, https, publicUrl } = config.expose
    const httpsAssets = https
      ? createHttpsAssets(https, resolveProjectDirectory(appDir))
      : undefined
    const deploymentRoot = join(resolveProjectDirectory(appDir), '.hai', 'deploy', options?.environment ?? 'prod')
    const artifact = context.artifact
    const resolvedBuildDir = context.artifactDir
    const images = artifact.images
    const web = images.find(image => image.name === 'web')
    const primaryService = artifact.primaryService
    const app = images.find(image => image.name === primaryService)
    if (options?.selectedServices) {
      const available: string[] = [
        ...images.map(image => image.name),
        ...scan.requiredServices,
      ]
      const invalid = options.selectedServices.find(name => !available.includes(name))
      if (!options.selectedServices.length || new Set(options.selectedServices).size !== options.selectedServices.length || invalid) {
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_selectionInvalid', {
          params: { service: invalid ?? options.selectedServices.join(', ') },
        }))
      }
    }
    const hasWebProxy = primaryService === 'serv' && artifact.hasWeb
    const partial = artifact.partial || options?.selectedServices !== undefined
    const containerPort = app?.containerPort ?? (primaryService === 'serv'
      ? artifact.servContainerPort
      : artifact.webContainerPort) ?? config.expose.containerPort
    const webContainerPort = web?.containerPort ?? artifact.webContainerPort ?? 8080
    const url = deploymentOrigin(config)
    const webBasePath = artifact.webBasePath
    const applicationUrl = `${url}${webBasePath
      ? `${webBasePath}/`
      : ''}`
    const standaloneWebConfig = primaryService === 'web' && !scan.isSvelteKit && Boolean(webBasePath || https || publicUrl)
    const healthPaths = hasWebProxy
      ? ['/_hai/web-health', `${webBasePath}/`]
      : scan.isSvelteKit
        ? [`${webBasePath}/`]
        : primaryService === 'serv'
          ? []
          : standaloneWebConfig
            ? ['/health', `${webBasePath}/`]
            : ['/health']

    // 先保存开通结果和 sidecar 凭据，传输失败后仍可检查与复用配置。
    const plannedRuntime = buildRuntimeEnv(appDir, projectName, scan, provisionEnv, containerPort, options, appEnv, container?.s3Engine)
    const { sidecar } = plannedRuntime
    let { env } = plannedRuntime
    const managedStorage = sidecar.services.includes('storage')
      ? JSON.parse(sidecar.env.HAI_STORAGE) as { bucket: string, secretAccessKey: string, publicEndpoint?: unknown }
      : undefined
    let storageBasePath = ''
    if (managedStorage?.publicEndpoint !== undefined) {
      // 与 Storage 的公开端点约束一致，在归档/上传前报告错误，不输出配置中的 URL 或秘密。
      try {
        if (typeof managedStorage.publicEndpoint !== 'string')
          throw new TypeError('Invalid public endpoint type')
        // eslint-disable-next-line no-control-regex -- 在 URL 标准化前拒绝控制字符及编码目录。
        const unsafeCharacters = /[\u0000-\u0020\u007F\\%]/.test(managedStorage.publicEndpoint)
        const endpoint = new URL(managedStorage.publicEndpoint)
        if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
          || !/^\/(?:[\w.-]+(?:\/[\w.-]+)*\/?)?$/.test(endpoint.pathname)
          || unsafeCharacters || /(?:^|\/)\.{1,2}(?:\/|$)/.test(managedStorage.publicEndpoint)) {
          throw new Error('Invalid public endpoint origin')
        }
        storageBasePath = endpoint.pathname.replace(/\/+$/, '')
      }
      catch {
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_storagePublicEndpointInvalid'))
      }
    }
    // 应用增量继承已安装连接配置；对外地址或桶等配置改变须全量切换，不能静默沿用旧值。
    const storageRouting = managedStorage
      ? createHash('sha256').update(JSON.stringify({ ...managedStorage, secretAccessKey: undefined })).digest('hex')
      : ''
    // SSR 始终通过私有网关，独立 API 在需要存储路由或 HTTPS 转发时使用同一网关。
    const gateway = !hasWebProxy && (scan.isSvelteKit || !!managedStorage || (primaryService === 'serv' && Boolean(https || publicUrl)))
    if (gateway && primaryService === 'web' && !scan.isSvelteKit)
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_storageBackendRequired'))
    const proxyService = gateway ? 'gateway' : 'web'
    if (gateway)
      healthPaths.push('/_hai/gateway-health')
    const updatesApp = options?.selectedServices
      ? options.selectedServices.includes(primaryService)
      : !!app
    const cookieSecure = env.HAI_SERV_REFRESH_COOKIE_SECURE
    if (updatesApp && cookieSecure && cookieSecure !== 'true' && cookieSecure !== 'false')
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_refreshCookieSecureInvalid'))
    if (updatesApp && !sidecar.services.includes('db') && !provisionEnv.HAI_DB) {
      const database = scan.middlewares?.find(item => item.service === 'db' && item.backend === 'postgresql')?.config
      if (typeof database?.url === 'string' && database.url && typeof database.password === 'string' && database.password) {
        try {
          const url = new URL(database.url)
          const urlPassword = url.searchParams.getAll('password').at(-1) || decodeURIComponent(url.password)
          if (urlPassword !== database.password)
            return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_postgresPasswordConflict'))
        }
        catch {
          // 非法连接串交由 PostgreSQL 驱动报告，避免错误中泄漏连接值。
        }
      }
    }
    const serverPath = join(appDir, 'config', '_serv.yml')
    const server = existsSync(serverPath) || hasWebProxy
      ? loadDeploymentConfig('serv', serverPath, env)
      : core.ok<Record<string, unknown>>({})
    if (!server.success)
      return server
    const backendPaths: string[] = []
    try {
      const http = endpointSettings(server.data.http)
      if (primaryService === 'serv' && http.health !== false) {
        const health = endpointSettings(http.health)
        const path = servicePath(health.path, '/health')
        healthPaths.unshift(path)
        backendPaths.push(path, servicePath(health.readyPath, '/ready'))
      }
      if (hasWebProxy) {
        // 生成应用按 Core 环境关闭生产文档，不能用部署目标名或 NODE_ENV 猜测启用状态。
        const corePath = join(appDir, 'config', '_core.yml')
        const settings = existsSync(corePath)
          ? loadDeploymentConfig('core', corePath, env)
          : core.ok(env.HAI_CORE
              ? JSON.parse(env.HAI_CORE)
              : { env: env.HAI_CORE_ENV })
        if (!settings.success)
          return settings
        const application = CoreConfigSchema.safeParse(settings.data)
        if (!application.success)
          return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_webProxyInvalid'))
        if (application.data.env !== 'production') {
          if (http.openapi !== undefined && http.openapi !== false)
            backendPaths.push(servicePath(endpointSettings(http.openapi).path, '/openapi.json'))
          if (http.docs !== undefined && http.docs !== false) {
            const docsPath = servicePath(endpointSettings(http.docs).path, '/docs')
            backendPaths.push(docsPath, `${docsPath.slice(0, docsPath.lastIndexOf('/') + 1)}_hai/scalar.js`)
          }
        }
      }
    }
    catch {
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_webProxyInvalid'))
    }
    let requestAccessSnapshot: string | undefined
    if (updatesApp && primaryService === 'serv') {
      const prepared = prepareRequestAccess({ settings: server.data, module: 'serv', directory: appDir })
      if (!prepared.success)
        return prepared
      Object.assign(server.data, prepared.data.settings)
      requestAccessSnapshot = prepared.data.snapshot
      if (requestAccessSnapshot) {
        env = mergeEnvironmentLayers([
          env,
          {
            HAI_SERV: JSON.stringify(server.data),
          },
        ])
      }
    }
    let feedbackTransportBytes: number | undefined
    if (scan.haiModules?.includes('@h-ai/feedback')) {
      const policy = loadDeploymentConfig('feedback', join(appDir, 'config', '_feedback.yml'), env)
      if (!policy.success)
        return policy
      try {
        const limits = feedbackLimitsSchema.parse(policy.data.limits)
        feedbackTransportBytes = apiContract.resolveFeedbackBudget(limits).maxTransportBytes
      }
      catch {
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_transportBodyLimitInvalid'))
      }
    }
    let protectedTransport = !!server.data.transport
    let applicationPlaintextBytes: number | undefined
    if (scan.isSvelteKit) {
      const kitPath = join(appDir, 'config', '_kit.yml')
      const kit = existsSync(kitPath)
        ? loadDeploymentConfig('kit', kitPath, env)
        : core.ok({})
      if (!kit.success)
        return kit
      if (updatesApp) {
        const prepared = prepareRequestAccess({ settings: kit.data, module: 'kit', directory: appDir })
        if (!prepared.success)
          return prepared
        Object.assign(kit.data, prepared.data.settings)
        requestAccessSnapshot = prepared.data.snapshot
        if (requestAccessSnapshot) {
          env = mergeEnvironmentLayers([
            env,
            {
              HAI_KIT: JSON.stringify(kit.data),
            },
          ])
        }
      }
      const transport = (kit.data as Record<string, unknown>).transport
      if (transport && typeof transport === 'object') {
        protectedTransport = !('enabled' in transport) || transport.enabled !== false
        try {
          const configured = (transport as { maxPlaintextBytes?: number | 'auto' }).maxPlaintextBytes
          const routes = (transport as { routePlaintextBytes?: Record<string, number> }).routePlaintextBytes
          const limits = crypto.transport.resolveBodyLimits(Math.max(crypto.transport.createBodyPolicy(configured === 'auto'
            ? undefined
            : configured, routes).maximum.plaintextBytes, feedbackTransportBytes ?? 0))
          // adapter-node 默认容量比 transport 小；正式部署必须使用同一派生密文预算。
          env.BODY_SIZE_LIMIT = String(limits.encryptedPayloadBytes)
          applicationPlaintextBytes = limits.plaintextBytes
        }
        catch (error) {
          return core.err(HaiDeployError.CONFIG_ERROR, error instanceof RangeError
            ? error.message
            : deployM('deploy_transportBodyLimitInvalid'))
        }
      }
    }
    if (updatesApp && protectedTransport && scan.haiModules?.includes('@h-ai/crypto') && !crypto.transport.parseServerKeyRing(env.HAI_CRYPTO_TRANSPORT_SERVERKEYRING).success) {
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_transportKeyRingInvalid', {
        params: {
          path: join(scan.envDir ?? appDir, `.env.${options?.environment ?? 'prod'}.local`),
        },
      }))
    }
    let webProxy: string | undefined
    if (hasWebProxy) {
      // 路由取当前服务的真实配置，不扫描相邻应用或猜测 fullstack 布局。
      const http = server.data.http as { apiPrefix?: string } | undefined
      const apiPrefix = http?.apiPrefix ?? '/api/v1'
      if (typeof apiPrefix !== 'string' || !/^\/[\w.-]+(?:\/[\w.-]+)*$/.test(apiPrefix) || apiPrefix.split('/').some(part => part === '.' || part === '..')) {
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_webProxyInvalid'))
      }
      if (webBasePath && ([...backendPaths, '/_hai/web-health'].includes(webBasePath) || webBasePath === apiPrefix.replace(/\/+$/, '') || webBasePath.startsWith(`${apiPrefix.replace(/\/+$/, '')}/`)))
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_webBaseConflict'))
      const transport = server.data.transport as { maxPlaintextBytes?: number | 'auto', routePlaintextBytes?: Record<string, number> } | false | undefined
      try {
        const configured = transport ? transport.maxPlaintextBytes : undefined
        const limits = crypto.transport.resolveBodyLimits(Math.max(crypto.transport.createBodyPolicy(configured === 'auto'
          ? undefined
          : configured, transport ? transport.routePlaintextBytes : undefined).maximum.plaintextBytes, feedbackTransportBytes ?? 0))
        webProxy = generateWebProxyConfig(containerPort, apiPrefix, {
          webPort: webContainerPort,
          maxPlaintextBytes: limits.plaintextBytes,
          webBasePath,
          backendPaths,
          storageBucket: managedStorage?.bucket,
          storageBasePath,
          trustedEdgeProxies: config.trustedEdgeProxies,
        })
      }
      catch (error) {
        return core.err(HaiDeployError.CONFIG_ERROR, error instanceof RangeError
          ? error.message
          : deployM(managedStorage ? 'deploy_storageProxyInvalid' : 'deploy_transportBodyLimitInvalid'))
      }
    }
    else if (gateway) {
      try {
        const http = server.data.http as { apiPrefix?: string } | undefined
        if (primaryService === 'serv') {
          const transport = server.data.transport as { maxPlaintextBytes?: number | 'auto', routePlaintextBytes?: Record<string, number> } | undefined
          applicationPlaintextBytes = Math.max(crypto.transport.createBodyPolicy(transport?.maxPlaintextBytes === 'auto'
            ? undefined
            : transport?.maxPlaintextBytes, transport?.routePlaintextBytes).maximum.plaintextBytes, feedbackTransportBytes ?? 0)
        }
        webProxy = generateApplicationProxyConfig({
          primaryService,
          port: containerPort,
          bucket: managedStorage?.bucket,
          storageBasePath,
          reservedPaths: [
            http?.apiPrefix ?? '/api/v1',
            ...(storageBasePath
              ? [`${webBasePath}/_app`, `${webBasePath}/assets`, `${webBasePath}/runtime-config.js`]
              : [webBasePath]),
          ],
          maxPlaintextBytes: applicationPlaintextBytes,
          trustedEdgeProxies: config.trustedEdgeProxies,
        })
      }
      catch {
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_storageProxyInvalid'))
      }
    }
    else if (standaloneWebConfig) {
      if (['/health', '/_hai/web-health'].includes(webBasePath))
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_webBaseConflict'))
      webProxy = generateStaticWebConfig(containerPort, webBasePath)
    }
    if (https && webProxy) {
      webProxy = renderHttpsProxy(webProxy, https, hasWebProxy
        ? webContainerPort
        : gateway ? 8080 : containerPort)
    }
    if (primaryService === 'serv' && (hasWebProxy || https || publicUrl)) {
      const cors = server.data.cors as { origin?: string } | undefined
      // 每次从当前配置生成默认 Origin，保留应用显式设置的来源。
      env = mergeEnvironmentLayers([
        env,
        {
          HAI_SERV: JSON.stringify({
            ...server.data,
            cors: {
              ...cors,
              origin: cors?.origin && cors.origin !== '*'
                ? cors.origin
                : (config.ssh || https || publicUrl)
                    ? new URL(url).origin
                    : '*',
            },
          }),
        },
      ])
    }
    // 一次交付对应一个目录；自定义同名输出也不覆盖已经可复制的旧包。
    const requestedOutput = options?.output ?? join(deploymentRoot, `bundle-${projectName}-${deploymentId}-${artifact.appVersion}.tar.gz`)
    const compressed = requestedOutput.endsWith('.tar.gz')
    const stem = basename(requestedOutput).replace(/\.tar(?:\.gz)?$/i, '')
    const suffix = `-${artifact.appVersion}`
    const name = stem.endsWith(suffix)
      ? stem
      : `${stem}${suffix}`
    if (!/^[\w.+-]+$/.test(name))
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_bundleNameInvalid'))
    const artifactDir = resolve(dirname(requestedOutput), name)
    if (existsSync(artifactDir)) {
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_bundleDirectoryExists', {
        params: { path: artifactDir },
      }))
    }
    mkdirSync(dirname(artifactDir), { recursive: true, mode: 0o700 })
    mkdirSync(artifactDir, { mode: 0o700 })
    chmodSync(artifactDir, 0o700)
    const envPath = join(artifactDir, '.env.runtime')
    const nodeRuntime = primaryService === 'serv' || scan.isSvelteKit
    const startupOverrides: Record<string, string> = nodeRuntime
      ? { NODE_OPTIONS: '', HAI_DEPLOY_PRIVATE_PROXY: '' }
      : {}
    if (scan.isSvelteKit) {
      // adapter-node 6 不读取 ORIGIN；转发信任是部署拓扑，不能由运行配置覆盖。
      for (const name of [
        'ORIGIN',
        'PROTOCOL_HEADER',
        'HOST_HEADER',
        'PORT_HEADER',
        'ADDRESS_HEADER',
        'XFF_DEPTH',
      ])
        startupOverrides[name] = ''
    }
    const runtimeEnvironment = serializeEnvFile(env, startupOverrides, nodeRuntime ? 'node' : 'compose')
    const envVarsSet = [
      ...new Set([
        ...Object.keys(parseEnv(runtimeEnvironment)),
        ...(nodeRuntime
          ? ['NODE_OPTIONS']
          : []),
        ...(hasWebProxy || gateway
          ? ['HAI_DEPLOY_PRIVATE_PROXY']
          : []),
        ...(scan.isSvelteKit
          ? [
              'PROTOCOL_HEADER',
              'HOST_HEADER',
              'PORT_HEADER',
              'ADDRESS_HEADER',
              'XFF_DEPTH',
            ]
          : []),
      ]),
    ]
    writeFileSync(envPath, runtimeEnvironment, { mode: 0o600 })
    if (requestAccessSnapshot)
      writeFileSync(join(artifactDir, 'request-access.yml'), requestAccessSnapshot, { mode: 0o600 })
    writeFileSync(join(artifactDir, 'middleware-runtime.env'), core.config.stringifyEnv(sidecar.containerEnv, { target: 'compose' }), { mode: 0o600 })
    if (options?.environment) {
      const environment = loadDeploymentEnvironment({ environment: options.environment, envDir: options.envDir ?? scan.envDir ?? appDir })
      if (!environment.success)
        return environment
      const saved = saveDeploymentEnvironment(environment.data, {
        HAI_DEPLOY_ENVIRONMENT: environment.data.environment,
        HAI_CORE_ENV: environment.data.values.HAI_CORE_ENV,
        ...sidecar.env,
        ...provisionEnv,
      })
      if (!saved.success)
        return saved
    }

    const composeName = `docker-compose-${artifact.appVersion}.yml`
    const composeContent = generateComposeFile({
      projectName,
      appVersion: artifact.appVersion,
      imageRef: app?.imageRef ?? 'localhost/hai-unselected:0',
      hostAddress,
      hostPort,
      containerPort,
      primaryService,
      requestAccessPolicy: requestAccessSnapshot !== undefined,
      nodeRuntime,
      nodeOptions: env.NODE_OPTIONS,
      sidecar,
      web: hasWebProxy
        ? { imageRef: web?.imageRef ?? 'localhost/hai-unselected:0', containerPort: webContainerPort }
        : undefined,
      mountWebConfig: standaloneWebConfig,
      gateway,
      https,
      compose: container?.compose,
    })
    const composePath = join(artifactDir, composeName)
    writeFileSync(composePath, composeContent)
    if (webProxy)
      writeFileSync(join(artifactDir, 'web.conf'), webProxy)
    const selected = options?.selectedServices
      ? [...options.selectedServices]
      : artifact.partial
        ? images.map(image => image.name)
        : [
            ...images.map(image => image.name),
            ...Object.keys(sidecar.composeServices),
          ]
    if (gateway && !partial)
      selected.push('gateway')
    if (https?.type === 'letsencrypt' && !partial)
      selected.push('certbot')
    if (!selected.length || selected.some(name => !/^[a-z][a-z0-9-]*$/.test(name)) || new Set(selected).size !== selected.length) {
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_selectionInvalid', {
        params: {
          service: selected.join(', '),
        },
      }))
    }
    for (const name of selected) {
      if (['serv', 'web'].includes(name) && !images.some(image => image.name === name)) {
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_selectionInvalid', {
          params: { service: name },
        }))
      }
    }
    options?.onProgress?.('packaging')
    const bundle = await createDeploymentBundle({
      directory: artifactDir,
      artifactDir: resolvedBuildDir,
      artifact,
      projectName,
      environment: options?.environment ?? 'prod',
      deploymentId,
      config,
      runtime: options?.runtime ?? 'auto',
      imageSource: options?.imageSource,
      proxy: options?.proxy,
      selected,
      partial,
      hasWebConfig: !!webProxy,
      proxyService,
      storageRouting,
      containerPort,
      managedAppKeys: Object.keys(sidecar.env),
      unmanagedAppKeys: scan.middlewares?.filter(item => !Object.hasOwn(sidecar.env, item.envPrefix)).map(item => item.envPrefix),
      accountSources: describeDeploymentVariableSources(options?.envDir ?? scan.envDir ?? appDir, options?.environment ?? 'prod', env, [
        'HAI_ADMIN_DEFAULT_PASSWORD',
        'HAI_AUDIT_ADMIN_PASSWORD',
        'HAI_CONFIG_ADMIN_PASSWORD',
        'HAI_BUSINESS_OPERATOR_PASSWORD',
      ]),
      healthPaths,
      httpsAssets,
      output: join(artifactDir, `${name}.tar${compressed ? '.gz' : ''}`),
      cacheDirectory: join(resolveProjectDirectory(appDir), '.hai', 'cache', 'images'),
    })
    if (options?.bundleOnly) {
      return core.ok({
        url: '',
        deploymentId,
        status: 'packaged',
        provider: 'docker-ssh',
        healthCheck: 'skipped',
        envVarsSet,
        ...bundle,
      })
    }
    if (!ssh)
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_sshRequired'))
    const ping = await ssh.ping()
    if (!ping.success)
      return ping
    const remoteRuntime = await detectRemoteRuntime()
    if (!remoteRuntime.success)
      return remoteRuntime
    const remoteDir = `${baseDir}/${projectName}`
    let pendingOutput = ''
    const { started: didStart, result: started } = await uploadAndApplyBundle(
      ssh,
      bundle.bundlePath,
      remoteDir,
      bundle.startName,
      {
        secrets: sidecar.secrets,
        onOutput: (output) => {
          const parts = output.split('\n')
          for (let index = 0; index < parts.length; index++) {
          // 进度仅解析行首标签，不保留无限长的构建日志行。
            pendingOutput += parts[index]!.slice(0, 512 - pendingOutput.length)
            if (index === parts.length - 1)
              break
            const line = pendingOutput
            pendingOutput = ''
            const stage = /^\[(preflight|images|dependencies|start|https|health|complete)\]/.exec(line)?.[1]
            if (stage)
              options?.onProgress?.(stage as 'preflight' | 'images' | 'dependencies' | 'start' | 'https' | 'health' | 'complete')
          }
        },
      },
    )
    if (!didStart)
      return started
    if (!started.success) {
      const resultFile = `${remoteDir}/result-${deploymentId}.json`
      const state = getDeployCommandState(started.error)
      // 独立连接只读核对，绝不因超时自动再运行 apply 或无条件恢复容器。
      const checked = await ssh.exec(`if [ -f ${shellArgument(resultFile)} ]; then cat -- ${shellArgument(resultFile)}; fi`, { timeoutMs: 20_000, maxCaptureChars: 8192 })
      let terminal: z.infer<typeof ServerResultSchema> | undefined
      if (checked.success && !checked.data.stdoutTruncated) {
        try {
          const parsed = ServerResultSchema.safeParse(JSON.parse(checked.data.stdout))
          if (parsed.success && parsed.data.deploymentId === deploymentId)
            terminal = parsed.data
        }
        catch {
          // 缺失、损坏、超限或不匹配的记录都不能证明远端已停止。
        }
      }
      return core.err({
        ...started.error,
        message: `${started.error.message}\n${terminal
          ? deployM('deploy_remoteFinished', {
              params: {
                stage: terminal.stage,
                code: String(terminal.exitCode),
              },
            })
          : deployM('deploy_remoteUnknown')}`,
        suggestion: terminal
          ? deployM('deploy_remoteFinished', {
              params: {
                stage: terminal.stage,
                code: String(terminal.exitCode),
              },
            })
          : deployM('deploy_remoteUnknown'),
        ext: {
          ...started.error.ext,
          commandExecution: {
            ...state,
            reason: state?.reason ?? 'exit',
            localTermination: state?.localTermination ?? 'unknown',
            remoteExecution: terminal ? 'finished' : 'unknown',
            deploymentId,
            resultFile,
            ...(terminal
              ? { remoteExitCode: terminal.exitCode, remoteStage: terminal.stage, remoteRecovery: terminal.recoveryStatus }
              : {}),
          },
        },
      })
    }

    // 在线部署完成后检查实际公开入口。
    logger.info('Running health check', { url: applicationUrl })
    // SSR 首页可以重定向登录，公开探测用网关就绪路由，目标机仍检查 SSR 首页。
    const publicHealthPaths = publicUrl && primaryService === 'web' && scan.isSvelteKit
      ? ['/_hai/gateway-health']
      : healthPaths
    for (const healthPath of publicHealthPaths) {
      if (await healthCheck(`${url}${healthPath}`, {
        certificate: httpsAssets?.['tls/fullchain.pem'],
        external: Boolean(publicUrl),
      })) {
        continue
      }
      logger.warn('Deployment completed but public health check failed', { deploymentId, url: applicationUrl })
      return core.err(
        {
          ...HaiDeployError.HEALTH_CHECK_FAILED,
          message: deployM(publicUrl ? 'deploy_publicHealthCheckFailed' : 'deploy_healthCheckFailed', {
            params: { url: applicationUrl },
          }),
          ext: {
            commandExecution: {
              reason: 'exit',
              localTermination: 'confirmed',
              remoteExecution: 'finished',
              deploymentId,
              resultFile: `${remoteDir}/result-${deploymentId}.json`,
              remoteExitCode: 0,
              remoteStage: 'complete',
              remoteRecovery: 'not-needed',
            },
          },
        },
      )
    }

    const result: DeployResult = {
      url: applicationUrl,
      deploymentId,
      status: 'ready',
      provider: 'docker-ssh',
      healthCheck: 'passed',
      envVarsSet,
      bundlePath: bundle.bundlePath,
    }
    logger.info('docker-ssh deployment complete', { url: applicationUrl, deploymentId })
    return core.ok(result)
  }

  const deploySafely: ContainerDeployProvider['deploy'] = async (context) => {
    try {
      return await deploy(context)
    }
    catch (error) {
      const reason = error instanceof Error
        ? error.message
        : String(error)
      let safeReason = 'Deployment bundle failed'
      try {
        safeReason = maskSecrets(reason, [
          ...Object.values(context.appEnv ?? {}),
          config.ssh?.password ?? '',
        ].filter(Boolean))
      }
      catch {
        // 脱敏配置无效时保留固定诊断，不重新暴露原异常。
      }
      logger.error('Deployment bundle failed', { reason: safeReason })
      return core.err(HaiDeployError.DEPLOY_FAILED, deployM('deploy_bundleFailed', {
        params: { reason: safeReason },
      }))
    }
  }
  return { name: 'docker-ssh', deploy: deploySafely }
}
