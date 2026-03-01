/**
 * @h-ai/deploy — 模块主入口
 *
 * 提供 deploy 单例对象，暴露完整的自动化部署 API。
 * @module deploy-main
 */

import type { Result } from '@h-ai/core'
import type { DeployConfig, DeployConfigInput } from './deploy-config.js'
import type {
  DeployAppOptions,
  DeployError,
  DeployFunctions,
  DeployProvider,
  DeployResult,
  ProvisionResult,
  ScanResult,
  ServiceProvisioner,
  ServiceType,
} from './deploy-types.js'
import { core, err, ok } from '@h-ai/core'
import { DeployConfigSchema, DeployErrorCode } from './deploy-config.js'
import { buildApp, resolveOutputDir } from './deploy-functions.js'
import { deployM } from './deploy-i18n.js'
import { scanApp } from './deploy-scanner.js'
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
const currentProvisioners: Map<ServiceType, ServiceProvisioner> = new Map()

// ─── 未初始化占位 ───

const notInitialized = core.module.createNotInitializedKit<DeployError>(
  DeployErrorCode.NOT_INITIALIZED,
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

// ─── 模块单例 ───

/**
 * Deploy 模块单例
 *
 * @example
 * ```ts
 * import { deploy } from '@h-ai/deploy'
 *
 * await deploy.init({ provider: { type: 'vercel', token: 'xxx' } })
 * const result = await deploy.deployApp('./apps/my-app')
 * await deploy.close()
 * ```
 */
export const deploy: DeployFunctions = {
  async init(config: DeployConfigInput): Promise<Result<void, DeployError>> {
    if (currentProvider) {
      logger.warn('Deploy module is already initialized, reinitializing')
      await deploy.close()
    }

    logger.info('Initializing deploy module')

    const parseResult = DeployConfigSchema.safeParse(config)
    if (!parseResult.success) {
      logger.error('Deploy config validation failed', { error: parseResult.error.message })
      return err({
        code: DeployErrorCode.CONFIG_ERROR,
        message: deployM('deploy_configError', { params: { error: parseResult.error.message } }),
        cause: parseResult.error,
      })
    }
    const parsed = parseResult.data

    try {
      // 创建 Provider
      const provider = createProviderByType(parsed.provider.type)
      const authResult = await provider.authenticate(parsed.provider.token)
      if (!authResult.success) {
        return err(authResult.error)
      }
      logger.info('Provider authenticated', { provider: parsed.provider.type, user: authResult.data })

      // 创建 Provisioners
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
            logger.warn('Provisioner authentication failed', {
              service: serviceType,
              provisioner: (serviceConfig as Record<string, unknown>).provisioner,
            })
            // 非致命：记录警告但继续
          }
          else {
            logger.info('Provisioner authenticated', {
              service: serviceType,
              user: provAuthResult.data,
            })
          }
          currentProvisioners.set(serviceType, provisioner)
        }
      }

      currentProvider = provider
      currentConfig = parsed
      logger.info('Deploy module initialized', {
        provider: parsed.provider.type,
        provisioners: [...currentProvisioners.keys()],
      })
      return ok(undefined)
    }
    catch (error) {
      logger.error('Deploy module initialization failed', { error })
      return err({
        code: DeployErrorCode.CONFIG_ERROR,
        message: deployM('deploy_configError', {
          params: { error: error instanceof Error ? error.message : String(error) },
        }),
        cause: error,
      })
    }
  },

  async close(): Promise<void> {
    if (!currentProvider) {
      logger.info('Deploy module already closed, skipping')
      return
    }

    logger.info('Closing deploy module')
    currentProvider = null
    currentConfig = null
    currentProvisioners.clear()
    logger.info('Deploy module closed')
  },

  get config(): DeployConfig | null {
    return currentConfig
  },

  get isInitialized(): boolean {
    return currentProvider !== null
  },

  async scan(appDir: string): Promise<Result<ScanResult, DeployError>> {
    logger.debug('Scanning application', { appDir })
    return scanApp(appDir)
  },

  async provisionAll(projectName: string): Promise<Result<ProvisionResult[], DeployError>> {
    if (!currentProvider) {
      return notInitialized.result()
    }

    logger.info('Provisioning all services', { projectName, count: currentProvisioners.size })
    const results: ProvisionResult[] = []

    for (const [serviceType, provisioner] of currentProvisioners) {
      logger.debug('Provisioning service', { serviceType, provisioner: provisioner.name })
      const provResult = await provisioner.provision(projectName)
      if (!provResult.success) {
        logger.error('Service provisioning failed', {
          serviceType,
          provisioner: provisioner.name,
          error: provResult.error,
        })
        return err(provResult.error)
      }
      results.push(provResult.data)
      logger.info('Service provisioned', { serviceType, provisioner: provisioner.name })
    }

    return ok(results)
  },

  async deployApp(
    appDir: string,
    options?: DeployAppOptions,
  ): Promise<Result<DeployResult, DeployError>> {
    if (!currentProvider) {
      return notInitialized.result()
    }

    logger.info('Starting deployment', { appDir, options })

    // 1. 扫描应用
    const scanResult = await scanApp(appDir)
    if (!scanResult.success) {
      return err(scanResult.error)
    }
    const scan = scanResult.data
    const projectName = options?.projectName ?? scan.appName

    // 2. 检查 adapter
    if (scan.isSvelteKit && !scan.adapterInstalled) {
      return err({
        code: DeployErrorCode.ADAPTER_MISSING,
        message: deployM('deploy_adapterMissing', {
          params: { adapter: '@sveltejs/adapter-vercel' },
        }),
      })
    }

    // 3. 开通基础设施
    let allEnvVars: Record<string, string> = {}
    if (!options?.skipProvision) {
      const provResults = await deploy.provisionAll(projectName)
      if (!provResults.success) {
        return err(provResults.error)
      }
      for (const prov of provResults.data) {
        allEnvVars = { ...allEnvVars, ...prov.envVars }
      }
    }

    // 4. 创建平台项目
    const projectResult = await currentProvider.createProject(projectName)
    if (!projectResult.success) {
      return err(projectResult.error)
    }
    const projectId = projectResult.data

    // 5. 设置环境变量
    if (Object.keys(allEnvVars).length > 0) {
      const envResult = await currentProvider.setEnvVars(projectId, allEnvVars)
      if (!envResult.success) {
        return err(envResult.error)
      }
    }

    // 6. 构建应用
    if (!options?.skipBuild) {
      const buildResult = buildApp(appDir, scan.buildCommand)
      if (!buildResult.success) {
        return err(buildResult.error)
      }
    }

    // 7. 部署
    const outputDir = resolveOutputDir(appDir, currentConfig?.provider.type ?? 'vercel')
    const deployResult = await currentProvider.deploy(projectId, outputDir)
    if (!deployResult.success) {
      return err(deployResult.error)
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
