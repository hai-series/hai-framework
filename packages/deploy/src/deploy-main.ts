/**
 * @h-ai/deploy — 模块主入口
 *
 * 提供 deploy 单例对象，暴露完整的自动化部署 API。
 * @module deploy-main
 */

import type { HaiResult } from '@h-ai/core'
import type { ContainerDeployProvider } from './container/deploy-container-types.js'
import type { DeployConfig, DeployConfigInput } from './deploy-config.js'
import type { DeployProvider, ServiceProvisioner } from './deploy-internal-types.js'
import type {
  DeployAppOptions,
  DeployCredentialOperations,
  DeployFunctions,
  DeployRecoveryInfo,
  DeployResult,
  DeployScanOptions,
  ProvisionResult,
  ScanResult,
  ServiceType,
} from './deploy-types.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { core, err, ok } from '@h-ai/core'
import { readDeploymentArtifact } from './deploy-artifact.js'
import { DeployConfigSchema } from './deploy-config.js'
import {
  getCredentialsPath,
  loadCredentials,
  saveCredential,
  saveCredentials,
} from './deploy-credentials.js'
import { loadDeploymentEnvironment, saveDeploymentEnvironment } from './deploy-environment.js'
import { normalizeProjectName, resolveArtifactDirectory, resolveOutputDir, resolveProjectDirectory, usesDefaultMiddleware } from './deploy-functions.js'
import { deployM } from './deploy-i18n.js'
import { getDeployRecovery, recoveryFailure } from './deploy-recovery.js'
import { scanApp } from './deploy-scanner.js'
import { HaiDeployError } from './deploy-types.js'
import { createDockerSshProvider } from './providers/deploy-provider-docker-ssh.js'
import { createVercelProvider } from './providers/deploy-provider-vercel.js'
import { createAliyunProvisioner } from './provisioners/deploy-provisioner-aliyun.js'
import { createNeonProvisioner } from './provisioners/deploy-provisioner-neon.js'
import { createR2Provisioner } from './provisioners/deploy-provisioner-r2.js'
import { createResendProvisioner } from './provisioners/deploy-provisioner-resend.js'
import { createUpstashProvisioner } from './provisioners/deploy-provisioner-upstash.js'

const logger = core.logger.child({ module: 'deploy', scope: 'main' })

// ─── 内部状态 ───

let currentConfig: DeployConfig | null = null
let currentProvider: DeployProvider | null = null
let currentContainerProvider: ContainerDeployProvider | null = null
const currentProvisioners: Map<ServiceType, ServiceProvisioner> = new Map()

/** 并发初始化防护标志 */
let initInProgress = false

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit(
  HaiDeployError.NOT_INITIALIZED,
  () => deployM('deploy_notInitialized'),
)

// ─── Provider 工厂 ───

/**
 * 根据配置类型创建对应的 DeployProvider
 *
 * @param type - Provider 类型
 * @returns DeployProvider 实例
 */
function createProviderByType(type: string): DeployProvider {
  switch (type) {
    case 'vercel':
      return createVercelProvider()
    default:
      throw new Error(deployM('deploy_unsupportedProviderType', { params: { type } }))
  }
}

// ─── Provisioner 工厂 ───

/**
 * 根据 provisioner 名称创建对应的 ServiceProvisioner
 *
 * @param provisioner - Provisioner 标识
 * @returns ServiceProvisioner 实例
 */
function createProvisionerByName(provisioner: string): ServiceProvisioner {
  switch (provisioner) {
    case 'neon':
      return createNeonProvisioner()
    case 'upstash':
      return createUpstashProvisioner()
    case 'cloudflare-r2':
      return createR2Provisioner()
    case 'resend':
      return createResendProvisioner()
    case 'aliyun':
      return createAliyunProvisioner()
    default:
      throw new Error(deployM('deploy_unsupportedProvisionerType', { params: { type: provisioner } }))
  }
}

/**
 * 从配置中提取 provisioner 凭证并转为 Record<string, string>
 *
 * @param serviceConfig - 服务配置对象
 * @returns 凭证键值对
 */
function extractCredentials(serviceConfig: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(serviceConfig)) {
    if (key !== 'provisioner' && typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}

/**
 * Deploy 凭证子功能。
 *
 * 这些操作仅处理本地 `~/.hai/credentials.yml`，供 CLI 在读取项目 `hai.json` 的部署配置
 * 之前注入 `HAI_DEPLOY_*` 环境变量，因此不依赖 `deploy.init()`。
 */
const deployCredentials: DeployCredentialOperations = {
  getPath: () => getCredentialsPath(),
  load: () => loadCredentials(),
  save: (key: string, value: string) => saveCredential(key, value),
  saveAll: (entries: Record<string, string>) => saveCredentials(entries),
}

/** 合并 Provisioner 输出环境变量，并聚合 HAI_REACH_PROVIDERS 数组。 */
function mergeProvisionEnv(results: ProvisionResult[], scan?: ScanResult, options?: DeployAppOptions): Record<string, string> {
  let env: Record<string, string> = {}
  const reachRequirements = scan?.middlewares?.filter(item => item.configName === 'reach') ?? []
  const reachProviders: unknown[] = reachRequirements.map(item => item.config)
  let hasReachOutput = false
  for (const prov of results) {
    if (prov.envVars.HAI_REACH_PROVIDERS) {
      hasReachOutput = true
      const supplied = JSON.parse(prov.envVars.HAI_REACH_PROVIDERS) as Record<string, unknown>[]
      for (const provider of supplied) {
        const targets = reachRequirements.filter((item) => {
          const mode = options?.serviceModes?.[item.envPrefix] ?? options?.serviceModes?.[item.service]
          return item.service === prov.serviceType && (!mode || mode === 'default')
        })
        if (targets.length) {
          for (const target of targets)
            reachProviders[reachRequirements.indexOf(target)] = { ...provider, name: target.config.name ?? provider.name }
        }
        else {
          reachProviders.push(provider)
        }
      }
    }
    env = { ...env, ...prov.envVars }
  }
  if (hasReachOutput)
    env.HAI_REACH_PROVIDERS = JSON.stringify(reachProviders)
  return env
}

// ─── 模块单例 ───

/**
 * Deploy 模块单例
 * 每次 init 检查 HaiResult；只打包不会连接 SSH，成功打包也不代表服务器已部署。远端 unknown 必须先核对匹配部署 ID 的结果，不能盲目重试。
 * @example
 * ```ts
 * import { deploy, getDeployCommandState } from '@h-ai/deploy'
 * const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   // 当前项目已有镜像产物与部署环境；只打包，不连接服务器。
 *   const result = await deploy.deployApp(process.cwd(), { environment: 'prod', bundleOnly: true })
 *   if (!result.success) {
 *     const state = getDeployCommandState(result.error)
 *     if (state?.remoteExecution === 'unknown') {
 *       process.stderr.write('Inspect the matching server result before retrying\n')
 *     }
 *     throw new Error(result.error.message)
 *   }
 *   if (result.data.status === 'packaged') {
 *     const bundle = result.data.bundlePath
 *   }
 * }
 * finally {
 *   await deploy.close()
 * }
 * ```
 */
export const deploy: DeployFunctions = {
  credentials: deployCredentials,

  async init(config: DeployConfigInput): Promise<HaiResult<void>> {
    // 并发初始化防护：避免多次 init 同时执行导致资源泄漏
    if (initInProgress) {
      logger.warn('Deploy init already in progress, skipping concurrent call')
      return err(
        HaiDeployError.CONFIG_ERROR,
        deployM('deploy_configError', { params: { error: 'init already in progress' } }),
      )
    }
    initInProgress = true

    try {
      if (currentProvider || currentContainerProvider) {
        logger.warn('Deploy module is already initialized, reinitializing')
        await deploy.close()
      }

      logger.info('Initializing deploy module')

      const parseResult = DeployConfigSchema.safeParse(config)
      if (!parseResult.success) {
        logger.error('Deploy config validation failed', { error: parseResult.error.message })
        return err(
          HaiDeployError.CONFIG_ERROR,
          deployM('deploy_configError', { params: { error: parseResult.error.message } }),
          parseResult.error,
        )
      }
      const parsed = parseResult.data

      try {
        // 创建部署 Provider：docker-ssh 走容器路径（无远程认证），其余走平台路径并即时认证
        let provider: DeployProvider | null = null
        let containerProvider: ContainerDeployProvider | null = null
        if (parsed.provider.type === 'docker-ssh') {
          containerProvider = createDockerSshProvider(parsed.provider, parsed.container)
          logger.info('Container deploy provider ready', { provider: 'docker-ssh', host: parsed.provider.ssh?.host })
        }
        else {
          provider = createProviderByType(parsed.provider.type)
          const authResult = await provider.authenticate(parsed.provider.token)
          if (!authResult.success) {
            return err(authResult.error)
          }
          logger.info('Provider authenticated', { provider: parsed.provider.type, user: authResult.data })
        }

        // 创建 Provisioners（两类 Provider 均可复用云资源开通）
        currentProvisioners.clear()
        if (parsed.services) {
          const serviceEntries = Object.entries(parsed.services) as Array<[ServiceType, Record<string, unknown> | undefined]>
          for (const [serviceType, serviceConfig] of serviceEntries) {
            if (!serviceConfig)
              continue

            const provisioner = createProvisionerByName(serviceConfig.provisioner as string)
            const credentials = extractCredentials(serviceConfig as Record<string, unknown>)
            const provAuthResult = await provisioner.authenticate(credentials)
            if (!provAuthResult.success) {
              logger.error('Provisioner authentication failed', {
                service: serviceType,
                provisioner: (serviceConfig as Record<string, unknown>).provisioner,
              })
              currentProvisioners.clear()
              return err(provAuthResult.error)
            }
            logger.info('Provisioner authenticated', {
              service: serviceType,
              user: provAuthResult.data,
            })
            currentProvisioners.set(serviceType, provisioner)
          }
        }

        currentProvider = provider
        currentContainerProvider = containerProvider
        currentConfig = parsed
        logger.info('Deploy module initialized', {
          provider: parsed.provider.type,
          provisioners: [...currentProvisioners.keys()],
        })
        return ok(undefined)
      }
      catch (error) {
        // 清理部分赋值的状态
        currentProvider = null
        currentContainerProvider = null
        currentConfig = null
        currentProvisioners.clear()
        logger.error('Deploy module initialization failed', { error })
        return err(
          HaiDeployError.CONFIG_ERROR,
          deployM('deploy_configError', {
            params: { error: error instanceof Error ? error.message : String(error) },
          }),
          error,
        )
      }
    }
    finally {
      initInProgress = false
    }
  },

  async close(): Promise<void> {
    if (!currentProvider && !currentContainerProvider) {
      logger.info('Deploy module already closed, skipping')
      return
    }

    logger.info('Closing deploy module')
    currentProvider = null
    currentContainerProvider = null
    currentConfig = null
    currentProvisioners.clear()
    logger.info('Deploy module closed')
  },

  get config(): DeployConfig | null {
    return currentConfig
  },

  get isInitialized(): boolean {
    return currentProvider !== null || currentContainerProvider !== null
  },

  async scan(appDir: string, options?: DeployScanOptions): Promise<HaiResult<ScanResult>> {
    // scan 仅做本地文件分析，不依赖 Provider / Provisioner 初始化状态。
    logger.debug('Scanning application', { appDir })
    return scanApp(appDir, options)
  },

  async provisionAll(projectName: string, services?: ServiceType[]): Promise<HaiResult<ProvisionResult[]>> {
    if (!currentProvider && !currentContainerProvider) {
      return notInitialized.result()
    }

    logger.info('Provisioning all services', { projectName, count: currentProvisioners.size })
    const results: ProvisionResult[] = []

    for (const [serviceType, provisioner] of currentProvisioners) {
      if (services && !services.includes(serviceType))
        continue
      logger.debug('Provisioning service', { serviceType, provisioner: provisioner.name })
      const provResult = await provisioner.provision(projectName)
      if (!provResult.success) {
        logger.error('Service provisioning failed', {
          serviceType,
          provisioner: provisioner.name,
          code: provResult.error.code,
        })
        return recoveryFailure(provResult.error, {
          projectName,
          stage: `provision:${serviceType}`,
          resources: [
            ...results.map(({ envVars: _envVars, ...resource }) => resource),
            ...(getDeployRecovery(provResult.error)?.resources ?? [
              { serviceType, provisionerName: provisioner.name, resourceInfo: projectName, resourceStatus: 'unknown' as const },
            ]),
          ],
        })
      }
      results.push(provResult.data)
      logger.info('Service provisioned', { serviceType, provisioner: provisioner.name })
    }

    return ok(results)
  },

  async deployApp(
    appDir: string,
    options?: DeployAppOptions,
  ): Promise<HaiResult<DeployResult>> {
    if (!currentProvider && !currentContainerProvider) {
      return notInitialized.result()
    }

    logger.info('Starting deployment', { appDir, environment: options?.environment, projectName: options?.projectName })

    // 1. 扫描应用
    const scanOptions = { ...options, environment: options?.environment ?? currentConfig?.environment }
    const scanResult = await scanApp(appDir, scanOptions)
    if (!scanResult.success) {
      return err(scanResult.error)
    }
    const scan = scanResult.data
    appDir = scan.appDir ?? appDir
    const environment = loadDeploymentEnvironment({ environment: scanOptions.environment ?? 'prod', envDir: scan.envDir ?? appDir, requireFile: scanOptions.environment !== undefined })
    if (!environment.success)
      return environment
    // SSH 密码允许引用自定义变量名；按配置来源排除，不能按密码值删除同值的应用配置。
    const connectionVariables = new Set<string>()
    const projectFile = join(resolveProjectDirectory(appDir), 'hai.json')
    if (existsSync(projectFile)) {
      try {
        const project: { deploy?: { provider?: { ssh?: { password?: unknown } } } } = JSON.parse(readFileSync(projectFile, 'utf8'))
        const reference = project?.deploy?.provider?.ssh?.password
        if (typeof reference === 'string') {
          for (const match of reference.matchAll(/\$\{([^:}]+)(?::[^}]*)?\}/g))
            connectionVariables.add(match[1]!)
        }
      }
      catch {
        return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_configFileInvalid', { params: { path: projectFile, line: '1' } }))
      }
    }
    const appEnv = Object.fromEntries(Object.entries(environment.data.values).filter(([key]) => key !== 'HAI_DEPLOY' && !connectionVariables.has(key) && !key.startsWith('HAI_CLI_') && (!key.startsWith('HAI_DEPLOY_') || key === 'HAI_DEPLOY_ENVIRONMENT')))
    const projectName = `${options?.projectName ?? normalizeProjectName(scan.appName)}${scanOptions.environment ? `-${environment.data.environment}` : ''}`
    options = {
      ...options,
      ...(scanOptions.environment ? { environment: environment.data.environment } : {}),
      ...(options?.skipMiddleware ? { serviceModes: Object.fromEntries(scan.requiredServices.map(service => [service, 'keep' as const])) } : {}),
    }
    if (options.selectedServices) {
      options.serviceModes = {
        ...options.serviceModes,
        ...Object.fromEntries(scan.requiredServices.filter(service => !options.selectedServices!.includes(service)).map(service => [service, 'keep' as const])),
      }
    }

    // 容器 Provider（docker-ssh）：走独立的容器部署编排
    if (currentContainerProvider) {
      return deployContainerApp(currentContainerProvider, appDir, scan, projectName, options, appEnv)
    }

    if (options?.bundleOnly)
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_bundleOnlyContainer'))
    if (options.selectedServices)
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_selectedContainerOnly'))

    // 到此必为平台 Provider（vercel）
    if (!currentProvider) {
      return notInitialized.result()
    }

    // 2. 检查 adapter
    if (scan.isSvelteKit && !scan.adapterInstalled) {
      return err(
        HaiDeployError.ADAPTER_MISSING,
        deployM('deploy_adapterMissing', {
          params: { adapter: '@sveltejs/adapter-vercel' },
        }),
      )
    }

    if (!existsSync(resolveOutputDir(appDir, 'vercel')))
      return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))

    // 3. 开通基础设施
    let allEnvVars: Record<string, string> = appEnv
    const recovery: DeployRecoveryInfo = { projectName, stage: 'provision', resources: [] }
    if (!options?.skipMiddleware) {
      const provResults = await deploy.provisionAll(projectName, options?.serviceModes ? scan.requiredServices.filter(service => usesDefaultMiddleware(scan, service, options)) : undefined)
      if (!provResults.success) {
        return err(provResults.error)
      }
      recovery.resources = provResults.data.map(({ envVars: _envVars, ...resource }) => resource)
      allEnvVars = { ...allEnvVars, ...mergeProvisionEnv(provResults.data, scan, options) }
      if (options?.environment) {
        const saved = saveDeploymentEnvironment(environment.data, mergeProvisionEnv(provResults.data, scan, options))
        if (!saved.success)
          return recoveryFailure(saved.error, { ...recovery, stage: 'save-env' })
      }
    }

    // 4. 创建平台项目
    const projectResult = await currentProvider.createProject(projectName)
    if (!projectResult.success) {
      return recoveryFailure(projectResult.error, { ...recovery, stage: 'create-project' })
    }
    const projectId = projectResult.data
    recovery.platformProjectId = projectId

    // 5. 设置环境变量
    if (Object.keys(allEnvVars).length > 0) {
      const envResult = await currentProvider.setEnvVars(projectId, allEnvVars)
      if (!envResult.success) {
        return recoveryFailure(envResult.error, { ...recovery, stage: 'set-env' })
      }
    }

    // 7. 部署
    const outputDir = resolveOutputDir(appDir, currentConfig?.provider.type ?? 'vercel')
    const deployResult = await currentProvider.deploy(projectId, outputDir)
    if (!deployResult.success) {
      return recoveryFailure(deployResult.error, { ...recovery, stage: 'deploy' })
    }

    // 补充环境变量列表到结果中
    const result: DeployResult = {
      ...deployResult.data,
      envVarsSet: Object.keys(allEnvVars),
    }

    logger.info('Deployment completed', {
      url: result.url,
      deploymentId: result.deploymentId,
      status: result.status,
    })

    return ok(result)
  },
}

/**
 * 容器 Provider（docker-ssh）部署编排。
 *
 * 校验 adapter-node → 开通云资源（可选）→ 交由容器 Provider 完成
 * 打包 / 传输 / compose up / 健康检查。
 *
 * @param provider - 容器部署 Provider
 * @param appDir - 应用根目录
 * @param scan - 扫描结果
 * @param rawProjectName - 原始项目名（未归一化）
 * @param options - 部署选项
 */
async function deployContainerApp(
  provider: ContainerDeployProvider,
  appDir: string,
  scan: ScanResult,
  rawProjectName: string,
  options?: DeployAppOptions,
  appEnv: Record<string, string> = {},
): Promise<HaiResult<DeployResult>> {
  const projectName = normalizeProjectName(rawProjectName)

  let artifact
  let artifactDir = options?.artifactDir ?? resolveArtifactDirectory(appDir)
  try {
    if (existsSync(join(artifactDir, 'latest'))) {
      const latest = readFileSync(join(artifactDir, 'latest'), 'utf8').trim()
      if (!/^[a-z0-9][\w.+-]*$/i.test(latest))
        throw new Error('Invalid artifact pointer')
      artifactDir = join(artifactDir, latest)
    }
    artifact = await readDeploymentArtifact(artifactDir)
  }
  catch {
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))
  }
  if (artifact.partial && !options?.selectedServices) {
    const selectedServices = artifact.images.map(image => image.name)
    options = {
      ...options,
      selectedServices,
      serviceModes: {
        ...options?.serviceModes,
        ...Object.fromEntries(scan.requiredServices.map(service => [service, 'keep' as const])),
      },
    }
  }
  if (!options?.bundleOnly && currentConfig?.provider.type === 'docker-ssh' && !currentConfig.provider.ssh)
    return err(HaiDeployError.CONFIG_ERROR, deployM('deploy_sshRequired'))

  let provisionEnv: Record<string, string> = {}
  if (!options?.skipMiddleware) {
    const provResults = await deploy.provisionAll(projectName, options?.serviceModes ? scan.requiredServices.filter(service => usesDefaultMiddleware(scan, service, options)) : undefined)
    if (!provResults.success) {
      return err(provResults.error)
    }
    provisionEnv = mergeProvisionEnv(provResults.data, scan, options)
  }

  return provider.deploy({ appDir, artifact, artifactDir, projectName, scan, provisionEnv, appEnv, options })
}
