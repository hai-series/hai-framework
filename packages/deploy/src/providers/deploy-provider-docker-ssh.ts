/**
 * @h-ai/deploy — docker-ssh 部署 Provider
 *
 * 基于 OCI 镜像 + Docker Compose + SSH 的通用主机部署：本地构建镜像 → SSH 传输 →
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { core, err, ok } from '@h-ai/core'
import {
  buildRuntimeEnv,
  generateComposeFile,
  generateDockerignore,
  generateFallbackDockerfile,
  generateWebProxyConfig,
  serializeEnvFile,
} from '../container/deploy-container-compose.js'
import { buildImage, detectLocalRuntime, saveImage } from '../container/deploy-container-runtime.js'
import { createSshExecutor } from '../container/deploy-ssh.js'
import { loadDeploymentConfig, loadDeploymentEnvironment, saveDeploymentEnvironment } from '../deploy-environment.js'
import { deployM } from '../deploy-i18n.js'
import { HaiDeployError } from '../deploy-types.js'

const logger = core.logger.child({ module: 'deploy', scope: 'provider-docker-ssh' })

/** 健康检查轮询间隔（毫秒） */
const HEALTH_POLL_INTERVAL = 3000

/** 健康检查最大轮询次数 */
const HEALTH_MAX_ATTEMPTS = 40

/** 远程登录 shell 的字面参数；路径中的空格、单引号及美元符号不能作为命令解释。 */
function shellArgument(value: string): string {
  return `'${value.replaceAll('\'', '\'"\'"\'')}'`
}

/** 生成不可变部署 ID：`YYYYMMDD-HHmmss-<random>`。 */
function makeDeploymentId(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${stamp}-${randomBytes(3).toString('hex')}`
}

/** 从 `docker/podman load` 输出解析加载后的镜像引用。 */
function parseLoadedImageRef(stdout: string, fallback: string): string {
  const match = stdout.match(/Loaded image(?:\(s\))?:\s*(\S+)/)
  return match ? match[1] : fallback
}

/** 睡眠指定毫秒。 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 读取应用完整包名（用于 pnpm --filter），失败回退 'app'。 */
function readPackageName(appDir: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf-8')) as { name?: string }
    return pkg.name ?? 'app'
  }
  catch {
    return 'app'
  }
}

/**
 * 解析镜像构建上下文根目录。
 *
 * 应用自身含 `pnpm-workspace.yaml` → 独立工程（上下文=appDir）；
 * 仅上层目录含 `pnpm-workspace.yaml` → monorepo 成员（上下文=workspace 根，供 `pnpm --filter` 构建）。
 *
 * @param appDir - 应用根目录
 * @returns 构建上下文根目录
 */
function resolveWorkspaceRoot(appDir: string): string {
  if (existsSync(join(appDir, 'pnpm-workspace.yaml')))
    return appDir
  let current = appDir
  let parent = dirname(current)
  while (parent !== current) {
    if (existsSync(join(parent, 'pnpm-workspace.yaml')))
      return parent
    current = parent
    parent = dirname(parent)
  }
  return appDir
}

/**
 * 创建 docker-ssh 部署 Provider。
 *
 * @param config - docker-ssh Provider 配置
 * @param container - 本地构建运行时与代理配置
 * @returns 容器部署 Provider 实例
 */
export function createDockerSshProvider(
  config: DockerSshProviderConfig,
  container?: DeployConfig['container'],
): ContainerDeployProvider {
  const localRuntimePref = container?.runtime ?? 'auto'
  const httpProxy = container?.httpProxy ?? true
  const ssh = createSshExecutor(config.ssh)
  const baseDir = config.remote.baseDir

  /** 探测远程容器运行时与 compose 可用性。 */
  async function detectRemoteRuntime(): Promise<HaiResult<ContainerRuntime>> {
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
    const containerPort = config.expose.containerPort
    const hostPort = config.expose.hostPort
    const localImageTag = `hai-${projectName}:${deploymentId}`
    const web = container?.web
    const url = `http://${config.ssh.host}:${hostPort}`

    // 1. 本地运行时
    const runtimeResult = await detectLocalRuntime(localRuntimePref)
    if (!runtimeResult.success)
      return err(runtimeResult.error)
    const localRuntime = runtimeResult.data

    // 2. 解析构建上下文与 Dockerfile（优先复用应用自带 Dockerfile；无则按工程结构生成兜底）
    const artifactDir = join(appDir, '.hai', 'deploy', options?.environment ?? 'prod')
    mkdirSync(artifactDir, { recursive: true })
    const appDockerfile = join(appDir, 'Dockerfile')
    let dockerfilePath: string
    let contextDir: string
    if (existsSync(appDockerfile)) {
      // 应用自带 Dockerfile 以 appDir 为上下文
      dockerfilePath = appDockerfile
      contextDir = appDir
    }
    else {
      // 兜底：monorepo 成员以 workspace 根为上下文，`pnpm --filter` 只构建目标应用
      dockerfilePath = join(artifactDir, 'Dockerfile')
      writeFileSync(dockerfilePath, generateFallbackDockerfile(readPackageName(appDir), containerPort, { environment: options?.environment, entrypoint: scan.isSvelteKit ? 'build' : 'dist/index.js' }))
      // 伴随 .dockerignore：保留 workspace 源码，覆盖仓库根可能排除 apps 的 .dockerignore
      writeFileSync(`${dockerfilePath}.dockerignore`, generateDockerignore())
      contextDir = resolveWorkspaceRoot(appDir)
      logger.info('Generated fallback Dockerfile', { dockerfilePath, contextDir })
    }

    // 3. 先保存开通结果和 sidecar 凭据，构建失败后仍可检查与复用配置。
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
      webProxy = generateWebProxyConfig(containerPort, apiPrefix, web.containerPort)
      // 每次从当前配置生成，避免上次运行环境里的父对象遮蔽新修改；保留明确 Origin。
      env.HAI_SERV = JSON.stringify({ ...server.data, cors: { ...cors, origin: !cors?.origin || cors.origin === '*' ? url : cors.origin } })
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

    // 4. 构建只传环境标识，禁止将运行期凭据写入镜像层。
    const buildResult = await buildImage(localRuntime, {
      contextDir,
      dockerfilePath,
      imageRef: localImageTag,
      buildArgs: { HAI_DEPLOY_ENVIRONMENT: options?.environment ?? 'prod', HAI_CORE_ENV: env.HAI_CORE_ENV ?? 'production', SQLITE_PREBUILD_MIRROR: container?.sqlitePrebuildMirror ?? '' },
      httpProxy,
    })
    if (!buildResult.success)
      return err(buildResult.error)

    // 5. 导出镜像
    const tarPath = join(artifactDir, `${projectName}.tar`)
    const saveResult = await saveImage(localRuntime, localImageTag, tarPath)
    if (!saveResult.success)
      return err(saveResult.error)

    // API 和 Web 共用部署 ID；全部构建/导出成功后才触碰远端。
    const images = [{ localRef: localImageTag, tarPath, remoteRef: '' }]
    if (web) {
      const webContext = resolve(appDir, web.context)
      const webRef = `hai-${projectName}-web:${deploymentId}`
      const webBuild = await buildImage(localRuntime, {
        contextDir: webContext,
        dockerfilePath: resolve(webContext, web.dockerfile),
        imageRef: webRef,
        target: web.target,
        buildArgs: { HAI_DEPLOY_ENVIRONMENT: options?.environment ?? 'prod', HAI_CORE_ENV: env.HAI_CORE_ENV ?? 'production' },
        httpProxy,
      })
      if (!webBuild.success)
        return webBuild
      const webTar = join(artifactDir, `${projectName}-web.tar`)
      const savedWeb = await saveImage(localRuntime, webRef, webTar)
      if (!savedWeb.success)
        return savedWeb
      images.push({ localRef: webRef, tarPath: webTar, remoteRef: '' })
    }

    // 6. 远程预检
    const pingResult = await ssh.ping()
    if (!pingResult.success)
      return err(pingResult.error)
    const remoteRuntimeResult = await detectRemoteRuntime()
    if (!remoteRuntimeResult.success)
      return err(remoteRuntimeResult.error)
    const remoteRuntime = remoteRuntimeResult.data

    // 7. 准备远程目录
    const remoteDir = `${baseDir}/${projectName}`
    const prepareResult = await ssh.exec(`mkdir -p -- ${shellArgument(remoteDir)} && chmod 700 -- ${shellArgument(remoteDir)}`)
    if (!prepareResult.success)
      return err(prepareResult.error)

    // 8. 传输镜像并加载
    for (const [index, image] of images.entries()) {
      const remoteTar = `${remoteDir}/image-${index}.tar`
      const uploaded = await ssh.upload(image.tarPath, remoteTar)
      if (!uploaded.success)
        return uploaded
      const loaded = await ssh.exec(`${remoteRuntime} load -i ${shellArgument(remoteTar)}`, { timeoutMs: 300_000 })
      if (!loaded.success)
        return loaded
      // Podman 对无 registry 镜像名进行归一化，统一重标 localhost/ 以免误拉取。
      const loadedRef = parseLoadedImageRef(loaded.data.stdout, image.localRef)
      image.remoteRef = remoteRuntime === 'podman' ? `localhost/${image.localRef}` : image.localRef
      if (loadedRef !== image.remoteRef) {
        const tagged = await ssh.exec(`${remoteRuntime} tag ${shellArgument(loadedRef)} ${shellArgument(image.remoteRef)}`)
        if (!tagged.success)
          return tagged
      }
    }

    // 9. 生成并上传 compose + 运行期环境
    const composeContent = generateComposeFile({
      projectName,
      imageRef: images[0].remoteRef,
      hostPort,
      containerPort,
      sidecar,
      web: web ? { imageRef: images[1].remoteRef, containerPort: web.containerPort } : undefined,
      serviceModes: options?.serviceModes,
      previousCompose: existsSync(join(artifactDir, 'compose.yml')) ? readFileSync(join(artifactDir, 'compose.yml'), 'utf8') : undefined,
    })
    const composePath = join(artifactDir, 'compose.yml')
    writeFileSync(composePath, composeContent)
    const uploadComposeResult = await ssh.upload(composePath, `${remoteDir}/compose.yml`)
    if (!uploadComposeResult.success)
      return err(uploadComposeResult.error)
    if (webProxy) {
      const proxyPath = join(artifactDir, 'web.conf')
      writeFileSync(proxyPath, webProxy)
      const uploadedProxy = await ssh.upload(proxyPath, `${remoteDir}/web.conf`)
      if (!uploadedProxy.success)
        return uploadedProxy
    }
    const uploadEnvResult = await ssh.upload(envPath, `${remoteDir}/.env.runtime`)
    if (!uploadEnvResult.success)
      return err(uploadEnvResult.error)
    const startScript = `#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\nexport HAI_DEPLOY_ENVIRONMENT=${options?.environment ?? 'prod'}\nexport HAI_CORE_ENV=${shellArgument(env.HAI_CORE_ENV ?? 'production')}\nexec ${remoteRuntime} compose --env-file .env.runtime -p hai-${projectName} up -d\n`
    const startName = `start-${options?.environment ?? 'prod'}.sh`
    const startPath = join(artifactDir, startName)
    writeFileSync(startPath, startScript, { mode: 0o700 })
    const uploadStart = await ssh.upload(startPath, `${remoteDir}/${startName}`)
    if (!uploadStart.success)
      return uploadStart
    const secretMask = sidecar.secrets
    const chmodResult = await ssh.exec(`chmod 600 -- ${shellArgument(`${remoteDir}/.env.runtime`)}`, { secrets: secretMask })
    if (!chmodResult.success)
      return err(chmodResult.error)

    // 10. 启动
    const upResult = await ssh.exec(
      `cd ${shellArgument(remoteDir)} && sh ${shellArgument(startName)}`,
      { timeoutMs: 300_000, secrets: secretMask },
    )
    if (!upResult.success)
      return err(upResult.error)
    // 清理远程镜像 tar，节省空间（失败不阻断部署）
    await ssh.exec(`rm -f -- ${images.map((_, index) => shellArgument(`${remoteDir}/image-${index}.tar`)).join(' ')}`)

    // 11. 健康检查
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
    }
    logger.info('docker-ssh deployment complete', { url, deploymentId })
    return ok(result)
  }

  return { name: 'docker-ssh', deploy }
}
