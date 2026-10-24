/**
 * @h-ai/deploy — 类型定义
 *
 * 本文件定义部署模块的核心接口和类型（非配置相关）。 配置相关类型请从 deploy-config.ts 导入。
 * @module deploy-types
 */

import type { ErrorInfo, HaiResult } from '@h-ai/core'
import type { DeployConfig, DeployConfigInput } from './deploy-config.js'
import { core } from '@h-ai/core'

// ─── 错误定义（照 @h-ai/core 范式） ───

const DeployErrorInfo = {
  DEPLOY_FAILED: '001:500',
  PROJECT_CREATE_FAILED: '002:500',
  UPLOAD_FAILED: '004:500',
  AUTH_REQUIRED: '005:401',
  AUTH_FAILED: '006:401',
  PROVISION_FAILED: '007:500',
  ADAPTER_MISSING: '008:500',
  SCAN_FAILED: '009:500',
  NOT_INITIALIZED: '010:500',
  ENV_VAR_FAILED: '011:500',
  UNSUPPORTED_TYPE: '012:400',
  CONFIG_ERROR: '013:500',
  CREDENTIAL_ERROR: '014:500',
  REMOTE_CONNECT_FAILED: '017:500',
  REMOTE_COMMAND_FAILED: '018:500',
  IMAGE_TRANSFER_FAILED: '019:500',
  HEALTH_CHECK_FAILED: '020:500',
} as const satisfies ErrorInfo

/**
 *
 * @example
 * ```ts
 * import { err } from '@h-ai/core'
 * import { HaiDeployError } from '@h-ai/deploy'
 * const result = err(HaiDeployError.CONFIG_ERROR, 'Invalid deployment configuration')
 * if (!result.success && result.error.code === HaiDeployError.CONFIG_ERROR.code) {
 *   process.stderr.write(result.error.message + '\n')
 * }
 * ```
 */
export const HaiDeployError = core.error.buildHaiErrorsDef('deploy', DeployErrorInfo)

/**
 * 部署错误接口
 *
 * 用于组合错误定义、消息与可选 cause 的描述对象；业务操作返回的 error 遵循 core.HaiError，请按 success 分支读取 code/message。
 * @example
 * ```ts
 * import type { DeployError } from '@h-ai/deploy'
 * import { HaiDeployError } from '@h-ai/deploy'
 * const detail: DeployError = { def: HaiDeployError.DEPLOY_FAILED, message: 'Deployment failed' }
 * ```
 */
export interface DeployError {
  /** 错误定义 */
  def: (typeof HaiDeployError)[keyof typeof HaiDeployError]
  /** 错误消息 */
  message: string
  /** 原始错误（可选） */
  cause?: unknown
}

// ─── 服务类型 ───

/**
 * 基础设施服务类型
 * @example
 * ```ts
 * import type { ServiceType } from '@h-ai/deploy'
 * const service: ServiceType = 'db'
 * ```
 */
export type ServiceType = 'db' | 'cache' | 'storage' | 'email' | 'sms' | 'vecdb' | 'ldap'

/**
 * 每项中间件的处理方式；keep 不修改配置，也不开通服务。
 * @example
 * ```ts
 * import type { MiddlewareMode } from '@h-ai/deploy'
 * const mode: MiddlewareMode = 'keep' // 复用已有服务，不修改连接配置或自动开通。
 * ```
 */
export type MiddlewareMode = 'default' | 'custom' | 'keep'

/**
 * 扫描环境；例如 `{ environment: 'test', envDir: '/workspace/app' }`。
 * @example
 * ```ts
 * import type { DeployScanOptions } from '@h-ai/deploy'
 * const options: DeployScanOptions = { environment: 'prod', envDir: '/workspace/shop' }
 * ```
 */
export interface DeployScanOptions {
  /** 环境文件模式。 */
  environment?: string
  /** 环境文件目录；默认自动定位到应用或 workspace 根。 */
  envDir?: string
}

/**
 * 依赖对应的中间件；例如 IAM 的 LDAP 位于 `iam.ldap`，可处于 disabled 状态。
 * @example
 * ```ts
 * import type { MiddlewareRequirement } from '@h-ai/deploy'
 * const requirement: MiddlewareRequirement = { service: 'db', backend: 'postgresql', source: '@h-ai/reldb', configName: 'db', configPath: [], envPrefix: 'HAI_DB', config: { host: 'db', database: 'shop' } }
 * // config 可能含私有值；展示时只选择安全字段。
 * ```
 */
export interface MiddlewareRequirement {
  /** 中间件类别。 */
  service: ServiceType
  /** 生效后端标识。 */
  backend: string
  /** 检测来源（依赖包或配置名），用于解释为何需要此项。 */
  source: string
  /** 模块配置名。 */
  configName: string
  /** 模块配置内的路径；例如 LDAP 为 ['ldap']。 */
  configPath: string[]
  /** 约定变量前缀。 */
  envPrefix: string
  /** 生效连接配置，可能含凭据，仅用于输入默认值，不得原样输出日志。 */
  config: Record<string, unknown>
}

// ─── 扫描结果 ───

/**
 * 应用扫描结果
 *
 * 由 scanner 分析应用目录后返回，描述应用的框架类型、依赖和部署需求。
 * 扫描是文件系统能力，不依赖 init，也不代表远程服务已经连通。
 * @example
 * ```ts
 * import type { ScanResult } from '@h-ai/deploy'
 * import { deploy } from '@h-ai/deploy'
 * const result = await deploy.scan(process.cwd(), { environment: 'prod' })
 * if (!result.success) throw new Error(result.error.message)
 * const scan: ScanResult = result.data
 * const services = scan.requiredServices
 * ```
 */
export interface ScanResult {
  /** 调用者指定的部署目录，对应 lockfile 中的一个 importer。 */
  appDir?: string
  /** 公共环境文件目录。 */
  envDir?: string
  /** 依赖与配置共同确定的中间件详情。 */
  middlewares?: MiddlewareRequirement[]
  /** 从运行依赖图识别的 Hai 模块；peer 和开发依赖不启用模块。 */
  haiModules?: string[]
  /** 应用名称（目录名称；可用 projectName 显式覆盖部署资源名）。 */
  appName: string
  /** 是否为 SvelteKit 项目 */
  isSvelteKit: boolean
  /** 目标平台 adapter 是否已安装（如 @sveltejs/adapter-vercel） */
  adapterInstalled: boolean
  /** 容器部署所需的 @sveltejs/adapter-node 是否已安装 */
  nodeAdapterInstalled: boolean
  /** 检测到的模块依赖需要的服务列表 */
  requiredServices: ServiceType[]
  /** 各服务检测到的后端类型（如 db→postgresql/mysql，vecdb→qdrant），用于生成匹配的 sidecar */
  serviceBackends: Partial<Record<ServiceType, string>>
}

// ─── 部署结果 ───

/**
 * 部署结果
 *
 * 包含部署后的访问 URL、状态和已设置的环境变量。
 * @example
 * ```ts
 * import type { DeployResult } from '@h-ai/deploy'
 * const packaged: DeployResult = { url: '', deploymentId: 'deploy-shop-001', status: 'packaged', bundlePath: '/workspace/shop/.hai/deploy/shop-1.0.0.tar', envVarsSet: [], provider: 'docker-ssh', healthCheck: 'skipped' }
 * // packaged 只代表交付包生成；不将其展示为服务已上线。
 * ```
 */
export interface DeployResult {
  /** 部署后的访问 URL */
  url: string
  /** 部署 ID */
  deploymentId: string
  /** 部署状态 */
  status: 'ready' | 'packaged' | 'building' | 'error'
  /** Compose 部署 tar 的绝对路径；包含私有配置，应安全传输。 */
  bundlePath?: string
  /** 手工搬运和启动说明；仅打包不代表服务器已运行。 */
  instructions?: string
  /** 已设置的环境变量名列表 */
  envVarsSet: string[]
  /** 部署 Provider 名称（如 vercel / docker-ssh），容器部署时返回 */
  provider?: string
  /** 健康检查结果：passed 表示 HTTP 探测成功，container-only 表示仅确认容器运行 */
  healthCheck?: 'passed' | 'container-only' | 'skipped'
}

// ─── 开通结果 ───

/**
 * 基础设施开通结果
 *
 * 由 Provisioner 开通服务后返回，包含要注入到部署平台的环境变量。
 * @example
 * ```ts
 * import type { ProvisionResult } from '@h-ai/deploy'
 * const reused: ProvisionResult = { resourceStatus: 'reused', serviceType: 'db', provisionerName: 'neon', envVars: { HAI_DB_TYPE: 'postgresql' }, resourceInfo: 'Existing shop database' }
 * // envVars 可能含密码；不能直接输出。
 * ```
 */
export interface ProvisionResult {
  /** 本次新建或复用；凭证型服务始终为 reused */
  resourceStatus: 'created' | 'reused'
  /** 服务类型 */
  serviceType: ServiceType
  /** Provisioner 名称 */
  provisionerName: string
  /** 要注入到部署平台的环境变量 */
  envVars: Record<string, string>
  /** 资源标识信息（如项目名、数据库名等），用于日志和展示 */
  resourceInfo: string
}

/**
 * 部署失败后的安全恢复信息，不含环境变量值或原始异常。
 * @example
 * ```ts
 * import type { DeployRecoveryInfo } from '@h-ai/deploy'
 * const recovery: DeployRecoveryInfo = { projectName: 'shop', stage: 'provision', resources: [{ serviceType: 'db', provisionerName: 'neon', resourceInfo: 'shop', resourceStatus: 'unknown' }] }
 * // 先在供应商控制台核对 unknown 资源；避免重复创建计费资源。
 * ```
 */
export interface DeployRecoveryInfo {
  projectName: string
  stage: string
  platformProjectId?: string
  resources: Array<{
    serviceType: ServiceType
    provisionerName: string
    resourceInfo: string
    resourceStatus: 'created' | 'reused' | 'unknown'
  }>
}

/**
 * 命令失败后的已核验执行状态；远端 finished 仅指部署脚本及恢复已完成，不代表容器停止。
 * @example
 * ```ts
 * import type { DeployCommandState } from '@h-ai/deploy'
 * const state: DeployCommandState = { reason: 'timeout', localTermination: 'confirmed', remoteExecution: 'unknown', deploymentId: 'deploy-shop-001', resultFile: '/opt/hai/apps/shop/results/deploy-shop-001' }
 * if (state.remoteExecution === 'unknown') process.stderr.write('Verify the matching remote deployment result before retrying\n')
 * ```
 */
export interface DeployCommandState {
  /** 失败触发原因。 */
  reason: 'timeout' | 'output' | 'input' | 'spawn' | 'exit' | 'configuration'
  /** 本地受管理树已全部退出、无法证明，或尚未启动。 */
  localTermination: 'confirmed' | 'unknown' | 'not-started'
  /** SSH 失败默认 unknown；读取匹配部署 ID 的完整终态结果后才为 finished。 */
  remoteExecution?: 'unknown' | 'finished'
  /** 本次不可变部署 ID，可与服务器结果核对。 */
  deploymentId?: string
  /** 服务器端结果文件；无凭据。 */
  resultFile?: string
  /** 匹配终态结果中的真实脚本退出码。 */
  remoteExitCode?: number
  /** 匹配终态结果中的最后阶段。 */
  remoteStage?: string
}

// ─── 部署选项 ───

/**
 * 部署选项
 * 仅更新指定服务时仍受完整/部分制品与首次部署约束；bundleOnly 不触发 SSH。
 * @example
 * ```ts
 * import type { DeployAppOptions } from '@h-ai/deploy'
 * const options: DeployAppOptions = { environment: 'prod', bundleOnly: true, artifactDir: '.hai/build/docker/build-id', selectedServices: ['app'], output: '.hai/deploy/shop.tar' }
 * ```
 */
export interface DeployAppOptions {
  /** 接收实际执行阶段，用于终端进度显示；不包含凭据或配置原文。 */
  onProgress?: (stage: 'packaging' | 'preflight' | 'images' | 'dependencies' | 'start' | 'health' | 'complete') => void
  /** 只更新指定的 Compose 服务；省略时完整制品部署全部，部分制品只部署其镜像。 */
  selectedServices?: string[]
  /** 打包中间件镜像所用的本地引擎，auto 优先 Podman。 */
  runtime?: 'auto' | 'podman' | 'docker'
  /** 部署环境标识；显式指定时必须存在 .env.<environment>。 */
  environment?: string
  /** 环境文件所在目录，默认自动定位。 */
  envDir?: string
  /** 按服务或变量前缀选择处理方式；如 HAI_REACH_PROVIDERS_1 可独立于另一邮件连接。 */
  serviceModes?: Partial<Record<string, MiddlewareMode>>
  /** 项目名称（默认使用明确指定的部署目录名称）。 */
  projectName?: string
  /** 是否跳过全部中间件配置与开通，默认 false；例如配置完备时设为 true。 */
  skipMiddleware?: boolean
  /** 已构建镜像目录；默认最近构建入口/锁文件目录下的 .hai/build/docker。 */
  artifactDir?: string
  /** 只生成独立交付目录（含 tar 和部署脚本），不连接 SSH；仅 docker-ssh 支持。 */
  bundleOnly?: boolean
  /** 交付包命名路径；默认在 .hai/deploy/<环境>/bundle-<项目>-<部署ID>-<版本>/ 中输出同名 tar 和脚本，自定义 release.tar 输出 release-<版本>/release-<版本>.tar；已有目录拒绝覆盖。 */
  output?: string
}

// ─── 凭证子功能 ───

/**
 * Deploy 凭证文件操作。
 *
 * 这些方法仅操作 `~/.hai/credentials.yml`，不依赖 `deploy.init()`。
 * @example
 * ```ts
 * import type { DeployCredentialOperations } from '@h-ai/deploy'
 * import { deploy } from '@h-ai/deploy'
 * const credentials: DeployCredentialOperations = deploy.credentials
 * const path = credentials.getPath() // 无需先 init。
 * ```
 */
export interface DeployCredentialOperations {
  /**
   * 获取凭证文件绝对路径。
   * @example
   * ```ts
   * import { deploy } from '@h-ai/deploy'
   * const path = deploy.credentials.getPath() // 当前用户的全局凭证文件。
   * ```
   */
  getPath: () => string
  /**
   * 加载凭证文件并注入 `process.env`。
   * @example
   * ```ts
   * import { deploy } from '@h-ai/deploy'
   * const loaded = deploy.credentials.load()
   * if (!loaded.success) throw new Error(loaded.error.message)
   * const names = loaded.data // 不输出被注入的值。
   * ```
   */
  load: () => HaiResult<string[]>
  /**
   * 保存单个凭证。
   * @example
   * ```ts
   * import { deploy } from '@h-ai/deploy'
   * const token = process.env.HAI_DEPLOY_PROVIDER_TOKEN
   * if (!token) throw new Error('Provide HAI_DEPLOY_PROVIDER_TOKEN privately')
   * const saved = deploy.credentials.save('HAI_DEPLOY_PROVIDER_TOKEN', token)
   * if (!saved.success) throw new Error(saved.error.message)
   * ```
   */
  save: (key: string, value: string) => HaiResult<void>
  /**
   * 批量保存凭证。
   * @example
   * ```ts
   * import { deploy } from '@h-ai/deploy'
   * const token = process.env.HAI_DEPLOY_PROVIDER_TOKEN
   * if (!token) throw new Error('Provide HAI_DEPLOY_PROVIDER_TOKEN privately')
   * const saved = deploy.credentials.saveAll({ HAI_DEPLOY_PROVIDER_TOKEN: token })
   * if (!saved.success) throw new Error(saved.error.message)
   * ```
   */
  saveAll: (entries: Record<string, string>) => HaiResult<void>
}

// ─── 模块功能接口 ───

/**
 * Deploy 模块功能接口
 *
 * 提供自动化部署的完整 API：
 * - `deploy.credentials.*()` — 凭证文件读写（不依赖 init）
 * - `deploy.init()` — 初始化（加载配置、创建 Provider 和 Provisioner）
 * - `deploy.scan()` — 扫描应用依赖（纯文件系统能力，不依赖 init）
 * - `deploy.provisionAll()` — 开通所有已配置的基础设施
 * - `deploy.deployApp()` — 完整部署流程
 * - `deploy.close()` — 关闭模块
 * scan 与 credentials 不需要 init；部署与开通遵循 init → 检查结果 → use → finally close。close 返回 Promise<void>，不伪造 HaiResult。
 * @example
 * ```ts
 * import type { DeployFunctions } from '@h-ai/deploy'
 * import { deploy } from '@h-ai/deploy'
 * const operations: DeployFunctions = deploy
 * const scan = await operations.scan(process.cwd())
 * if (!scan.success) throw new Error(scan.error.message)
 * const required = scan.data.requiredServices
 * ```
 */
export interface DeployFunctions {
  /** 全局部署凭证文件操作。 */
  readonly credentials: DeployCredentialOperations
  /**
   * 初始化模块（加载配置、创建 Provider 和 Provisioner 实例）
   * @example
   * ```ts
   * import { deploy } from '@h-ai/deploy'
   * const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const ready = deploy.isInitialized
   * }
   * finally {
   *   await deploy.close()
   * }
   * ```
   */
  init: (config: DeployConfigInput) => Promise<HaiResult<void>>
  /**
   * 关闭模块
   * @example
   * ```ts
   * import { deploy } from '@h-ai/deploy'
   * const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   const provider = deploy.config?.provider.type
   * }
   * finally {
   *   await deploy.close() // Promise<void>；不检查不存在的 success 字段。
   * }
   * ```
   */
  close: () => Promise<void>
  /** 当前配置 */
  readonly config: DeployConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean

  /**
   * 扫描应用目录，检测依赖和所需服务。
   *
   * 这是纯文件系统分析能力，不依赖云端认证状态，可在 `deploy.init()` 之前调用。
   *
   * @param appDir - 应用根目录路径
   * @example
   * ```ts
   * import { deploy } from '@h-ai/deploy'
   * const scanned = await deploy.scan(process.cwd(), { environment: 'prod' })
   * if (!scanned.success) throw new Error(scanned.error.message)
   * const services = scanned.data.requiredServices // 无需 init。
   * ```
   */
  scan: (appDir: string, options?: DeployScanOptions) => Promise<HaiResult<ScanResult>>

  /**
   * 对所有已配置的 Provisioner 执行基础设施开通
   *
   * @param projectName - 用于资源命名的项目名
   * @returns 所有 Provisioner 的结果列表
   * @example
   * ```ts
   * import { deploy, getDeployRecovery } from '@h-ai/deploy'
   * const apiKey = process.env.HAI_DEPLOY_SERVICES_DB_APIKEY
   * if (!apiKey) throw new Error('Provide HAI_DEPLOY_SERVICES_DB_APIKEY privately')
   * const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 8080 } }, services: { db: { provisioner: 'neon', apiKey } } })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   // 会访问真实云服务并可能新建资源。
   *   const result = await deploy.provisionAll('shop', ['db'])
   *   if (!result.success) {
   *     const recovery = getDeployRecovery(result.error)
   *     if (recovery?.resources.some(resource => resource.resourceStatus === 'unknown')) {
   *       process.stderr.write('Verify unknown resources at the provider before retrying\n')
   *     }
   *     throw new Error(result.error.message)
   *   }
   * }
   * finally {
   *   await deploy.close()
   * }
   * ```
   */
  provisionAll: (projectName: string, services?: ServiceType[]) => Promise<HaiResult<ProvisionResult[]>>

  /**
   * 部署已有构建产物（环境和中间件 → 打包 → 上传/启动）；不会调用构建命令。
   *
   * @param appDir - 应用根目录路径
   * @param options - 部署选项
   * @example
   * ```ts
   * import { deploy } from '@h-ai/deploy'
   * const initialized = await deploy.init({ provider: { type: 'docker-ssh', expose: { hostPort: 8080 } } })
   * if (!initialized.success) throw new Error(initialized.error.message)
   * try {
   *   // 当前项目必须已有构建镜像清单与生产环境配置。
   *   const result = await deploy.deployApp(process.cwd(), { environment: 'prod', bundleOnly: true })
   *   if (!result.success) throw new Error(result.error.message)
   *   const status = result.data.status // packaged 不代表线上运行。
   * }
   * finally {
   *   await deploy.close()
   * }
   * ```
   */
  deployApp: (appDir: string, options?: DeployAppOptions) => Promise<HaiResult<DeployResult>>
}
