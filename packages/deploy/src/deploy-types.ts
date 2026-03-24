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
  ENV_VAR_FAILED: '010:500',
  NOT_INITIALIZED: '011:500',
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

// ─── Provider 接口 ───

/**
 * 部署平台 Provider 接口（Vercel / Cloudflare Pages 等）
 *
 * 通过工厂函数创建（如 `createVercelProvider()`），负责将构建产物部署到目标平台。
 */
export interface DeployProvider {
  /** Provider 名称 */
  readonly name: string

  /**
   * 验证凭证有效性
   *
   * @param token - 平台 API Token
   * @returns 用户信息摘要（如邮箱/用户名）
   */
  authenticate: (token: string) => Promise<HaiResult<string>>

  /**
   * 创建平台项目（幂等：已存在则返回现有项目 ID）
   *
   * @param projectName - 项目名称
   * @returns 项目 ID
   */
  createProject: (projectName: string) => Promise<HaiResult<string>>

  /**
   * 批量设置项目环境变量
   *
   * @param projectId - 平台项目 ID
   * @param envVars - 环境变量键值对
   */
  setEnvVars: (projectId: string, envVars: Record<string, string>) => Promise<HaiResult<void>>

  /**
   * 上传构建产物并触发部署
   *
   * @param projectId - 平台项目 ID
   * @param outputDir - 构建产物目录（如 .vercel/output/）
   * @returns 部署结果
   */
  deploy: (projectId: string, outputDir: string) => Promise<HaiResult<DeployResult>>
}

// ─── Provisioner 接口 ───

/**
 * 基础设施服务 Provisioner 接口（Neon / Upstash / R2 / Resend / Aliyun）
 *
 * 通过工厂函数创建（如 `createNeonProvisioner(config)`），负责开通/验证云服务。
 */
export interface ServiceProvisioner {
  /** Provisioner 名称 */
  readonly name: string
  /** 对应的服务类型 */
  readonly serviceType: ServiceType

  /**
   * 验证凭证有效性
   *
   * @param credentials - 凭证键值对
   * @returns 账户标识信息
   */
  authenticate: (credentials: Record<string, string>) => Promise<HaiResult<string>>

  /**
   * 开通/查找服务资源（幂等：按项目名查找已有资源）
   *
   * @param projectName - 项目名称，用作资源命名
   * @returns 开通结果（含环境变量映射）
   */
  provision: (projectName: string) => Promise<HaiResult<ProvisionResult>>
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

// ─── 模块功能接口 ───

/**
 * Deploy 模块功能接口
 *
 * 提供自动化部署的完整 API：
 * - `deploy.init()` — 初始化（加载配置、创建 Provider 和 Provisioner）
 * - `deploy.scan()` — 扫描应用依赖
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
  /** 初始化模块（加载配置、创建 Provider 和 Provisioner 实例） */
  init: (config: DeployConfigInput) => Promise<HaiResult<void>>
  /** 关闭模块 */
  close: () => Promise<void>
  /** 当前配置 */
  readonly config: DeployConfig | null
  /** 是否已初始化 */
  readonly isInitialized: boolean

  /**
   * 扫描应用目录，检测依赖和所需服务
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
