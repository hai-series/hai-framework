import type { HaiResult, Logger } from '@h-ai/core'
import type { ContainerDeployProvider } from './container/deploy-container-types.js'
import type { DeployConfig } from './deploy-config.js'
import type { DeployProvider, ServiceProvisioner } from './deploy-internal-types.js'
import type { DeployAppOptions, DeployFunctions, DeployRecoveryInfo, DeployResult, ProvisionResult, ScanResult, ServiceType } from './deploy-types.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { core } from '@h-ai/core'
import { readDeploymentArtifact } from './deploy-artifact.js'
import { validateComposeServices } from './deploy-config.js'
import { generatedVariables, loadDeploymentEnvironment, saveDeploymentEnvironment } from './deploy-environment.js'
import { normalizeProjectName, resolveArtifactDirectory, resolveOutputDir, resolveProjectDirectory, usesDefaultMiddleware } from './deploy-functions.js'
import { deployM } from './deploy-i18n.js'
import { mergeProvisionEnv } from './deploy-middleware-environment.js'
import { getDeployRecovery, recoveryFailure } from './deploy-recovery.js'
import { scanApp } from './deploy-scanner.js'
import { HaiDeployError } from './deploy-types.js'

const notInitialized = core.module.createNotInitializedKit(
  HaiDeployError.NOT_INITIALIZED,
  () => deployM('deploy_notInitialized'),
)

/**
 * 当前的部署资源。通过 getter 读取可在异步阶段之间变化的 Provider 与配置。
 * @example 模块内部上下文
 * ```ts
 * function run(state: DeployWorkflowState, logger: Logger) {
 *   return createDeployWorkflow(state, logger).deployApp('/srv/shop')
 * }
 * ```
 */
interface DeployWorkflowState {
  readonly config: DeployConfig | null
  readonly provider: DeployProvider | null
  readonly containerProvider: ContainerDeployProvider | null
  readonly provisioners: ReadonlyMap<ServiceType, ServiceProvisioner>
  readonly provisionAll: DeployFunctions['provisionAll']
}

/**
 * 编排基础设施开通与应用部署，跨异步阶段沿用模块当前的 Provider 与配置。
 * @example 模块内部上下文
 * ```ts
 * function provisionDatabase(state: DeployWorkflowState, logger: Logger) {
 *   return createDeployWorkflow(state, logger).provisionAll('shop', ['db'])
 * }
 * ```
 */
export function createDeployWorkflow(state: DeployWorkflowState, logger: Logger): Pick<DeployFunctions, 'provisionAll' | 'deployApp'> {
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
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))
    }
    const compose = validateComposeServices(state.config?.container, artifact)
    if (!compose.success)
      return compose
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
    if (!options?.bundleOnly && state.config?.provider.type === 'docker-ssh' && !state.config.provider.ssh)
      return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_sshRequired'))

    let provisionEnv: Record<string, string> = {}
    if (!options?.skipMiddleware) {
      const provResults = await state.provisionAll(projectName, options?.serviceModes
        ? scan.requiredServices.filter(service => usesDefaultMiddleware(scan, service, options))
        : undefined)
      if (!provResults.success) {
        return core.err(provResults.error)
      }
      provisionEnv = mergeProvisionEnv(provResults.data, scan, options)
    }

    return provider.deploy({
      appDir,
      artifact,
      artifactDir,
      projectName,
      scan,
      provisionEnv,
      appEnv,
      options,
    })
  }

  return {
    async provisionAll(projectName: string, services?: ServiceType[]): Promise<HaiResult<ProvisionResult[]>> {
      if (!state.provider && !state.containerProvider) {
        return notInitialized.result()
      }

      logger.info('Provisioning all services', { projectName, count: state.provisioners.size })
      const results: ProvisionResult[] = []

      for (const [serviceType, provisioner] of state.provisioners) {
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
                {
                  serviceType,
                  provisionerName: provisioner.name,
                  resourceInfo: projectName,
                  resourceStatus: 'unknown' as const,
                },
              ]),
            ],
          })
        }
        results.push(provResult.data)
        logger.info('Service provisioned', { serviceType, provisioner: provisioner.name })
      }

      return core.ok(results)
    },

    async deployApp(
      appDir: string,
      options?: DeployAppOptions,
    ): Promise<HaiResult<DeployResult>> {
      if (!state.provider && !state.containerProvider) {
        return notInitialized.result()
      }

      logger.info('Starting deployment', { appDir, environment: options?.environment })

      // 1. 扫描应用
      const scanOptions = { ...options, environment: options?.environment ?? state.config?.environment }
      const scanResult = await scanApp(appDir, scanOptions)
      if (!scanResult.success) {
        return core.err(scanResult.error)
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
          return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_configFileInvalid', {
            params: { path: projectFile, line: '1' },
          }))
        }
      }
      const appEnv = Object.fromEntries(Object.entries(environment.data.values).filter(([key]) => key !== 'HAI_DEPLOY' && !connectionVariables.has(key) && !key.startsWith('HAI_CLI_') && (!key.startsWith('HAI_DEPLOY_') || key === 'HAI_DEPLOY_ENVIRONMENT')))
      const projectName = `${normalizeProjectName(scan.appName)}${scanOptions.environment
        ? `-${environment.data.environment}`
        : ''}`
      options = {
        ...options,
        ...(scanOptions.environment
          ? { environment: environment.data.environment }
          : {}),
        ...(options?.skipMiddleware
          ? {
              serviceModes: Object.fromEntries(scan.requiredServices.map(service => [service, 'keep' as const])),
            }
          : {}),
      }
      if (options.selectedServices) {
        options.serviceModes = {
          ...options.serviceModes,
          ...Object.fromEntries(scan.requiredServices.filter(service => !options.selectedServices!.includes(service)).map(service => [service, 'keep' as const])),
        }
      }

      // 容器 Provider（docker-ssh）：走独立的容器部署编排
      if (state.containerProvider) {
        return deployContainerApp(state.containerProvider, appDir, scan, projectName, options, appEnv)
      }

      if (options?.bundleOnly)
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_bundleOnlyContainer'))
      if (options.selectedServices)
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_selectedContainerOnly'))

      // 到此必为平台 Provider（vercel）
      if (!state.provider) {
        return notInitialized.result()
      }

      // 2. 检查 adapter
      if (scan.isSvelteKit && !scan.adapterInstalled) {
        return core.err(
          HaiDeployError.ADAPTER_MISSING,
          deployM('deploy_adapterMissing', {
            params: { adapter: '@sveltejs/adapter-vercel' },
          }),
        )
      }

      if (!existsSync(resolveOutputDir(appDir, 'vercel')))
        return core.err(HaiDeployError.CONFIG_ERROR, deployM('deploy_artifactInvalid'))

      // 3. 开通基础设施
      let allEnvVars: Record<string, string> = appEnv
      const recovery: DeployRecoveryInfo = { projectName, stage: 'provision', resources: [] }
      if (!options?.skipMiddleware) {
        const provResults = await state.provisionAll(projectName, options?.serviceModes
          ? scan.requiredServices.filter(service => usesDefaultMiddleware(scan, service, options))
          : undefined)
        if (!provResults.success) {
          return core.err(provResults.error)
        }
        recovery.resources = provResults.data.map(({ envVars: _envVars, ...resource }) => resource)
        allEnvVars = {
          ...allEnvVars,
          ...mergeProvisionEnv(provResults.data, scan, options),
        }
        if (options?.environment) {
          const saved = saveDeploymentEnvironment(environment.data, mergeProvisionEnv(provResults.data, scan, options))
          if (!saved.success)
            return recoveryFailure(saved.error, { ...recovery, stage: 'save-env' })
        }
      }

      allEnvVars = generatedVariables(allEnvVars)

      // 4. 创建平台项目
      const projectResult = await state.provider.createProject(projectName)
      if (!projectResult.success) {
        return recoveryFailure(projectResult.error, { ...recovery, stage: 'create-project' })
      }
      const projectId = projectResult.data
      recovery.platformProjectId = projectId

      // 5. 设置环境变量
      if (Object.keys(allEnvVars).length > 0) {
        const envResult = await state.provider.setEnvVars(projectId, allEnvVars)
        if (!envResult.success) {
          return recoveryFailure(envResult.error, { ...recovery, stage: 'set-env' })
        }
      }

      // 7. 部署
      const outputDir = resolveOutputDir(appDir, state.config?.provider.type ?? 'vercel')
      const deployResult = await state.provider.deploy(projectId, outputDir)
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

      return core.ok(result)
    },
  }
}
