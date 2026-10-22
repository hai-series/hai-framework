/**
 * @h-ai/deploy — 内部类型
 *
 * 定义仅供 deploy 模块内部实现使用的 Provider / Provisioner 接口。
 * 这些类型不从包入口导出，避免把云厂商实现细节暴露给模块使用方。
 * @internal
 */

import type { HaiResult } from '@h-ai/core'
import type { DeployResult, ProvisionResult, ServiceType } from './deploy-types.js'

/**
 * 部署平台 Provider 接口（当前为 Vercel）。
 *
 * 仅用于模块内部实现，不向包消费者暴露。
 * 当前平台 Provider 为 Vercel；docker-ssh 使用单独的 ContainerDeployProvider，不冒充静态上传平台。
 * @example 模块内部上下文
 * ```ts
 * const { createVercelProvider } = await import('./providers/deploy-provider-vercel.js')
 * const provider: DeployProvider = createVercelProvider()
 * const token = process.env.HAI_DEPLOY_PROVIDER_TOKEN
 * if (!token) throw new Error('Provide HAI_DEPLOY_PROVIDER_TOKEN privately')
 * const authenticated = await provider.authenticate(token)
 * if (!authenticated.success) throw new Error(authenticated.error.message)
 * ```
 */
export interface DeployProvider {
  /** Provider 名称 */
  readonly name: string

  /**
   * 验证凭证有效性。
   *
   * @param token - 平台 API Token
   * @returns 用户信息摘要（如邮箱/用户名）
   */
  authenticate: (token: string) => Promise<HaiResult<string>>

  /**
   * 按名称查找或创建平台项目；故障后可能需要核对远端结果，不能保证并发创建 exactly-once。
   *
   * @param projectName - 项目名称
   * @returns 项目 ID
   */
  createProject: (projectName: string) => Promise<HaiResult<string>>

  /**
   * 批量设置项目环境变量。
   *
   * @param projectId - 平台项目 ID
   * @param envVars - 环境变量键值对
   */
  setEnvVars: (projectId: string, envVars: Record<string, string>) => Promise<HaiResult<void>>

  /**
   * 上传构建产物并触发部署。
   *
   * @param projectId - 平台项目 ID
   * @param outputDir - 构建产物目录（如 .vercel/output/）
   * @returns 部署结果
   */
  deploy: (projectId: string, outputDir: string) => Promise<HaiResult<DeployResult>>
}

/**
 * 基础设施服务 Provisioner 接口（Neon / Upstash / R2 / Resend / Aliyun）。
 *
 * 仅用于模块内部实现，不向包消费者暴露。
 * 远端操作可能创建计费资源；网络故障后的 unknown 需人工核对，不能仅凭按名称查找就宣称跨节点 exactly-once。
 * @example 模块内部上下文
 * ```ts
 * const { createNeonProvisioner } = await import('./provisioners/deploy-provisioner-neon.js')
 * const provisioner: ServiceProvisioner = createNeonProvisioner()
 * const apiKey = process.env.HAI_DEPLOY_SERVICES_DB_APIKEY
 * if (!apiKey) throw new Error('Provide HAI_DEPLOY_SERVICES_DB_APIKEY privately')
 * const authenticated = await provisioner.authenticate({ apiKey })
 * if (!authenticated.success) throw new Error(authenticated.error.message)
 * const result = await provisioner.provision('shop')
 * if (!result.success) throw new Error(result.error.message)
 * ```
 */
export interface ServiceProvisioner {
  /** Provisioner 名称 */
  readonly name: string
  /** 对应的服务类型 */
  readonly serviceType: ServiceType

  /**
   * 验证凭证有效性。
   *
   * @param credentials - 凭证键值对
   * @returns 账户标识信息
   */
  authenticate: (credentials: Record<string, string>) => Promise<HaiResult<string>>

  /**
   * 按供应商能力开通或复用资源；返回 unknown 恢复状态时先核对远端结果，不盲目重试。
   *
   * @param projectName - 项目名称，用作资源命名
   * @returns 开通结果（含环境变量映射）
   */
  provision: (projectName: string) => Promise<HaiResult<ProvisionResult>>
}
