/**
 * @h-ai/deploy — docker-ssh 部署 Provider
 *
 * 基于 OCI 镜像 + Docker Compose + SSH 的通用主机部署：消费已有镜像 → tar 打包 → SSH 传输 →
 * 远程 load → compose up → HTTP 健康检查。远程仅需 SSH + docker/podman + compose。
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
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { createDeploymentBundle } from '../container/deploy-bundle.js'
import { maskSecrets } from '../container/deploy-command.js'
import {
  buildRuntimeEnv,
  generateComposeFile,
  generateWebProxyConfig,
  serializeEnvFile,
} from '../container/deploy-container-compose.js'
import { shellArgument } from '../container/deploy-scripts.js'
import { createSshExecutor } from '../container/deploy-ssh.js'
import { loadDeploymentConfig, loadDeploymentEnvironment, saveDeploymentEnvironment } from '../deploy-environment.js'
import { resolveProjectDirectory } from '../deploy-functions.js'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provider-docker-ssh' })

/** 健康检查轮询间隔（毫秒） */
const HEALTH_POLL_INTERVAL = 3000

/** 健康检查最大轮询次数 */
const HEALTH_MAX_ATTEMPTS = 40

/** 生成不可变部署 ID：`YYYYMMDD-HHmmss-<random>`。 */
function makeDeploymentId(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${stamp}-${randomBytes(3).toString('hex')}`
}

/** 睡眠指定毫秒。 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 创建 docker-ssh 部署 Provider。
 *
 * @param config - docker-ssh Provider 配置
 * @param container - Compose 中间件参数
 * @returns 容器部署 Provider 实例
 */
export function createDockerSshProvider(
  config: DockerSshProviderConfig,
  container?: DeployConfig['container'],
): ContainerDeployProvider {
  const ssh = config.ssh ? createSshExecutor(config.ssh) : undefined
  const baseDir = config.remote.baseDir

  /** 探测远程容器运行时与 compose 可用性。 */
  async function detectRemoteRuntime(): Promise<HaiResult<ContainerRuntime>> {
    if (!ssh)
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_sshRequired'))
    const candidates: ContainerRuntime[] = config.remote.runtime === 'auto'
      ? ['podman', 'docker']
      : [config.remote.runtime]

    for (const runtime of candidates) {
      const versionResult = await ssh.exec(`${runtime} version`, { timeoutMs: 20_000 })
      if (!versionResult.success)
        continue
      const composeResult = await ssh.exec(`${runtime} compose version`, { timeoutMs: 20_000 })
      if (composeResult.success) {
        logger.info('Remote container runtime detected', { runtime })
        return ok(runtime)
      }
    }
    return err(
      HaiDeployError.REMOTE_COMMAND_FAILED,
      deployM('deploy_remoteRuntimeMissing', { params: { runtime: candidates.join(' / ') } }),
    )
  }

  /** HTTP 健康检查：轮询访问地址直到返回成功。 */
  async function healthCheck(url: string): Promise<boolean> {
    for (let attempt = 0; attempt < HEALTH_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (response.ok)
          return true
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
    const hostPort = config.expose.hostPort
    const artifactDir = join(resolveProjectDirectory(appDir), '.hai', 'deploy', options?.environment ?? 'prod')
    mkdirSync(artifactDir, { recursive: true, mode: 0o700 })
    chmodSync(artifactDir, 0o700)
    const artifact = context.artifact
    const resolvedBuildDir = context.artifactDir
    const images = artifact.images
    const web = images.find(image => image.name === 'web')
    const app = images.find(image => image.name === 'app')
    if (options?.selectedServices) {
      const available: string[] = [...images.map(image => image.name), ...scan.requiredServices]
      const invalid = options.selectedServices.find(name => !available.includes(name))
      if (!options.selectedServices.length || new Set(options.selectedServices).size !== options.selectedServices.length || invalid)
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_selectionInvalid', { params: { service: invalid ?? options.selectedServices.join(', ') } }))
    }
    const hasWeb = artifact.hasWeb || !!web
    const partial = artifact.partial || options?.selectedServices !== undefined
    const containerPort = app?.containerPort ?? artifact.appContainerPort ?? config.expose.containerPort
    const webContainerPort = web?.containerPort ?? artifact.webContainerPort ?? 8080
    const host = config.ssh?.host
    const url = host ? `http://${host.includes(':') ? `[${host}]` : host}:${hostPort}` : `http://SERVER_HOST:${hostPort}`

    // 先保存开通结果和 sidecar 凭据，传输失败后仍可检查与复用配置。
    const { env, sidecar } = buildRuntimeEnv(appDir, projectName, scan, provisionEnv, containerPort, options, appEnv, container?.s3Engine)
    if (sidecar.composeServices['storage-init'] && !app && options?.selectedServices?.includes('storage'))
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_storageArtifactRequired'))
    let webProxy: string | undefined
    if (hasWeb) {
      // 路由取当前服务的真实配置，不扫描相邻应用或猜测 fullstack 布局。
      const server = loadDeploymentConfig('serv', join(appDir, 'config', '_serv.yml'), env)
      if (!server.success)
        return server
      const http = server.data.http as { apiPrefix?: string } | undefined
      const cors = server.data.cors as { origin?: string } | undefined
      const apiPrefix = http?.apiPrefix ?? '/api/v1'
      if (typeof apiPrefix !== 'string' || !/^\/[\w/-]+$/.test(apiPrefix))
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_webProxyInvalid'))
      webProxy = generateWebProxyConfig(containerPort, apiPrefix, webContainerPort)
      // 每次从当前配置生成，避免上次运行环境里的父对象遮蔽新修改；保留明确 Origin。
      env.HAI_SERV = JSON.stringify({ ...server.data, cors: { ...cors, origin: (!cors?.origin || cors.origin === '*') && config.ssh ? url : cors?.origin ?? '*' } })
    }
    const envPath = join(artifactDir, '.env.runtime')
    writeFileSync(envPath, serializeEnvFile(env), { mode: 0o600 })
    if (options?.environment) {
      const environment = loadDeploymentEnvironment({ environment: options.environment, envDir: options.envDir ?? scan.envDir ?? appDir })
      if (!environment.success)
        return environment
      const saved = saveDeploymentEnvironment(environment.data, { HAI_DEPLOY_ENVIRONMENT: environment.data.environment, HAI_CORE_ENV: environment.data.values.HAI_CORE_ENV, ...sidecar.env, ...provisionEnv })
      if (!saved.success)
        return saved
    }

    const composeName = `docker-compose-${artifact.appVersion}.yml`
    const composeContent = generateComposeFile({
      projectName,
      appVersion: artifact.appVersion,
      imageRef: app?.imageRef ?? 'localhost/hai-unselected:0',
      hostPort,
      containerPort,
      sidecar,
      web: hasWeb ? { imageRef: web?.imageRef ?? 'localhost/hai-unselected:0', containerPort: webContainerPort } : undefined,
    })
    const composePath = join(artifactDir, composeName)
    writeFileSync(composePath, composeContent)
    if (webProxy)
      writeFileSync(join(artifactDir, 'web.conf'), webProxy)
    const selected = options?.selectedServices ? [...options.selectedServices] : artifact.partial ? images.map(image => image.name) : [...images.map(image => image.name), ...Object.keys(sidecar.composeServices)]
    if (!selected.length || selected.some(name => !/^[a-z][a-z0-9-]*$/.test(name)) || new Set(selected).size !== selected.length)
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_selectionInvalid', { params: { service: selected.join(', ') } }))
    for (const name of selected) {
      if (['app', 'web'].includes(name) && !images.some(image => image.name === name))
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_selectionInvalid', { params: { service: name } }))
    }
    if (selected.includes('storage') && sidecar.composeServices['storage-init'] && !selected.includes('storage-init'))
      selected.push('storage-init')
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
      selected,
      partial,
      hasWeb,
      containerPort,
      middlewareEnv: serializeEnvFile(sidecar.env),
      healthPaths: hasWeb ? ['/health', '/_hai/web-health', '/'] : [scan.isSvelteKit ? '/' : '/health'],
      output: options?.output ?? join(artifactDir, `bundle-${projectName}-${deploymentId}-${artifact.appVersion}.tar`),
    })
    if (options?.bundleOnly)
      return ok({ url: '', deploymentId, status: 'packaged', provider: 'docker-ssh', healthCheck: 'skipped', envVarsSet: Object.keys(env), ...bundle })
    if (!ssh)
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_sshRequired'))
    const ping = await ssh.ping()
    if (!ping.success)
      return ping
    const remoteRuntime = await detectRemoteRuntime()
    if (!remoteRuntime.success)
      return remoteRuntime
    const remoteDir = `${baseDir}/${projectName}`
    const remoteTar = `${remoteDir}/incoming/${basename(bundle.bundlePath)}`
    const prepared = await ssh.exec(`mkdir -p -- ${shellArgument(`${remoteDir}/incoming`)} && chmod 700 -- ${shellArgument(remoteDir)} ${shellArgument(`${remoteDir}/incoming`)}`)
    if (!prepared.success)
      return prepared
    const uploaded = await ssh.upload(bundle.bundlePath, remoteTar)
    if (!uploaded.success)
      return uploaded
    let pendingOutput = ''
    const started = await ssh.exec(
      `mkdir -p ${shellArgument(`${remoteTar}.contents`)} && chmod 600 ${shellArgument(remoteTar)} && tar -xf ${shellArgument(remoteTar)} -C ${shellArgument(`${remoteTar}.contents`)} && sh ${shellArgument(`${remoteTar}.contents/${bundle.startName}`)} ${shellArgument(remoteDir)}`,
      { timeoutMs: 600_000, secrets: sidecar.secrets, onOutput: (output) => {
        pendingOutput += output
        const lines = pendingOutput.split('\n')
        pendingOutput = lines.pop() ?? ''
        for (const line of lines) {
          const stage = /^\[(preflight|images|dependencies|start|health|complete)\]/.exec(line)?.[1]
          if (stage)
            options?.onProgress?.(stage as 'preflight' | 'images' | 'dependencies' | 'start' | 'health' | 'complete')
        }
      } },
    )
    if (!started.success)
      return started

    // 在线部署完成后检查实际公开入口。
    logger.info('Running health check', { url })
    const healthy = await healthCheck(`${url}${!hasWeb && scan.isSvelteKit ? '/' : '/health'}`)
      && (!hasWeb || (await healthCheck(`${url}/_hai/web-health`) && await healthCheck(`${url}/`)))
    if (!healthy) {
      return err(
        HaiDeployError.HEALTH_CHECK_FAILED,
        deployM('deploy_healthCheckFailed', { params: { url } }),
      )
    }

    const result: DeployResult = {
      url,
      deploymentId,
      status: 'ready',
      provider: 'docker-ssh',
      healthCheck: 'passed',
      envVarsSet: Object.keys(env),
      bundlePath: bundle.bundlePath,
    }
    logger.info('docker-ssh deployment complete', { url, deploymentId })
    return ok(result)
  }

  const deploySafely: ContainerDeployProvider['deploy'] = async (context) => {
    try {
      return await deploy(context)
    }
    catch (error) {
      logger.error('Deployment bundle failed', { error })
      const reason = error instanceof Error ? error.message : String(error)
      return err(HaiDeployError.DEPLOY_FAILED, deployM('deploy_bundleFailed', { params: { reason: maskSecrets(reason, Object.values(context.appEnv ?? {}).filter(value => value.length > 6)) } }), error)
    }
  }
  return { name: 'docker-ssh', deploy: deploySafely }
}
