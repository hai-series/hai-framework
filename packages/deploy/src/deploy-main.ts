import type { HaiResult } from '@h-ai/core'
import type { ContainerDeployProvider } from './container/deploy-container-types.js'
import type { DeployConfig, DeployConfigInput } from './deploy-config.js'
import type { DeployProvider, ServiceProvisioner } from './deploy-internal-types.js'
import type {
  DeployCredentialOperations,
  DeployFunctions,
  DeployScanOptions,
  ScanResult,
  ServiceType,
} from './deploy-types.js'
/**
 * @h-ai/deploy — 模块主入口
 *
 * 提供 deploy 单例对象，暴露完整的自动化部署 API。
 * @module deploy-main
 */

import { core } from '@h-ai/core'
import { artifactChecksum, readDeploymentArtifact } from './deploy-artifact.js'

import { buildReceipt, verifyBuildReceipt } from './deploy-build-receipt.js'
import { DeployConfigSchema } from './deploy-config.js'
import {
  getCredentialsPath,
  loadCredentials,
  saveCredential,
  saveCredentials,
} from './deploy-credentials.js'
import { resolveDownloadProxy, resolveImageReference } from './deploy-download.js'
import { loadDeploymentConfig, loadDeploymentEnvironment, mergeEnvironmentLayers, saveDeploymentEnvironment } from './deploy-environment.js'

import { normalizeProjectName } from './deploy-functions.js'
import { deployM } from './deploy-i18n.js'
import { canKeepMiddleware, parseMiddlewareField, saveMiddlewareEnvironment, validateMiddlewareField } from './deploy-middleware-environment.js'
import { describeMiddlewareBackend } from './deploy-middleware.js'
import { createDeploymentPlan } from './deploy-plan.js'
import { getDeployCommandState, getDeployRecovery } from './deploy-recovery.js'

import { executeBundle, verifyDeployment } from './deploy-release.js'
import { scanApp } from './deploy-scanner.js'
import { HaiDeployError } from './deploy-types.js'
import { createDeployWorkflow } from './deploy-workflow.js'
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
      throw new Error(deployM('deploy_unsupportedProviderType', {
        params: { type },
      }))
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
      throw new Error(deployM('deploy_unsupportedProvisionerType', {
        params: { type: provisioner },
      }))
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

const workflow = createDeployWorkflow({
  get config() { return currentConfig },
  get provider() { return currentProvider },
  get containerProvider() { return currentContainerProvider },
  provisioners: currentProvisioners,
  provisionAll: provisionForDeployment,
}, logger)

// ─── 模块单例 ───

/**
 * Deploy 模块单例
 * 每次 init 检查 HaiResult；只打包不会连接 SSH，成功打包也不代表服务器已部署。远端 unknown 必须先核对匹配部署 ID 的结果，不能盲目重试。
 * @example
 * ```ts
 * import { deploy } from '@h-ai/deploy'
 * const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } })
 * if (!initialized.success) throw new Error(initialized.error.message)
 * try {
 *   // 当前项目已有镜像产物与部署环境；只打包，不连接服务器。
 *   const result = await deploy.deployApp(process.cwd(), { environment: 'prod', bundleOnly: true })
 *   if (!result.success) {
 *     const state = deploy.getDeployCommandState(result.error)
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
  // 独立工具保持原有调用契约，不依赖模块初始化状态。
  artifactChecksum,
  canKeepMiddleware,
  createDeploymentPlan,
  describeMiddlewareBackend,
  getDeployCommandState,
  getDeployRecovery,
  loadDeploymentConfig,
  loadDeploymentEnvironment,
  mergeEnvironmentLayers,
  normalizeProjectName,
  parseMiddlewareField,
  readDeploymentArtifact,
  resolveDownloadProxy,
  resolveImageReference,
  saveDeploymentEnvironment,
  saveMiddlewareEnvironment,
  validateMiddlewareField,
  credentials: deployCredentials,
  buildReceipt,
  verifyBuildReceipt,
  executeBundle,
  verifyDeployment,

  async init(config: DeployConfigInput): Promise<HaiResult<void>> {
    // 并发初始化防护：避免多次 init 同时执行导致资源泄漏
    if (initInProgress) {
      logger.warn('Deploy init already in progress, skipping concurrent call')
      return core.err(
        HaiDeployError.CONFIG_ERROR,
        deployM('deploy_configError', {
          params: { error: 'init already in progress' },
        }),
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
        return core.err(
          HaiDeployError.CONFIG_ERROR,
          deployM('deploy_configError', {
            params: { error: parseResult.error.message },
          }),
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
          if (!authResult.success)
            return core.err(authResult.error)
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
                errorCode: provAuthResult.error.code,
                traceId: provAuthResult.error.traceId,
              })
              currentProvisioners.clear()
              return core.err(provAuthResult.error)
            }
            logger.info('Provisioner authenticated', {
              service: serviceType,
              provisioner: provisioner.name,
            })
            currentProvisioners.set(serviceType, provisioner)
          }
        }

        currentProvider = provider
        currentContainerProvider = containerProvider
        currentConfig = parsed
        logger.info('Deploy module initialized', {
          provider: parsed.provider.type,
          provisioners: [
            ...currentProvisioners.keys(),
          ],
        })
        return core.ok(undefined)
      }
      catch (error) {
        // 清理部分赋值的状态
        currentProvider = null
        currentContainerProvider = null
        currentConfig = null
        currentProvisioners.clear()
        logger.error('Deploy module initialization failed', { error })
        return core.err(
          HaiDeployError.CONFIG_ERROR,
          deployM('deploy_configError', {
            params: {
              error: error instanceof Error
                ? error.message
                : String(error),
            },
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

  provisionAll: workflow.provisionAll,
  deployApp: workflow.deployApp,
}

function provisionForDeployment(projectName: string, services?: ServiceType[]) {
  return deploy.provisionAll(projectName, services)
}
