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

export const HaiDeployError = core.error.buildHaiErrorsDef('deploy', DeployErrorInfo)

/**
 * 部署错误接口
 *
 * 所有部署操作返回的错误都遵循此接口。
 *
 * @example
 * ```ts
 * const result = await deploy.deployApp('./apps/my-app')
 * if (!result.success) {
 *   const error: DeployError = result.error
 *   // 根据 error.code 处理
 * }
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

/** 基础设施服务类型 */
export type ServiceType = 'db' | 'cache' | 'storage' | 'email' | 'sms' | 'vecdb' | 'ldap'

/** 每项中间件的处理方式；keep 不修改配置，也不开通服务。 */
export type MiddlewareMode = 'default' | 'custom' | 'keep'

/** 扫描环境；例如 `{ environment: 'test', envDir: '/workspace/app' }`。 */
export interface DeployScanOptions {
  /** 环境文件模式。 */
  environment?: string
  /** 环境文件目录；默认自动定位到应用或 workspace 根。 */
  envDir?: string
}

/** 依赖对应的中间件；例如 IAM 的 LDAP 位于 `iam.ldap`，可处于 disabled 状态。 */
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

/** 部署失败后的安全恢复信息，不含环境变量值或原始异常。 */
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

// ─── 部署选项 ───

/** 部署选项 */
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
  /** 只生成部署 tar，不连接 SSH；仅 docker-ssh 支持。 */
  bundleOnly?: boolean
  /** 部署 tar 输出路径；默认 .hai/deploy/<环境>/bundle-<项目>-<部署ID>-<版本>.tar，自定义文件名自动补 -<版本>。 */
  output?: string
}

// ─── 凭证子功能 ───

/**
 * Deploy 凭证文件操作。
 *
 * 这些方法仅操作 `~/.hai/credentials.yml`，不依赖 `deploy.init()`。
 */
export interface DeployCredentialOperations {
  /** 获取凭证文件绝对路径。 */
  getPath: () => string
  /** 加载凭证文件并注入 `process.env`。 */
  load: () => HaiResult<string[]>
  /** 保存单个凭证。 */
  save: (key: string, value: string) => HaiResult<void>
  /** 批量保存凭证。 */
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
 *
 * @example
 * ```ts
 * import { deploy } from '@h-ai/deploy'
 *
 * await deploy.init({ provider: { type: 'vercel', token: 'xxx' } })
 * const result = await deploy.deployApp('./apps/my-app')
 * if (result.success) {
 *   console.log(`Deployed: ${result.data.url}`)
 * }
 * await deploy.close()
 * ```
 */
export interface DeployFunctions {
  /** 全局部署凭证文件操作。 */
  readonly credentials: DeployCredentialOperations
  /** 初始化模块（加载配置、创建 Provider 和 Provisioner 实例） */
  init: (config: DeployConfigInput) => Promise<HaiResult<void>>
  /** 关闭模块 */
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
   */
  scan: (appDir: string, options?: DeployScanOptions) => Promise<HaiResult<ScanResult>>

  /**
   * 对所有已配置的 Provisioner 执行基础设施开通
   *
   * @param projectName - 用于资源命名的项目名
   * @returns 所有 Provisioner 的结果列表
   */
  provisionAll: (projectName: string, services?: ServiceType[]) => Promise<HaiResult<ProvisionResult[]>>

  /**
   * 部署已有构建产物（环境和中间件 → 打包 → 上传/启动）；不会调用构建命令。
   *
   * @param appDir - 应用根目录路径
   * @param options - 部署选项
   */
  deployApp: (appDir: string, options?: DeployAppOptions) => Promise<HaiResult<DeployResult>>
}
