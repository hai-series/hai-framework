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
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseEnv } from 'node:util'
import { core, err, ok } from '@h-ai/core'
import { createDeploymentBundle, shellArgument } from '../container/deploy-bundle.js'
import {
  buildRuntimeEnv,
  generateComposeFile,
  generateWebProxyConfig,
  serializeEnvFile,
} from '../container/deploy-container-compose.js'
import { createSshExecutor } from '../container/deploy-ssh.js'
import { loadDeploymentConfig, loadDeploymentEnvironment, saveDeploymentEnvironment } from '../deploy-environment.js'
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
    const artifactDir = join(appDir, '.hai', 'deploy', options?.environment ?? 'prod')
    mkdirSync(artifactDir, { recursive: true, mode: 0o700 })
    chmodSync(artifactDir, 0o700)
    const artifact = context.artifact
    const resolvedBuildDir = context.artifactDir
    const images = artifact.images
    const web = images.find(image => image.name === 'web')
    const app = images.find(image => image.name === 'app')!
    const containerPort = app.containerPort ?? config.expose.containerPort
    const url = config.ssh ? `http://${config.ssh.host}:${hostPort}` : `http://SERVER_HOST:${hostPort}`

    // 先保存开通结果和 sidecar 凭据，传输失败后仍可检查与复用配置。
    const { env, sidecar } = buildRuntimeEnv(appDir, projectName, scan, provisionEnv, containerPort, options, appEnv, container?.s3Engine)
    let webProxy: string | undefined
    if (web) {
      // 路由取当前服务的真实配置，不扫描相邻应用或猜测 fullstack 布局。
      const server = loadDeploymentConfig('serv', join(appDir, 'config', '_serv.yml'), env)
      if (!server.success)
        return server
      const http = server.data.http as { apiPrefix?: string } | undefined
      const cors = server.data.cors as { origin?: string } | undefined
      const apiPrefix = http?.apiPrefix ?? '/api/v1'
      if (typeof apiPrefix !== 'string' || !/^\/[\w/-]+$/.test(apiPrefix))
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_webProxyInvalid'))
      webProxy = generateWebProxyConfig(containerPort, apiPrefix, web.containerPort ?? 8080)
      // 每次从当前配置生成，避免上次运行环境里的父对象遮蔽新修改；保留明确 Origin。
      env.HAI_SERV = JSON.stringify({ ...server.data, cors: { ...cors, origin: (!cors?.origin || cors.origin === '*') && config.ssh ? url : cors?.origin ?? '*' } })
    }
    const envPath = join(artifactDir, '.env.runtime')
    const previousEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {}
    Object.assign(env, { ...previousEnv, ...env })
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
    const latestPath = join(artifactDir, 'latest')
    const previousName = existsSync(latestPath) ? readFileSync(latestPath, 'utf8').trim() : ''
    const previousPath = /^[\w.+-]+\.yml$/.test(previousName) ? join(artifactDir, previousName) : undefined
    const composeContent = generateComposeFile({
      projectName,
      appVersion: artifact.appVersion,
      imageRef: app.imageRef,
      hostPort,
      containerPort,
      sidecar,
      web: web ? { imageRef: web.imageRef, containerPort: web.containerPort ?? 8080 } : undefined,
      serviceModes: options?.serviceModes,
      previousCompose: previousPath && existsSync(previousPath) ? readFileSync(previousPath, 'utf8') : undefined,
    })
    const composePath = join(artifactDir, composeName)
    writeFileSync(composePath, composeContent)
    if (webProxy)
      writeFileSync(join(artifactDir, 'web.conf'), webProxy)
    const bundle = await createDeploymentBundle({
      directory: artifactDir,
      artifactDir: resolvedBuildDir,
      artifact,
      projectName,
      environment: options?.environment ?? 'prod',
      runtime: config.remote.runtime,
      coreEnv: env.HAI_CORE_ENV ?? 'production',
      output: options?.output ?? join(artifactDir, `bundle-${projectName}-${deploymentId}-${artifact.appVersion}.tar`),
    })
    writeFileSync(latestPath, `${composeName}\n`)
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
    const remoteTar = `${remoteDir}/${basename(bundle.bundlePath)}`
    const prepared = await ssh.exec(`mkdir -p -- ${shellArgument(remoteDir)} && chmod 700 -- ${shellArgument(remoteDir)}`)
    if (!prepared.success)
      return prepared
    const uploaded = await ssh.upload(bundle.bundlePath, remoteTar)
    if (!uploaded.success)
      return uploaded
    const started = await ssh.exec(
      `cd ${shellArgument(remoteDir)} && chmod 600 ${shellArgument(remoteTar)} && tar -xf ${shellArgument(remoteTar)} && HAI_DEPLOY_PROVIDER_REMOTE_RUNTIME=${shellArgument(remoteRuntime.data)} sh ${shellArgument(bundle.startName)}`,
      { timeoutMs: 300_000, secrets: sidecar.secrets },
    )
    if (!started.success)
      return started
    await ssh.exec(`rm -f -- ${shellArgument(remoteTar)} ${images.map(image => shellArgument(`${remoteDir}/images/${image.file}`)).join(' ')}`)

    // 在线部署完成后检查实际公开入口。
    logger.info('Running health check', { url })
    const healthy = await healthCheck(`${url}${!web && scan.isSvelteKit ? '/' : '/health'}`)
      && (!web || (await healthCheck(`${url}/_hai/web-health`) && await healthCheck(`${url}/`)))
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
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'), error)
    }
  }
  return { name: 'docker-ssh', deploy: deploySafely }
}
