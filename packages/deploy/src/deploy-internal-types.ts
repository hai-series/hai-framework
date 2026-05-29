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
 * 部署平台 Provider 接口（Vercel / Cloudflare Pages 等）。
 *
 * 仅用于模块内部实现，不向包消费者暴露。
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
   * 创建平台项目（幂等：已存在则返回现有项目 ID）。
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
   * 开通或复用服务资源（幂等：按项目名查找已有资源）。
   *
   * @param projectName - 项目名称，用作资源命名
   * @returns 开通结果（含环境变量映射）
   */
  provision: (projectName: string) => Promise<HaiResult<ProvisionResult>>
}
