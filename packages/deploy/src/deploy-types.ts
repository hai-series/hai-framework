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
  BUILD_FAILED: '003:500',
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
export type ServiceType = 'db' | 'cache' | 'storage' | 'email' | 'sms'

// ─── 扫描结果 ───

/**
 * 应用扫描结果
 *
 * 由 scanner 分析应用目录后返回，描述应用的框架类型、依赖和部署需求。
 */
export interface ScanResult {
  /** 应用名称（来自 package.json name） */
  appName: string
  /** 是否为 SvelteKit 项目 */
  isSvelteKit: boolean
  /** 目标平台 adapter 是否已安装（如 @sveltejs/adapter-vercel） */
  adapterInstalled: boolean
  /** 检测到的模块依赖需要的服务列表 */
  requiredServices: ServiceType[]
  /** 构建命令 */
  buildCommand: string
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
  status: 'ready' | 'building' | 'error'
  /** 已设置的环境变量名列表 */
  envVarsSet: string[]
}

// ─── 开通结果 ───

/**
 * 基础设施开通结果
 *
 * 由 Provisioner 开通服务后返回，包含要注入到部署平台的环境变量。
 */
export interface ProvisionResult {
  /** 服务类型 */
  serviceType: ServiceType
  /** Provisioner 名称 */
  provisionerName: string
  /** 要注入到部署平台的环境变量 */
  envVars: Record<string, string>
  /** 资源标识信息（如项目名、数据库名等），用于日志和展示 */
  resourceInfo: string
}

// ─── 部署选项 ───

/** 部署选项 */
export interface DeployAppOptions {
  /** 项目名称（默认从 package.json name 提取） */
  projectName?: string
  /** 是否跳过基础设施开通 */
  skipProvision?: boolean
  /** 是否跳过构建 */
  skipBuild?: boolean
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
  scan: (appDir: string) => Promise<HaiResult<ScanResult>>

  /**
   * 对所有已配置的 Provisioner 执行基础设施开通
   *
   * @param projectName - 用于资源命名的项目名
   * @returns 所有 Provisioner 的结果列表
   */
  provisionAll: (projectName: string) => Promise<HaiResult<ProvisionResult[]>>

  /**
   * 执行完整部署流程（provision → build → deploy）
   *
   * @param appDir - 应用根目录路径
   * @param options - 部署选项
   */
  deployApp: (appDir: string, options?: DeployAppOptions) => Promise<HaiResult<DeployResult>>
}
