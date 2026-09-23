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
import type { DockerSshProviderConfig } from '../deploy-config.js'
import type { DeployResult } from '../deploy-types.js'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import {
  buildRuntimeEnv,
  generateComposeFile,
  generateDockerignore,
  generateFallbackDockerfile,
  serializeEnvFile,
} from '../container/deploy-container-compose.js'
import { buildImage, detectLocalRuntime, saveImage } from '../container/deploy-container-runtime.js'
import { createSshExecutor } from '../container/deploy-ssh.js'
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
 * @param localRuntimePref - 本地构建运行时偏好（auto 优先 podman）
 * @returns 容器部署 Provider 实例
 */
export function createDockerSshProvider(
  config: DockerSshProviderConfig,
  localRuntimePref: 'auto' | ContainerRuntime = 'auto',
): ContainerDeployProvider {
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
    const { appDir, projectName, scan, provisionEnv } = context
    const deploymentId = makeDeploymentId()
    const containerPort = config.expose.containerPort
    const hostPort = config.expose.hostPort
    const localImageTag = `hai-${projectName}:${deploymentId}`

    // 1. 本地运行时
    const runtimeResult = await detectLocalRuntime(localRuntimePref)
    if (!runtimeResult.success)
      return err(runtimeResult.error)
    const localRuntime = runtimeResult.data

    // 2. 解析构建上下文与 Dockerfile（优先复用应用自带 Dockerfile；无则按工程结构生成兜底）
    const artifactDir = join(appDir, '.hai', 'deploy')
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
      writeFileSync(dockerfilePath, generateFallbackDockerfile(readPackageName(appDir), containerPort))
      // 伴随 .dockerignore：保留 workspace 源码，覆盖仓库根可能排除 apps 的 .dockerignore
      writeFileSync(`${dockerfilePath}.dockerignore`, generateDockerignore())
      contextDir = resolveWorkspaceRoot(appDir)
      logger.info('Generated fallback Dockerfile', { dockerfilePath, contextDir })
    }

    // 3. 构建镜像
    const buildResult = await buildImage(localRuntime, {
      contextDir,
      dockerfilePath,
      imageRef: localImageTag,
    })
    if (!buildResult.success)
      return err(buildResult.error)

    // 4. 运行期环境与 sidecar 规划
    const { env, sidecar } = buildRuntimeEnv(appDir, projectName, scan, provisionEnv, containerPort)
    const envPath = join(artifactDir, '.env.runtime')
    writeFileSync(envPath, serializeEnvFile(env), { mode: 0o600 })

    // 5. 导出镜像
    const tarPath = join(artifactDir, `${projectName}.tar`)
    const saveResult = await saveImage(localRuntime, localImageTag, tarPath)
    if (!saveResult.success)
      return err(saveResult.error)

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
    const prepareResult = await ssh.exec(`mkdir -p ${remoteDir} && chmod 700 ${remoteDir}`)
    if (!prepareResult.success)
      return err(prepareResult.error)

    // 8. 传输镜像并加载
    const remoteTar = `${remoteDir}/image.tar`
    const uploadTarResult = await ssh.upload(tarPath, remoteTar)
    if (!uploadTarResult.success)
      return err(uploadTarResult.error)
    const loadResult = await ssh.exec(`${remoteRuntime} load -i ${remoteTar}`, { timeoutMs: 300_000 })
    if (!loadResult.success)
      return err(loadResult.error)
    // podman load 会把无 registry 的镜像名归一化为 docker.io/library/*，compose 据此会误拉取；
    // 统一重打为 localhost/ 本地标签（podman 永不从远端拉取 localhost/），docker 保持原名。
    const loadedRef = parseLoadedImageRef(loadResult.data.stdout, localImageTag)
    const remoteImageRef = remoteRuntime === 'podman' ? `localhost/${localImageTag}` : localImageTag
    if (loadedRef !== remoteImageRef) {
      const tagResult = await ssh.exec(`${remoteRuntime} tag ${loadedRef} ${remoteImageRef}`)
      if (!tagResult.success)
        return err(tagResult.error)
    }

    // 9. 生成并上传 compose + 运行期环境
    const composeContent = generateComposeFile({
      projectName,
      imageRef: remoteImageRef,
      hostPort,
      containerPort,
      sidecar,
    })
    const composePath = join(artifactDir, 'compose.yml')
    writeFileSync(composePath, composeContent)
    const uploadComposeResult = await ssh.upload(composePath, `${remoteDir}/compose.yml`)
    if (!uploadComposeResult.success)
      return err(uploadComposeResult.error)
    const uploadEnvResult = await ssh.upload(envPath, `${remoteDir}/.env.runtime`)
    if (!uploadEnvResult.success)
      return err(uploadEnvResult.error)
    const secretMask = sidecar.secrets
    const chmodResult = await ssh.exec(`chmod 600 ${remoteDir}/.env.runtime`, { secrets: secretMask })
    if (!chmodResult.success)
      return err(chmodResult.error)

    // 10. 启动
    const upResult = await ssh.exec(
      `cd ${remoteDir} && ${remoteRuntime} compose -p hai-${projectName} up -d`,
      { timeoutMs: 300_000, secrets: secretMask },
    )
    if (!upResult.success)
      return err(upResult.error)
    // 清理远程镜像 tar，节省空间（失败不阻断部署）
    await ssh.exec(`rm -f ${remoteTar}`)

    // 11. 健康检查
    const url = `http://${config.ssh.host}:${hostPort}`
    logger.info('Running health check', { url })
    const healthy = await healthCheck(`${url}/`)
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
